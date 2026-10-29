// background.js — service worker orchestrator (v1.1).
// Combines: scroll intensity, active-time sessions, tab circuit breaker,
// domain locks, media-dwell + search-churn detection, and a browser-wide
// escalation ladder (none -> grey -> blur -> block) pushed to every watched
// tab. All local; nothing leaves the machine.

import { ScrollEngine } from "./src/scrollEngine.js";
import { SessionEngine } from "./src/sessionEngine.js";
import { TabBreaker } from "./src/tabBreaker.js";
import { PressureEngine } from "./src/pressureEngine.js";
import { loadConfig, inLateNight, DEFAULT_CONFIG } from "./src/config.js";
import { hostFromUrl, isAllowlisted, isSystemUrl, normalizeHost, makeHostMatcher } from "./src/allowlist.js";
import { isAdultHost } from "./src/adultList.js";
import "./src/adultSignals.js";            // plain script: sets globalThis.TGAdultSignals
import { t as i18nT } from "./assets/i18n.js";
import { IMPORT_KEY, IMPORT_NEXT_KEY, LISTS_KEY, makeImportMatcher, parseImport, listsMerged, dueLists, migrateImports } from "./src/importList.js";
import "./src/bypass.js";                  // plain script: sets self.TGBypass
import { applyDue } from "./src/loosen.js";
import { isEssentialHost } from "./src/essential.js";
// OPTIONAL, EXPERIMENTAL: Touch Grass link. Inert unless the user grants the
// optional nativeMessaging permission in Settings → Experimental.
import { startTouchGrassLink } from "./src/touchGrass.js";

const scroll = new ScrollEngine();
const sessions = new SessionEngine();
const breaker = new TabBreaker();
let pressure = null;

let cfg = null;
let mAllow = null, mAcademic = null, mBlock = null, mStreaming = null;
const BREAKER_KEY = "tabguardBreakerState";
const EXIT_KEY = "tabguardExitState";
let mImport = null;                        // imported block list (Cold Turkey etc.)
const PRESSURE_KEY = "tabguardPressureState";

let mFullBlur = null;
// ---- waiting room ---------------------------------------------------------------
// Sites on this list open only after a short wait on a calm page with one
// question. Once through, the site is free for a while (openMinutes). The wait
// is timed here, not in the page, so it can't be skipped in the inspector.
const WAIT_KEY = "tabguardWaitPass";
// ---- temporary blocks ------------------------------------------------------------
// "Block this site" from the popup, for an hour or until tomorrow's day start.
// Like the blocklist a hard rule (also during a pause); it can't be lifted
// early, it simply runs out.
const TEMP_KEY = "tabguardTempBlocks";
let tempBlocks = {};                       // host → blocked until (ms)
function tempUntil(host) {
  const h = normalizeHost(host || ""); if (!h) return 0;
  let until = 0;
  for (const [e, t] of Object.entries(tempBlocks)) if (t > Date.now() && (h === e || h.endsWith("." + e))) until = Math.max(until, t);
  return until;
}
function nextDayStart() {
  const m = /^(\d{1,2}):(\d{2})$/.exec((cfg.lateNight && cfg.lateNight.end) || "05:00") || [0, 5, 0];
  const d = new Date(); d.setHours(+m[1], +m[2], 0, 0);
  if (d.getTime() <= Date.now()) d.setDate(d.getDate() + 1);
  return d.getTime();
}
async function blockOpenTabs(host, reason) {
  const h = normalizeHost(host);
  for (const t of await chrome.tabs.query({})) {
    const th = hostFromUrl(t.url || "");
    if (th && (th === h || th.endsWith("." + h))) redirectToCooldown(t.id, th, reason, t.url);
  }
}
let waitPass = {};                         // listed entry → free until (ms)
const waitStart = new Map();               // tabId → { entry, at }
function waitCfg() { return { ...DEFAULT_CONFIG.waitRoom, ...(cfg.waitRoom || {}) }; }
function waitEntry(host) {
  const w = waitCfg(); if (!w.enabled || !host) return null;
  const h = normalizeHost(host);
  for (const raw of w.hosts || []) { const e = normalizeHost(raw); if (e && (h === e || h.endsWith("." + e))) return e; }
  return null;
}
function waitNeeded(host) { const e = waitEntry(host); return e && !((waitPass[e] || 0) > Date.now()) ? e : null; }
async function sendToWaitRoom(tabId, host, entry, toUrl) {
  waitStart.set(tabId, { entry, at: Date.now() });
  const url = chrome.runtime.getURL("pages/waitroom.html") + `?host=${encodeURIComponent(host)}&url=${encodeURIComponent(toUrl || "")}`;
  try { await chrome.tabs.update(tabId, { url }); } catch (_) {}
}

function buildMatchers(c) {
  mAllow = makeHostMatcher(c.allowlist);
  mAcademic = makeHostMatcher(c.academicSearch);
  mBlock = makeHostMatcher(c.blocklist);
  mStreaming = makeHostMatcher(c.streamingHosts);
  mFullBlur = makeHostMatcher(c.fullBlurHosts);
  // proxy / unblocker sites found so far (host, or host + project path)
  const bl = (c.adultBlock && Array.isArray(c.adultBlock.bypassSites)) ? c.adultBlock.bypassSites : [];
  try { mBypass = bl.length ? makeImportMatcher(parseImport(bl.join("\n"))) : null; } catch (_) { mBypass = null; }
}
let mBypass = null;
function bypassOn() { const ab = cfg && cfg.adultBlock || {}; return !!ab.enabled && ab.bypass !== false; }
// A known unblocker site, or an address that is itself a proxy page.
// Your own trusted lists do not open a remembered proxy: only the sites that
// are never blocked (help, health, government) stay exempt. Otherwise one line
// in the allow list would undo the whole content filter.
function bypassBlocked(host, url) {
  if (!bypassOn() || !host || essential(host) || isSystemUrl(url)) return false;
  try { if (mBypass && mBypass(url)) return true; } catch (_) {}
  const B = self.TGBypass;
  return !!(B && B.isProxyUrl(url));
}
async function rememberBypassSite(url) {
  const B = self.TGBypass; const key = B && B.siteKey(url);
  if (!key) return;
  const c = (await chrome.storage.local.get("tabguardConfig")).tabguardConfig || {};
  const ab = { ...(c.adultBlock || {}) };
  const list = Array.isArray(ab.bypassSites) ? ab.bypassSites : [];
  if (list.includes(key)) return;
  ab.bypassSites = [...list, key].slice(-2000);
  c.adultBlock = ab;
  await chrome.storage.local.set({ tabguardConfig: c });
}
function fullBlurFor(host) { return !!(cfg.fullBlurAll || (mFullBlur && mFullBlur.has(host))); }

let initPromise = null;
function ensureConfig() {
  if (!initPromise) {
    initPromise = (async () => {
      const c = await loadConfig();
      const p = new PressureEngine(c);
      const got = await chrome.storage.local.get([BREAKER_KEY, PRESSURE_KEY, EMERG_KEY, WAIT_KEY]);
      if (got[EMERG_KEY]) emerg = { day: 0, grant: null, ...got[EMERG_KEY] };
      waitPass = got[WAIT_KEY] || {};
      tempBlocks = (await chrome.storage.local.get(TEMP_KEY))[TEMP_KEY] || {};
      try { mImport = makeImportMatcher(listsMerged(await migrateImports(chrome.storage.local))); } catch (_) { mImport = null; }
      breaker.restore(got[BREAKER_KEY]);
      p.restore(got[PRESSURE_KEY]);
      buildMatchers(c);
      pressure = p;   // assign engines first…
      cfg = c;        // …then cfg, so `cfg` being set implies everything is ready
      return cfg;
    })();
  }
  return initPromise;
}
const ready = () => cfg && pressure;

async function persist() {
  await chrome.storage.local.set({
    [BREAKER_KEY]: breaker.snapshot(),
    [PRESSURE_KEY]: pressure.snapshot(),
  });
}

startTouchGrassLink(() => !!(cfg && !cfg.enabled));

chrome.runtime.onInstalled.addListener(ensureConfig);
// a short introduction right after installing (not on updates)
chrome.runtime.onInstalled.addListener((d) => {
  if (d && d.reason === "install") chrome.tabs.create({ url: chrome.runtime.getURL("pages/welcome.html") }).catch(() => {});
});
chrome.runtime.onStartup.addListener(ensureConfig);
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes[TEMP_KEY]) tempBlocks = changes[TEMP_KEY].newValue || {};
  if (area === "local" && changes[EMERG_KEY]) emerg = { day: 0, grant: null, ...(changes[EMERG_KEY].newValue || {}) };
  // an old single list written later (older settings file, older version): move it over
  if (area === "local" && (changes[IMPORT_KEY] && changes[IMPORT_KEY].newValue)) {
    (async () => {
      const g = await chrome.storage.local.get([LISTS_KEY, IMPORT_KEY]);
      const lists = [...((g[LISTS_KEY] && g[LISTS_KEY].lists) || [])];
      const d = g[IMPORT_KEY];
      if (d) lists.push({ id: Math.random().toString(36).slice(2, 10), name: d.name || "Import", at: Date.now(), data: { hosts: d.hosts || [], prefixes: d.prefixes || [], patterns: d.patterns || [] } });
      await chrome.storage.local.set({ [LISTS_KEY]: { lists } });
      await chrome.storage.local.remove([IMPORT_KEY, IMPORT_NEXT_KEY]);
    })();
  }
  if (area === "local" && changes[LISTS_KEY]) {
    try { mImport = makeImportMatcher(listsMerged(changes[LISTS_KEY].newValue)); } catch (_) { mImport = null; }
  }
  if (area === "local" && changes.tabguardConfig) {
    // Merge over the defaults, exactly as loadConfig() does at startup. Taking
    // the stored object as-is meant any partial write — the popup's pause
    // button on a fresh install, a trimmed import — silently dropped
    // `enabled`, the tab windows and the rest, and switched everything off.
    cfg = { ...DEFAULT_CONFIG, ...(changes.tabguardConfig.newValue || {}) };
    buildMatchers(cfg);
    if (pressure) pressure.apply(cfg);
    broadcastStage();
  }
});

// ---- watched test -----------------------------------------------------------
// University library proxies (EZproxy and the like) rewrite every journal or
// database host into e.g. content-select-com.ezproxy.hs-augsburg.de. That is
// research by definition, and a burst of tabs there is literature work, not a
// doomscroll — so they count as academic search without being listed.
function libraryProxy(host) {
  if (cfg && cfg.academicProxies === false) return false;   // switch in settings › academic search
  return /(^|\.)(ezproxy|libproxy)\./i.test(String(host || ""));
}
function trusted(host) {
  return (mAllow && mAllow.has(host)) || (mAcademic && mAcademic.has(host)) || (mStreaming && mStreaming.has(host))
    || libraryProxy(host) || essential(host) || emergActive(host);
}
// Help in a crisis, emergency services, health: never blocked, slowed or greyed.
function essential(host) { return !!host && isEssentialHost(host, cfg && cfg.essentialExtra); }

// ---- emergency access -------------------------------------------------------
// Once per day, a blocked site can be opened for 20 minutes. It ends early on
// lingering over a page full of GIFs/clips (> 1 min) or lots of tab switching.
const EMERG_KEY = "tabguardEmergency";
const EMERG_MS = 20 * 60000, EMERG_MEDIA_S = 60, EMERG_SWITCHES = 8;
let emerg = { day: 0, grant: null };           // grant: { domain, until, reason, url, media, switches }
function emergActive(host) {
  const g = emerg && emerg.grant;
  if (!g || Date.now() >= g.until || !host) return false;
  return host === g.domain || host.endsWith("." + g.domain);
}
const saveEmerg = () => chrome.storage.local.set({ [EMERG_KEY]: emerg });
async function endEmergency() {
  const g = emerg.grant;
  if (!g) return;
  emerg.grant = null;
  await saveEmerg();
  const hard = ["blocked", "import", "locked", "escalated"].includes(g.reason);
  const tabs = await chrome.tabs.query({});
  for (const t of tabs) {
    const h = hostFromUrl(t.url || "");
    if (!h || !(h === g.domain || h.endsWith("." + g.domain))) continue;
    if (hard) redirectToCooldown(t.id, h, g.reason === "import" || g.reason === "blocked" ? (importBlocked(h, t.url) ? "import" : blockReason(h)) : g.reason, t.url);
  }
  broadcastStage();
}
function emergCheckExpiry() { if (emerg.grant && Date.now() >= emerg.grant.until) endEmergency(); }
function isStreaming(host) { return mStreaming && mStreaming.has(host); }

// Better-source chips: only when enabled and the session is old enough.
function sourcesFor(sessionMinutes) {
  const i = cfg.intention || {};
  if (!i.sourcesEnabled) return [];
  if ((Number(sessionMinutes) || 0) < (i.sourcesAfterMinutes || 0)) return [];
  return i.betterSources || [];
}

// Redirect a watched host to a calmer alternative. Skips URLs already on the
// target host so we don't loop.
function redirectTarget(host, url) {
  if (!host || trusted(host) || !Array.isArray(cfg.redirects)) return null;
  for (const rule of cfg.redirects) {
    const from = normalizeHost(String(rule?.from || "").replace(/^https?:\/\//, "").split("/")[0]);
    const toRaw = String(rule?.to || "").trim();
    if (!from || !toRaw) continue;
    if (host !== from && !host.endsWith(`.${from}`)) continue;

    const toClean = toRaw.replace(/^https?:\/\//, "").replace(/\/+$/, "");
    const toHostLiteral = toClean.split("/")[0].toLowerCase();   // exactly what the user typed
    const toHostNorm = normalizeHost(toHostLiteral);
    if (normalizeHost(host) === toHostNorm) return null;          // already there (ignore www), no loop

    // If the target names a path, treat it as a full destination.
    if (toClean.includes("/")) {
      return /^https?:\/\//.test(toRaw) ? `https://${toClean}` : `https://${toClean}`;
    }
    // Bare host: send to the target host EXACTLY as written (don't carry the
    // source's www/old/… subdomain over), keep path + query + hash. The target
    // server handles its own www-vs-no-www canonicalisation.
    try {
      const u = new URL(url);
      u.hostname = toHostLiteral;
      u.protocol = "https:";
      // drop a redundant trailing slash right before a query (…/search/?q → …/search?q)
      if (u.search && u.pathname.endsWith("/") && u.pathname !== "/") u.pathname = u.pathname.slice(0, -1);
      return u.toString();
    } catch (_) {
      return `https://${toHostLiteral}`;
    }
  }
  return null;
}
function watched(host, url) {
  if (isSystemUrl(url)) return false;
  return !trusted(host);
}

// Hard block: on the user's blocklist, or (in Jugendschutz mode) a known adult
// host. Whitelisted hosts are never hard-blocked.
function hardBlocked(host) {
  if (!host || trusted(host)) return false;
  if (tempUntil(host)) return true;
  if (mBlock && mBlock.has(host)) return true;
  if (cfg.adultBlock?.enabled && isAdultHost(host, cfg.adultBlock.extraHosts)) return true;
  return false;
}
// SafeSearch: with the content filter on, searches on the big engines are
// sent with their own strict filter switched on, the way a school network
// does it. Returns the corrected address, or null when nothing needs changing.
// SearXNG instances (any host, often POST) are handled in the content script.
function safeSearchUrl(url) {
  const ab = cfg.adultBlock || {};
  if (!ab.enabled || ab.safeSearch === false) return null;
  let u; try { u = new URL(url); } catch (_) { return null; }
  const h = u.hostname.toLowerCase().replace(/^www\./, ""), p = u.pathname, sp = u.searchParams;
  const want = (k, v) => { if (sp.get(k) === v) return null; sp.set(k, v); return u.toString(); };
  if (/^google\.[a-z.]+$/.test(h) && /^\/(search|images)/.test(p)) return want("safe", "active");
  if (h === "bing.com" && /^\/(search|images|videos)/.test(p)) return want("adlt", "strict");
  if (/(^|\.)duckduckgo\.com$/.test(h) && sp.get("q")) return want("kp", "1");
  if (h === "search.brave.com" && /^\/(search|images|videos|news)/.test(p)) return want("safesearch", "strict");
  if (/(^|\.)search\.yahoo\.com$/.test(h) && /^\/search/.test(p)) return want("vm", "r");
  // SearXNG over GET: safesearch=0|1 in the address → 2 (strict)
  if (/\/search\/?$/.test(p) && sp.get("q") && /^[01]$/.test(sp.get("safesearch") || "")) return want("safesearch", "2");
  return null;
}

// The imported list works on whole addresses (reddit.com/r/…, ?q=…), so it is
// checked against the URL, not just the host.
function importBlocked(host, url) {
  if (!mImport || !host || trusted(host) || isSystemUrl(url)) return false;
  try { return mImport(url); } catch (_) { return false; }
}
function blockReason(host) {
  if (mBlock && mBlock.has(host)) return "blocked";
  if (cfg.adultBlock?.enabled && isAdultHost(host, cfg.adultBlock.extraHosts)) return "adult";
  if (tempUntil(host)) return "temp";
  return "blocked";
}

function send(tabId, msg) {
  try { chrome.tabs.sendMessage(tabId, msg, () => void chrome.runtime.lastError); } catch (_) {}
}

// ---- escalation stage broadcast --------------------------------------------
function stagePayload() {
  if (!pressure || paused()) return { type: "APPLY_STAGE", stage: "none" };
  return {
    type: "APPLY_STAGE",
    stage: pressure.stage(),
    blurPx: pressure.blurPx(),
    revealMs: pressure.revealMs(),
    value: Math.round(pressure.get()),
    lang: cfg.language,
    disableLinks: !!cfg.fullBlurDisableLinks,
    allowReveal: cfg.escalation?.allowReveal !== false,
  };
}

async function broadcastStage() {
  if (!ready()) return;
  if (!cfg.escalation?.enabled && !paused()) return;
  const payload = stagePayload();
  const tabs = await chrome.tabs.query({});
  for (const t of tabs) {
    const host = hostFromUrl(t.url || "");
    if (host && watched(host, t.url)) send(t.id, { ...payload, fullBlur: fullBlurFor(host) });
    else if (t.id != null) send(t.id, { type: "APPLY_STAGE", stage: "none" });
  }
}

// "Pause protection" means: no friction of any kind for a while — no stages,
// no pressure, no tab breaker, no locks, no breathing pause. What stays on is
// what you set as a hard rule: the blocklist, the content filter and your
// redirects. Earlier the pause only stopped tab counting and the scroll pause,
// so the grey/blur ladder kept rising and switched itself back on.
function paused() { return !!(cfg && !cfg.enabled); }

function bump(kind) {
  if (!ready() || !cfg.escalation?.enabled || paused()) return;
  pressure.bump(kind);
  persist();
  broadcastStage();
}

// ---- tab circuit breaker ----------------------------------------------------
const pausePending = new Map();

// A tab counts toward the breaker once we know where it is going. Links opened
// in a new tab (Cmd/Ctrl+click, "open in new tab") carry that address at
// creation. A tab opened empty (Cmd+T, then typing or picking a suggestion)
// does not — it used to slip past the breaker entirely, so it is remembered
// and counted on its first real navigation instead.
const freshTabs = new Set();
const searchPaused = new Map();
const safeRewrites = new Map();          // tabId -> { n, at } SafeSearch corrections (loop guard)           // tabId -> last query that got a pause

async function countNewTab(tabId, url) {
  const host = hostFromUrl(url);
  if (host && bypassBlocked(host, url)) return redirectToCooldown(tabId, host, "proxy", url);
  if (!host || !watched(host, url)) return;
  const now = Date.now();

  if (hardBlocked(host)) return redirectToCooldown(tabId, host, blockReason(host), url);
  if (importBlocked(host, url)) return redirectToCooldown(tabId, host, "import", url);
  if (bypassBlocked(host, url)) return redirectToCooldown(tabId, host, "proxy", url);
  { const r = redirectTarget(host, url); if (r) { await redirectVia(tabId, host, r); return; } }
  if (paused()) return;                       // no counting, no locks while paused
  if (breaker.isLocked(host, now)) return redirectToCooldown(tabId, host, "locked", url);
  if (breaker.ignoredCount(host) >= cfg.ignoredBeforeCooldown) return redirectToCooldown(tabId, host, "escalated", url);

  const res = breaker.record(host, cfg, now);
  await persist();
  if (res.action === "lock") {
    try { await chrome.tabs.remove(tabId); } catch (_) {}
    bump("tabLock");
    if (cfg.autoBlockOnLock) { await addToBlocklist(host); }
    notify(i18nT(cfg.language, "nt_lockTitle"),
      i18nT(cfg.language, "nt_lockBody", { host, m: cfg.lockMinutes, n: res.count2, s: cfg.window2.seconds })
      + (cfg.autoBlockOnLock ? i18nT(cfg.language, "nt_lockAdded") : ""));
  } else if (res.action === "pause") {
    pausePending.set(tabId, { host, count: res.count1 });
    bump("tabPause");
  }
}

chrome.tabs.onCreated.addListener(async (tab) => {
  await ensureConfig();
  const url = tab.pendingUrl || tab.url || "";
  // empty or a browser page (Cmd+T opens chrome://newtab, whose "host" is
  // "newtab"): count it on its first real navigation instead
  if (!url || isSystemUrl(url)) { freshTabs.add(tab.id); return; }
  await countNewTab(tab.id, url);
});

// ---- navigation: enforce locks, pause, and search-churn --------------------
const navTimes = []; // recent watched navigations (browser-wide) for churn

chrome.tabs.onUpdated.addListener(async (tabId, info, tab) => {
  await ensureConfig();
  if (freshTabs.has(tabId) && info.url && !isSystemUrl(info.url)) {
    freshTabs.delete(tabId);
    await countNewTab(tabId, info.url);
  }
  const host = hostFromUrl(tab.url || "");
  const isWatched = host && watched(host, tab.url);
  const onCooldownPage = (tab.url || "").includes("pages/cooldown.html");

  if (isWatched && hardBlocked(host) && info.status === "loading" && !onCooldownPage) {
    return redirectToCooldown(tabId, host, blockReason(host), tab.url);
  }
  // in-page navigation (reddit, YouTube…) changes the address without a load
  if (isWatched && (info.status === "loading" || info.url) && !onCooldownPage && importBlocked(host, tab.url)) {
    return redirectToCooldown(tabId, host, "import", tab.url);
  }
  if ((info.status === "loading" || info.url) && !onCooldownPage && bypassBlocked(host, tab.url)) {
    return redirectToCooldown(tabId, host, "proxy", tab.url);
  }
  if (info.status === "loading" && host && /^https?:/i.test(tab.url || "") && !essential(host)) {
    const e = waitNeeded(host);
    if (e) return sendToWaitRoom(tabId, host, e, tab.url);
  }
  if (isWatched && info.status === "loading" && !onCooldownPage) {
    const ss = safeSearchUrl(tab.url);
    // loop guard: an engine that keeps dropping the parameter gets at most
    // three corrections per tab in 10 s, then it is left alone
    const sr = safeRewrites.get(tabId) || { n: 0, at: 0 };
    if (Date.now() - sr.at > 10000) { sr.n = 0; sr.at = Date.now(); }
    if (ss && sr.n < 3) { sr.n++; safeRewrites.set(tabId, sr); try { await chrome.tabs.update(tabId, { url: ss }); } catch (_) {} return; }
  }
  if (isWatched && info.status === "loading" && !onCooldownPage) {
    const r = redirectTarget(host, tab.url);
    if (r) { await redirectVia(tabId, host, r); return; }
  }
  if (paused()) {                              // hard rules done; everything else rests
    if (info.status === "complete") send(tabId, { type: "APPLY_STAGE", stage: "none" });
    return;
  }
  if (isWatched && breaker.isLocked(host) && info.status === "loading" && !onCooldownPage) {
    return redirectToCooldown(tabId, host, "locked", tab.url);
  }

  // Search-churn: count committed loads of distinct watched URLs.
  if (isWatched && info.status === "loading" && info.url && cfg.searchChurn?.enabled) {
    const now = Date.now();
    navTimes.push(now);
    while (navTimes.length && now - navTimes[0] > cfg.searchChurn.seconds * 1000) navTimes.shift();
    if (navTimes.length >= cfg.searchChurn.count) {
      navTimes.length = 0;
      bump("churn");
    }
  }

  // Push current stage to a watched tab once it's ready.
  if (info.status === "complete") {
    if (isWatched) send(tabId, { ...stagePayload(), fullBlur: fullBlurFor(host) });
    else send(tabId, { type: "APPLY_STAGE", stage: "none" });
  }

  if (info.status === "complete" && pausePending.has(tabId)) {
    const p = pausePending.get(tabId);
    pausePending.delete(tabId);
    const late = inLateNight(cfg);
    send(tabId, { type: "SHOW_INTERVENTION", mode: "pause", host: p.host,
      reason: i18nT(cfg.language, "rs_tabs", { n: p.count, host: p.host, s: cfg.window1.seconds }),
      breathSeconds: late ? cfg.breathSeconds * 2 : cfg.breathSeconds,
      disableFrictionSeconds: cfg.disableFrictionSeconds, late, lang: cfg.language,
      betterSources: sourcesFor(Infinity) });
  }
});

chrome.tabs.onActivated.addListener(async () => {
  await ensureConfig();
  if (!emerg.grant) return;
  emergCheckExpiry();
  if (!emerg.grant) return;
  emerg.grant.switches = (emerg.grant.switches || 0) + 1;
  if (emerg.grant.switches > EMERG_SWITCHES) await endEmergency(); else saveEmerg();
});

chrome.tabs.onRemoved.addListener((tabId) => {
  scroll.reset(tabId); sessions.reset(tabId); pausePending.delete(tabId); breakUntil.delete(tabId); freshTabs.delete(tabId); searchPaused.delete(tabId); safeRewrites.delete(tabId);
});

// A detected adult site goes onto the content filter's own list, by its base
// domain (de.example.com and www.example.com → example.com), so the next visit
// is stopped at navigation. The list is visible and editable in settings.
function baseDomain(host) {
  const parts = String(host || "").toLowerCase().replace(/^www\./, "").split(".");
  if (parts.length <= 2) return parts.join(".");
  const sld = parts[parts.length - 2], tld = parts[parts.length - 1];
  const twoPart = tld.length === 2 && /^(co|com|net|org|gov|edu|ac|or|ne|go)$/.test(sld);   // co.uk, com.au …
  return parts.slice(twoPart ? -3 : -2).join(".");
}
async function rememberAdultHost(host) {
  const d = baseDomain(host);
  if (!d) return;
  const c = (await chrome.storage.local.get("tabguardConfig")).tabguardConfig || {};
  const ab = { enabled: true, extraHosts: [], ...(c.adultBlock || {}) };
  const list = Array.isArray(ab.extraHosts) ? ab.extraHosts : [];
  if (list.includes(d)) return;
  ab.extraHosts = [...list, d];
  c.adultBlock = ab;
  await chrome.storage.local.set({ tabguardConfig: c });
}

// The address the tab was heading for travels along, so that once the lock
// is over the cooldown page can take you there — a tab opened with a right
// click used to lose its destination for good.
async function redirectToCooldown(tabId, host, reason, toUrl) {
  let url = chrome.runtime.getURL("pages/cooldown.html")
    + `?host=${encodeURIComponent(host || "")}&reason=${encodeURIComponent(reason || "")}`;
  if (toUrl && /^https?:\/\//i.test(toUrl)) url += `&url=${encodeURIComponent(toUrl)}`;
  if (reason === "temp") url += `&until=${tempUntil(host)}`;
  try { await chrome.tabs.update(tabId, { url }); } catch (_) {}
  holdCheck(tabId, url);
}
// A page can hold its tab with a "Leave site?" dialog; answering "stay" cancels
// the switch to the block screen. If the tab is still on the page a moment
// later, it is replaced: the block screen opens in its place and the old tab
// is closed (closing from here does not ask the page).
const holdReplacing = new Set();
function holdCheck(tabId, url) {
  const ext = chrome.runtime.getURL("");
  setTimeout(async () => {
    if (holdReplacing.has(tabId)) return;
    let t; try { t = await chrome.tabs.get(tabId); } catch (_) { return; }
    if ((t.url || "").startsWith(ext)) return;
    holdReplacing.add(tabId);
    setTimeout(() => holdReplacing.delete(tabId), 10000);
    try {
      await chrome.tabs.create({ windowId: t.windowId, index: t.index, active: t.active, url });
      // unload the page first (a discarded tab has no page left to ask), then close it
      let gone = tabId;
      try { const d = await chrome.tabs.discard(tabId); if (d && d.id != null) gone = d.id; } catch (_) {}
      await chrome.tabs.remove(gone);
      // if the page still held on (it asked again), try once more a moment later
      setTimeout(async () => {
        try { await chrome.tabs.get(gone); } catch (_) { return; }
        try { const d = await chrome.tabs.discard(gone); await chrome.tabs.remove(d && d.id != null ? d.id : gone); } catch (_) {}
      }, 2500);
    } catch (_) {}
  }, 2500);
}

async function redirectVia(tabId, from, to) {
  const url = chrome.runtime.getURL("pages/redirecting.html")
    + `?from=${encodeURIComponent(from || "")}&to=${encodeURIComponent(to || "")}`;
  try { await chrome.tabs.update(tabId, { url }); } catch (_) {}
  holdCheck(tabId, url);
}

async function addToBlocklist(host) {
  const h = normalizeHost(host);
  if (!h) return;
  const c = (await chrome.storage.local.get("tabguardConfig")).tabguardConfig || {};
  const list = Array.isArray(c.blocklist) ? c.blocklist : [];
  if (!list.includes(h)) { list.push(h); c.blocklist = list; await chrome.storage.local.set({ tabguardConfig: c }); cfg = { ...cfg, blocklist: list }; }
}

// ---- emergency exits: pause protection / reset pressure ----------------------
// Each use today waits longer than the last; a daily budget caps how often.
// The wait is kept here, not in the popup, so closing and reopening the popup
// neither skips nor restarts it.
const EXIT_STEPS = [5, 10, 15, 20, 30, 45, 60, 90, 120, 180, 300];
const EXIT_GRACE = 3 * 60000;               // a finished wait stays usable this long
function exitCfg() { return { ...DEFAULT_CONFIG.exits, ...(cfg.exits || {}) }; }
// Your day starts when the late-night window ends (default 05:00), not at
// midnight: midnight sits in the middle of the most vulnerable hours, and a
// reset there would hand back a fresh budget exactly when it is needed least.
function dayStartMinutes() {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String((cfg && cfg.lateNight && cfg.lateNight.end) || "05:00"));
  return m ? (Math.min(23, +m[1]) * 60 + Math.min(59, +m[2])) : 300;
}
function dayKey(now = new Date()) {
  const d = new Date(now.getTime() - dayStartMinutes() * 60000);   // before the start → still yesterday
  return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
}
async function exitState() {
  const st = (await chrome.storage.local.get(EXIT_KEY))[EXIT_KEY] || {};
  // only a NEWER day starts over: moving the day start later must not reset
  if (typeof st.day !== "number" || dayKey() > st.day) return { day: dayKey(), used: 0, pending: null };
  return { day: st.day, used: st.used || 0, pending: st.pending || null };
}
const saveExit = (st) => chrome.storage.local.set({ [EXIT_KEY]: st });
function exitWait(used) {
  const ec = exitCfg();
  const max = Math.max(5, Number(ec.maxSeconds) || 120);
  const start = Number(ec.startSeconds) >= 10 ? 10 : 5;
  const steps = EXIT_STEPS.filter(x => x >= start);
  return Math.min(steps[Math.min(used, steps.length - 1)], max);
}
// The current tab is grey, blurred or blocked → no exit from there.
function exitGreyBlocked(host) {
  const ec = exitCfg();
  if (!ec.notOnGrey || !host || paused() || !pressure || !cfg.escalation?.enabled) return false;
  return !trusted(host) && pressure.stage() !== "none";
}
async function exitStatus(host) {
  const ec = exitCfg(), st = await exitState();
  const budget = Math.max(0, Number(ec.budget) || 0);
  let pending = st.pending;
  if (pending && Date.now() > pending.readyAt + EXIT_GRACE) pending = null;
  return {
    on: ec.enabled !== false, used: st.used, budget,
    left: budget ? Math.max(0, budget - st.used) : null,
    wait: exitWait(st.used), pending, grey: exitGreyBlocked(host),
    resetMode: ec.resetMode === "full" ? "full" : "halve",
    day: st.day, dayStart: (cfg.lateNight && cfg.lateNight.end) || "05:00",
  };
}
// Loosened exit settings (more budget, shorter waits, switched off) are saved
// as pending and only take effect an hour later; tightening applies at once.
// Loosened settings (switching filters off, removing entries, gentler exits)
// were saved as pending; once their hour is over they apply here.
async function applyLoosening() {
  const g = await chrome.storage.local.get(["tabguardConfig", LISTS_KEY]);
  const r = applyDue(g.tabguardConfig || {});
  if (r.changed) {
    await chrome.storage.local.set({ tabguardConfig: r.config });
    cfg = { ...DEFAULT_CONFIG, ...r.config };                 // don't wait for onChanged
    buildMatchers(cfg);
  }
  // imported lists whose removal hour is over
  const due = dueLists(g[LISTS_KEY]);
  if (due) await chrome.storage.local.set({ [LISTS_KEY]: due });
}
async function performExit(kind) {
  if (kind === "pause") {
    const c = (await chrome.storage.local.get("tabguardConfig")).tabguardConfig || {};
    c.enabled = false; c.pausedUntil = Date.now() + (cfg.autoResumeMinutes || 30) * 60000;
    await chrome.storage.local.set({ tabguardConfig: c });
  } else if (kind === "reset") {
    if (exitCfg().resetMode === "full") pressure.reset(); else pressure.halve();
    await persist(); broadcastStage();
  }
}

// ---- messages from content scripts -----------------------------------------
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    await ensureConfig();
    const tabId = sender.tab && sender.tab.id;
    const url = sender.tab && sender.tab.url;
    const host = hostFromUrl(url || "");
    const isWatched = watched(host, url);

    switch (msg.type) {
      case "SCROLL_SAMPLE": {
        if (tabId == null || !cfg.enabled) return sendResponse({});
        const score = scroll.update(tabId, msg.sample);
        sessions.engaged(tabId);
        const band = scroll.band(score);
        sendResponse({ score, band, watched: isWatched });
        if (!isWatched) return;
        const late = inLateNight(cfg);
        const scoreGate = late ? Math.max(50, cfg.intenseScore - 15) : cfg.intenseScore;
        const minGate = late ? cfg.watchAfterMinutes / 2 : cfg.watchAfterMinutes;
        if (score >= scoreGate && sessions.sessionMinutes(tabId) >= minGate && !recentlyIntervened(tabId)) {
          markIntervened(tabId);
          bump("scroll");
          send(tabId, { type: "SHOW_INTERVENTION", mode: cfg.intention?.enabled ? "intention" : "pause", host,
            reason: i18nT(cfg.language, "rs_scroll", { host }),
            breathSeconds: late ? cfg.breathSeconds * 2 : cfg.breathSeconds,
            disableFrictionSeconds: cfg.disableFrictionSeconds, late,
            question: cfg.intention?.question || undefined,
            lang: cfg.language,
            betterSources: sourcesFor(sessions.sessionMinutes(tabId)) });
        }
        return;
      }
      case "MEDIA_DWELL": {
        // emergency access ends after a minute on a page full of moving media
        if (emergActive(host) && (msg.n || 0) >= 2) {
          emerg.grant.media = (emerg.grant.media || 0) + 3;
          if (emerg.grant.media >= EMERG_MEDIA_S) await endEmergency(); else saveEmerg();
        }
        // content reports each tick of lingering on animated media
        if (isWatched && cfg.mediaDwell?.enabled) bump("dwell");
        return sendResponse({});
      }
      case "REVISIT": {
        // content reports arriving on a watched, media-heavy page while pressure is up
        if (isWatched && pressure.get() >= (cfg.escalation?.stages?.grey || 20)) bump("revisit");
        return sendResponse({});
      }
      case "FOCUS": {
        if (tabId != null) sessions.setFocused(tabId, !!msg.focused);
        return sendResponse({});
      }
      case "INTERVENTION_RESULT": {
        if (msg.action === "ignored" && host) {
          const n = breaker.noteIgnored(host);
          await persist();
          if (n >= cfg.ignoredBeforeCooldown) breaker.lock(host, cfg.lockMinutes);
        }
        if (msg.action === "closed" && tabId != null) { try { chrome.tabs.remove(tabId); } catch (_) {} }
        if (msg.action === "continued" && host) breaker.clearIgnored(host);
        if (msg.action === "break" && tabId != null) {
          breakUntil.set(tabId, Date.now() + 300000); // 5 min grace, no new interventions
          send(tabId, { type: "SHOW_BREAK", seconds: 300, lang: cfg.language });
        }
        return sendResponse({});
      }
      case "GET_STATUS": {
        const h = msg.host || host;
        // Determine watched from the host alone — the popup has no tab URL, so
        // relying on isSystemUrl(url) here would mark every site "trusted".
        const isW = h ? !trusted(h) : false;
        return sendResponse({
          enabled: cfg.enabled,
          pausedUntil: cfg.pausedUntil || 0,
          watched: isW,
          blocked: h ? hardBlocked(h) : false,
          onBlocklist: h ? !!(mBlock && mBlock.has(h)) : false,
          tempUntil: h ? tempUntil(h) : 0,
          fullBlur: h ? fullBlurFor(h) : false,
          disableLinks: !!cfg.fullBlurDisableLinks,
          allowReveal: cfg.escalation?.allowReveal !== false,
          locked: breaker.isLocked(h),
          lockRemainingMs: breaker.lockRemainingMs(h),
          score: (msg.tabId != null) ? scroll.peek(msg.tabId) : (tabId != null ? scroll.peek(tabId) : 0),
          sessionMinutes: (msg.tabId != null) ? sessions.sessionMinutes(msg.tabId) : (tabId != null ? sessions.sessionMinutes(tabId) : 0),
          pressure: pressure ? Math.round(pressure.get()) : 0,
          stage: (pressure && !paused()) ? pressure.stage() : "none",
          paused: paused(),
        });
      }
      case "UNLOCK": {
        if (msg.host) { breaker.unlock(msg.host); breaker.clearIgnored(msg.host); await persist(); }
        return sendResponse({});
      }
      case "OPEN_OPTIONS": {
        const u = chrome.runtime.getURL("options/options.html") + (msg.hash || "");
        try { chrome.tabs.create({ url: u }); } catch (_) {}
        return sendResponse({});
      }
      case "BLOCK_SITE": {
        // for an hour, until tomorrow's day start, or for good (the blocklist;
        // removal is gated). Open tabs of the site switch to the block screen.
        const h = normalizeHost(msg.host || "");
        if (!h) return sendResponse({ ok: false });
        if (msg.for === "hour" || msg.for === "day") {
          const until = msg.for === "hour" ? Date.now() + 60 * 60000 : nextDayStart();
          tempBlocks = Object.fromEntries(Object.entries(tempBlocks).filter(([, t]) => t > Date.now()));
          tempBlocks[h] = Math.max(tempBlocks[h] || 0, until);
          await chrome.storage.local.set({ [TEMP_KEY]: tempBlocks });
          await blockOpenTabs(h, "temp");
          return sendResponse({ ok: true, until });
        }
        await addToBlocklist(h);
        await blockOpenTabs(h, "blocked");
        return sendResponse({ ok: true });
      }
      case "IS_ADULT_ENABLED": {
        const ab = cfg.adultBlock || {};
        const on = !!ab.enabled && !(host && trusted(host));
        return sendResponse({ enabled: on, searchPause: on && ab.searchPause !== false, greyLinks: on && ab.greyLinks !== false,
          safeSearch: on && ab.safeSearch !== false, terms: Array.isArray(ab.terms) ? ab.terms.slice(0, 500) : [],
          imported: !!mImport && !(host && trusted(host)),
          bypass: !!ab.enabled && ab.bypass !== false });          // a hard rule, also on trusted sites
      }
      case "ADULT_LINKS": {
        // which of these link targets are known or recognised adult sites?
        const ab = cfg.adultBlock || {};
        if (!ab.enabled || ab.greyLinks === false) return sendResponse({ adult: [] });
        return sendResponse({ adult: (msg.hosts || []).filter(h => isAdultHost(h, ab.extraHosts)).slice(0, 150) });
      }
      case "SEARCH_PAUSE": {
        // an explicit search: a breathing pause in front of the results, once per query and tab
        const ab = cfg.adultBlock || {};
        if (!ab.enabled || ab.searchPause === false || tabId == null || (host && trusted(host))) return sendResponse({});
        const q = String(msg.q || "").toLowerCase();
        if (searchPaused.get(tabId) === q) return sendResponse({});
        searchPaused.set(tabId, q);
        send(tabId, { type: "SHOW_INTERVENTION", mode: "pause", host,
          reason: i18nT(cfg.language, "rs_search"),
          breathSeconds: cfg.breathSeconds, disableFrictionSeconds: cfg.disableFrictionSeconds,
          late: inLateNight(cfg), lang: cfg.language, betterSources: sourcesFor(Infinity) });
        return sendResponse({ shown: true });
      }
      case "SEARCH_QUERY": {
        // A search whose words are not in the address (SearXNG posts its
        // form): test the imported list's search rules against the words.
        if (!mImport || tabId == null || !host || trusted(host)) return sendResponse({});
        const q = encodeURIComponent(String(msg.q || "").slice(0, 300)).replace(/%20/g, "+");
        const base = `https://${host}/search?`;
        if (["q", "p", "query"].some(k => mImport(base + k + "=" + q))) {
          redirectToCooldown(tabId, host, "import");
          return sendResponse({ blocked: true });
        }
        return sendResponse({});
      }
      case "UNFILTERED_SEARCH": {
        // a search engine that ignored the request for its strict filter
        const ab = cfg.adultBlock || {};
        if (ab.enabled && ab.safeSearch !== false && tabId != null && host && !trusted(host)) redirectToCooldown(tabId, host, "unfiltered");
        return sendResponse({});
      }
      case "ADULT_SIGNALS": {
        // The content script describes the page; we add what the outbound
        // links say and decide. A detected site is remembered, so next time it
        // is closed before it loads.
        const ab = cfg.adultBlock || {};
        if (!ab.enabled || tabId == null || !host || essential(host)) return sendResponse({});
        // trusted sites: only an adult page shown inside one of their frames counts
        if (trusted(host) && !msg.frame) return sendResponse({});
        const f = { ...(msg.features || {}) };
        f.adultOutbound = (f.hosts || []).filter(h => isAdultHost(h, ab.extraHosts)).length;
        const lib = globalThis.TGAdultSignals;
        const r = lib ? lib.score(f) : { adult: !!f.rta, why: [] };
        const adult = ab.detect === false ? !!f.rta : r.adult;   // detection off → only the RTA label
        if (adult && msg.frame && bypassOn()) {
          // an adult page shown inside a frame of this site (a proxy's window):
          // the site is a way around the filter, closed without emergency access
          await rememberBypassSite(url || "");
          redirectToCooldown(tabId, host, "proxy");
        } else if (adult) { await rememberAdultHost(host); redirectToCooldown(tabId, host, "adult"); }
        return sendResponse({ adult, score: r.score, why: r.why });
      }
      case "WAITROOM_INFO": {
        const w = waitCfg();
        const st = waitStart.get(tabId);
        const left = st ? Math.max(0, w.seconds * 1000 - (Date.now() - st.at)) : w.seconds * 1000;
        return sendResponse({ seconds: w.seconds, openMinutes: w.openMinutes, leftMs: left, lang: cfg.language });
      }
      case "WAITROOM_PASS": {
        // only after the wait has really passed, timed from when the tab came here
        const w = waitCfg();
        const st = waitStart.get(tabId);
        const target = String(msg.url || "");
        const h = hostFromUrl(target);
        const e = waitEntry(h);
        if (!st || !e || st.entry !== e || Date.now() - st.at < w.seconds * 1000 - 300) return sendResponse({ ok: false });
        waitPass[e] = Date.now() + w.openMinutes * 60000;
        for (const [k, v] of Object.entries(waitPass)) if (v < Date.now()) delete waitPass[k];
        await chrome.storage.local.set({ [WAIT_KEY]: waitPass });
        waitStart.delete(tabId);
        try { await chrome.tabs.update(tabId, { url: target }); } catch (_) {}
        return sendResponse({ ok: true });
      }
      case "WAITROOM_LEAVE": {
        waitStart.delete(tabId);
        try {
          const all = await chrome.tabs.query({ windowId: sender.tab.windowId });
          if (all.length > 1) await chrome.tabs.remove(tabId);
          else await chrome.tabs.update(tabId, { url: "about:blank" });
        } catch (_) {}
        return sendResponse({});
      }
      case "I18N": {
        // short texts for the small frame script, in the chosen language
        const out = {};
        for (const k of (Array.isArray(msg.keys) ? msg.keys : []).slice(0, 10)) if (/^[a-z]{1,4}_\w{1,30}$/.test(k)) out[k] = i18nT(cfg.language, k);
        return sendResponse(out);
      }
      case "BYPASS_SITE": {
        // the page looks like a proxy / unblocker site (content script) — or a
        // frame inside it is showing a page through a proxy (frame script)
        const tabUrl = (sender.tab && sender.tab.url) || msg.url || "";
        const th = hostFromUrl(tabUrl);
        // On trusted sites only the unmistakable signs count (the proxy engine
        // itself, a proxied address, a page shown through a frame); the softer
        // ones (words, menus, look) don't. Help and health sites never.
        if (!bypassOn() || tabId == null || !th || essential(th) || isSystemUrl(tabUrl)) return sendResponse({});
        if (trusted(th) && !msg.strong) return sendResponse({});
        await rememberBypassSite(tabUrl);
        redirectToCooldown(tabId, th, "proxy");
        return sendResponse({ blocked: true });
      }
      case "BLOCK_ADULT": {
        // content script found an RTA label on a page we don't list
        if (cfg.adultBlock?.enabled && tabId != null && host && !trusted(host)) {
          redirectToCooldown(tabId, host, "adult");
        }
        return sendResponse({});
      }
      case "EMERGENCY_STATUS": {
        emergCheckExpiry();
        const h = msg.host || host;
        return sendResponse({ available: emerg.day !== dayKey(), active: emergActive(h), until: emerg.grant ? emerg.grant.until : 0 });
      }
      case "EMERGENCY_START": {
        const h = normalizeHost(msg.host || host || "");
        if (!h) return sendResponse({ error: "host" });
        if (emerg.day === dayKey()) return sendResponse({ error: "used" });
        if (msg.reason === "adult" || msg.reason === "unfiltered" || msg.reason === "proxy") return sendResponse({ error: "reason" });   // not for the content filter
        emerg = { day: dayKey(), grant: { domain: baseDomain(h), until: Date.now() + EMERG_MS, reason: msg.reason || "stage", url: msg.url || "", media: 0, switches: 0 } };
        await saveEmerg();
        broadcastStage();
        setTimeout(emergCheckExpiry, EMERG_MS + 500);          // the minute alarm is the backup
        return sendResponse({ ok: true, until: emerg.grant.until });
      }
      case "EMERGENCY_END": { await endEmergency(); return sendResponse({}); }
      case "RESET_PRESSURE": { pressure.reset(); await persist(); broadcastStage(); return sendResponse({}); }
      case "EXIT_STATUS": { await applyLoosening(); return sendResponse(await exitStatus(msg.host)); }
      case "EXIT_START": {
        const kind = msg.kind === "reset" ? "reset" : "pause";
        const s = await exitStatus(msg.host);
        if (!s.on) { await performExit(kind); return sendResponse({ done: true }); }
        if (s.grey) return sendResponse({ error: "grey" });
        if (s.left === 0) return sendResponse({ error: "budget" });
        const st = await exitState();
        if (!s.pending || s.pending.kind !== kind) {
          st.pending = { kind, wait: s.wait, readyAt: Date.now() + s.wait * 1000 };
          await saveExit(st);
        }
        return sendResponse({ pending: st.pending || s.pending });
      }
      case "EXIT_COMMIT": {
        const kind = msg.kind === "reset" ? "reset" : "pause";
        const s = await exitStatus(msg.host);
        if (!s.on) { await performExit(kind); return sendResponse({ done: true }); }
        if (s.grey) return sendResponse({ error: "grey" });
        if (s.left === 0) return sendResponse({ error: "budget" });
        const p = s.pending;
        if (!p || p.kind !== kind) return sendResponse({ error: "nopending" });
        if (Date.now() < p.readyAt - 250) return sendResponse({ error: "wait", pending: p });
        const st = await exitState();
        st.used += 1; st.pending = null;
        await saveExit(st);
        await performExit(kind);
        return sendResponse({ done: true });
      }
      case "EXIT_CANCEL": {
        const st = await exitState(); st.pending = null; await saveExit(st);
        return sendResponse({});
      }
      case "OPEN_EXIT_PAGE": {
        const u = chrome.runtime.getURL("pages/exit.html") + `?kind=${msg.kind === "reset" ? "reset" : "pause"}`;
        try { await chrome.tabs.create({ url: u }); } catch (_) {}
        return sendResponse({});
      }
    }
  })();
  return true;
});

// keep stage decaying visibly: re-broadcast on a slow alarm
chrome.alarms.create("tabguard-decay", { periodInMinutes: 1 });
chrome.alarms.onAlarm.addListener(async (a) => {
  if (a.name !== "tabguard-decay") return;
  await ensureConfig();
  await applyLoosening();
  emergCheckExpiry();
  // auto-resume protection when a pause has expired
  if (!cfg.enabled && cfg.pausedUntil && Date.now() >= cfg.pausedUntil) {
    const c = (await chrome.storage.local.get("tabguardConfig")).tabguardConfig || {};
    c.enabled = true; c.pausedUntil = 0;
    await chrome.storage.local.set({ tabguardConfig: c });
    notify(i18nT(cfg.language, "nt_resumeTitle"), i18nT(cfg.language, "nt_resumeMsg"));
  }
  broadcastStage();
});

const lastIntervention = new Map();
const breakUntil = new Map();
function recentlyIntervened(tabId) {
  if ((breakUntil.get(tabId) || 0) > Date.now()) return true; // on a break
  return Date.now() - (lastIntervention.get(tabId) || 0) < 180000;
}
function markIntervened(tabId) { lastIntervention.set(tabId, Date.now()); }

function notify(title, message) {
  try { chrome.notifications.create({ type: "basic", iconUrl: chrome.runtime.getURL("assets/icon128.png"), title, message }); } catch (_) {}
}
