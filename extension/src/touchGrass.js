// touchGrass.js — OPTIONAL, EXPERIMENTAL: link to the Touch Grass apps.
//
// Tab Guard works without this. It stays off until the user turns it on under
// Settings → Experimental, which asks the browser for one optional permission:
//   - on a computer "nativeMessaging", to reach Touch Grass for Mac
//   - on Android the host "http://127.0.0.1/*", to reach Touch Grass for
//     Android on the same phone (Firefox for Android has no native messaging)
// Without that permission nothing here runs.
//
// Why it exists: Touch Grass (separate apps, github.com/coach-kg/touchgrass-mac
// and github.com/coach-kg/TouchGrassBlocker) can require Tab Guard in the
// browser and blocks browsers without it. For that it needs a sign of life:
//   - a random id for this browser profile, made here and kept in local storage
//   - how many windows Tab Guard can see (computer only)
//   - whether Tab Guard may run in private windows
//   - whether protection is paused, until when, and the version number
// No addresses, no titles, no browsing data. Native messaging only reaches a
// program installed on this computer. On Android the beat goes to 127.0.0.1,
// the phone itself; nothing leaves the device.

const HOST = "com.touchgrass.mac";
const ID_KEY = "tabguardTouchGrassId";
/** chrome.storage.session, read by the settings page to show the state. */
export const TG_STATUS_KEY = "tabguardTouchGrass";
/** chrome.storage.local: content scripts pulse only while this is true (Android). */
export const TG_PULSE_KEY = "tabguardTouchGrassPulse";
/**
 * chrome.storage.local, Android only: the switch itself. Firefox counts the
 * content scripts' access to all http sites as granted, so the 127.0.0.1 permission is
 * always "there" and can't be taken back. The switch is this flag instead.
 */
export const TG_ON_KEY = "tabguardTouchGrassOn";
const BEAT_MS = 4000;
const RETRY_MS = 30000;

// Android: Touch Grass listens on the phone itself.
const ANDROID_URL = "http://127.0.0.1:47823/tabguard/beat";
export const ANDROID_ORIGINS = ["http://127.0.0.1/*"];
const ANDROID_MIN_GAP_MS = 10000;   // at most one beat per 10 s, however many tabs pulse
const ANDROID_TIMEOUT_MS = 3000;

// ---- learned sites, shared with Touch Grass for Mac (desktop only) ----------
// docs/tasks/touch-grass-learned-sync.md. Only host names, only over the
// native messaging port, only while "Connect with Touch Grass" is on.
const SYNC_REMOVED_KEY = "tabguardSyncRemoved";   // hosts the user removed: never take them back
const SYNC_MIN_MS = 60000;                        // at most one "learned" message a minute
const SYNC_TOTAL_MAX = 20000;
const BYPASS_CAP = 2000, EXTRA_CAP = 5000;
const TOMB_DAYS = 90;
let getCfg = () => null;
let lastSent = 0, sendTimer = null;

let port = null;
let beatTimer = null;
let retryTimer = null;
let isPaused = () => false;
let pausedUntil = () => 0;
let android = null;                 // null until known
let lastAndroidBeat = 0;
let androidInFlight = false;

async function isAndroid() {
  if (android !== null) return android;
  try { android = (await chrome.runtime.getPlatformInfo()).os === "android"; }
  catch (_) { android = false; }
  return android;
}

async function permitted() {
  try {
    if (await isAndroid()) {
      const on = (await chrome.storage.local.get(TG_ON_KEY))[TG_ON_KEY] === true;
      return on && await chrome.permissions.contains({ origins: ANDROID_ORIGINS });
    }
    return await chrome.permissions.contains({ permissions: ["nativeMessaging"] });
  } catch (_) { return false; }
}

async function profileId() {
  const got = await chrome.storage.local.get(ID_KEY);
  if (got[ID_KEY]) return got[ID_KEY];
  const id = crypto.randomUUID();
  await chrome.storage.local.set({ [ID_KEY]: id });
  return id;
}

async function windowCount() {
  if (!chrome.windows?.getAll) return 0;   // Firefox for Android has no windows API
  try { return (await chrome.windows.getAll({ windowTypes: ["normal", "popup", "app", "devtools"] })).length; }
  catch (_) {
    try { return (await chrome.windows.getAll()).length; } catch (_) { return 0; }
  }
}

async function privateAllowed() {
  try { return !!(await chrome.extension.isAllowedIncognitoAccess()); } catch (_) { return false; }
}

function setStatus(state, extra = {}) {
  try { chrome.storage.session.set({ [TG_STATUS_KEY]: { state, ...extra, at: Date.now() } }); } catch (_) {}
}

function setPulse(on) {
  try { chrome.storage.local.set({ [TG_PULSE_KEY]: !!on }); } catch (_) {}
}

// ---- computer: native messaging ---------------------------------------------

async function beat() {
  if (!port) return;
  try {
    port.postMessage({
      t: "hb",
      id: await profileId(),
      windows: await windowCount(),
      private: await privateAllowed(),
      paused: !!isPaused(),
      v: chrome.runtime.getManifest().version,
    });
  } catch (_) { /* the port closed between checks; onDisconnect handles it */ }
}

function retryLater() {
  clearTimeout(retryTimer);
  retryTimer = setTimeout(connect, RETRY_MS);
}

async function connect() {
  clearTimeout(retryTimer);
  if (await isAndroid()) {
    const ok = await permitted();
    setPulse(ok);
    if (!ok) { setStatus("off"); return; }
    androidBeat(true);
    return;
  }
  if (port) return;
  if (!(await permitted())) { setStatus("off"); return; }
  try { port = chrome.runtime.connectNative(HOST); }
  catch (e) { port = null; setStatus("missing", { error: String(e && e.message || e).slice(0, 200) }); retryLater(); return; }
  port.onMessage.addListener((m) => {
    if (m && m.t === "state") {
      setStatus("connected", { macUnlocked: !!m.unlocked });
      if (m.found && typeof m.found === "object") mergeFound(m.found).catch(() => {});
    }
  });
  port.onDisconnect.addListener(() => {
    // the browser's own reason ("host not found", "access forbidden", "exited")
    const err = chrome.runtime.lastError ? String(chrome.runtime.lastError.message || "") : "";
    port = null;
    clearInterval(beatTimer);
    beatTimer = null;
    setStatus("missing", err ? { error: err.slice(0, 200) } : {});   // Touch Grass not installed, or it closed
    retryLater();
  });
  beat();
  beatTimer = setInterval(beat, BEAT_MS);
  lastSent = 0;
  setTimeout(sendLearned, 1500);       // once right after connecting, when the config is loaded
}

function disconnect() {
  clearInterval(beatTimer);
  clearTimeout(sendTimer);
  clearTimeout(retryTimer);
  beatTimer = null;
  if (port) { try { port.disconnect(); } catch (_) {} }
  port = null;
  setPulse(false);
  setStatus("off");
}

// ---- learned sites -----------------------------------------------------------

/** A plain host from a list entry, or "" for entries with a path or pattern. */
function plainHost(e) {
  let h = String(e || "").trim().toLowerCase();
  if (!h) return "";
  h = h.replace(/^https?:\/\//, "").replace(/\/+$/, "");
  if (h.includes("/") || /[*?\s]/.test(h.replace(/^\*\./, ""))) return "";
  h = h.replace(/^\*\./, "").replace(/^www\./, "").replace(/\.$/, "");
  return /^[a-z0-9.-]+\.[a-z0-9-]{2,}$/.test(h) ? h : "";
}
function uniqHosts(list) {
  const out = [], seen = new Set();
  for (const e of Array.isArray(list) ? list : []) { const h = plainHost(e); if (h && !seen.has(h)) { seen.add(h); out.push(h); } }
  return out;
}
function protections(c) {
  const ab = (c && c.adultBlock) || {};
  return { adult: !!ab.enabled, proxy: !!ab.enabled && ab.bypass !== false };
}

/** What Tab Guard sends: only lists whose protection is on; the blocklist always. */
export function learnedMessage(c) {
  const ab = (c && c.adultBlock) || {}, on = protections(c);
  const msg = { t: "learned" };
  let room = SYNC_TOTAL_MAX;
  const take = (list) => { const l = list.slice(-room); room -= l.length; return l; };   // newest win
  msg.blocked = take(uniqHosts(c && c.blocklist));
  if (on.proxy) msg.proxy = take(uniqHosts(ab.bypassSites));
  if (on.adult) msg.adult = take(uniqHosts(ab.extraHosts));
  return msg;
}

function sendLearned() {
  clearTimeout(sendTimer);
  if (!port) return;
  const c = getCfg();
  if (!c) { sendTimer = setTimeout(sendLearned, 2000); return; }
  try { port.postMessage(learnedMessage(c)); lastSent = Date.now(); } catch (_) {}
}
function scheduleSend() {
  if (!port) return;
  clearTimeout(sendTimer);
  sendTimer = setTimeout(sendLearned, Math.max(0, lastSent + SYNC_MIN_MS - Date.now()));
}

async function tombstones() {
  const now = Date.now(), keep = {};
  let t = {};
  try { t = (await chrome.storage.local.get(SYNC_REMOVED_KEY))[SYNC_REMOVED_KEY] || {}; } catch (_) {}
  for (const [h, at] of Object.entries(t)) if (now - at < TOMB_DAYS * 864e5) keep[h] = at;
  return keep;
}

/** Hosts the user removed from a list (not ones dropped by the cap). */
async function noteRemovals(oldC, newC) {
  const gone = [];
  for (const [path, cap] of [["bypassSites", BYPASS_CAP], ["extraHosts", EXTRA_CAP]]) {
    const before = uniqHosts(oldC && oldC.adultBlock && oldC.adultBlock[path]);
    const after = uniqHosts(newC && newC.adultBlock && newC.adultBlock[path]);
    if (!before.length) continue;
    const now = new Set(after);
    const missing = before.filter(h => !now.has(h));
    if (!missing.length) continue;
    // the cap drops the oldest entries when a new one comes in: that is not a removal
    const rawAfter = (newC.adultBlock[path] || []).length;
    if (rawAfter >= cap && missing.every(h => before.indexOf(h) < missing.length)) continue;
    gone.push(...missing);
  }
  if (!gone.length) return;
  const t = await tombstones();
  for (const h of gone) t[h] = Date.now();
  try { await chrome.storage.local.set({ [SYNC_REMOVED_KEY]: t }); } catch (_) {}
}

/** What the Mac's own page check found, into Tab Guard's lists. Adds only. */
async function mergeFound(found) {
  // the first reply can come while the background is still loading its config
  let eff = getCfg();
  for (let i = 0; !eff && i < 60; i++) { await new Promise(r => setTimeout(r, 250)); eff = getCfg(); }
  if (!eff) return;
  const on = protections(eff);
  const removed = await tombstones();
  const c = (await chrome.storage.local.get("tabguardConfig")).tabguardConfig || {};
  const ab = { ...(c.adultBlock || {}) };
  let changed = false;
  const add = (path, hosts, cap) => {
    const list = Array.isArray(ab[path]) ? ab[path] : [];
    const have = new Set(uniqHosts(list));
    const fresh = uniqHosts(hosts).filter(h => !have.has(h) && !removed[h]);
    if (!fresh.length) return;
    ab[path] = [...list, ...fresh].slice(-cap);
    changed = true;
  };
  if (on.proxy) add("bypassSites", found.proxy, BYPASS_CAP);
  if (on.adult) add("extraHosts", found.adult, EXTRA_CAP);
  if (!changed) return;
  c.adultBlock = ab;
  await chrome.storage.local.set({ tabguardConfig: c });
}

// ---- Android: a small local HTTP call ---------------------------------------
// Firefox for Android puts the background to sleep after a short while, so a
// timer here alone would stop. Instead every visible page pulses every 15 s
// (content.js) and the pulse wakes this up. A page is only visible in the
// browser that is in front, so the beat comes from Firefox while it is in use.

async function androidBeat(force = false) {
  const now = Date.now();
  if (androidInFlight) return;
  if (!force && now - lastAndroidBeat < ANDROID_MIN_GAP_MS) return;
  if (!(await permitted())) { setPulse(false); setStatus("off"); return; }
  lastAndroidBeat = now;
  androidInFlight = true;
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), ANDROID_TIMEOUT_MS);
  try {
    const body = JSON.stringify({
      t: "hb",
      id: await profileId(),
      private: await privateAllowed(),
      paused: !!isPaused(),
      pausedUntil: Number(pausedUntil()) || 0,
      v: chrome.runtime.getManifest().version,
      browser: "Firefox",
    });
    const r = await fetch(ANDROID_URL, {
      method: "POST", body, signal: ctl.signal,
      headers: { "Content-Type": "application/json" },
      cache: "no-store", credentials: "omit",
    });
    if (r.ok) setStatus("connected", { android: true });
    else setStatus("missing", { android: true, error: "HTTP " + r.status });
  } catch (e) {
    // Touch Grass not installed, not running, or its switch is off. The
    // browser's reason helps when it is none of those.
    const why = e && e.name === "AbortError" ? "timeout" : String(e && e.message || e || "").slice(0, 120);
    setStatus("missing", { android: true, ...(why ? { error: why } : {}) });
  } finally {
    clearTimeout(timer);
    androidInFlight = false;
  }
}

/** A visible page pulsed (content.js). Only does anything on Android. */
export async function touchGrassPulse() {
  if (!(await isAndroid())) return;
  androidBeat(false);
}

function matchesAndroid(p) {
  return !!p?.origins?.some((o) => ANDROID_ORIGINS.includes(o));
}

/**
 * Called once from background.js. `paused` reports whether protection is
 * paused, `until` when that pause ends (ms, 0 = no end set).
 */
export function startTouchGrassLink(paused, until, config) {
  if (typeof paused === "function") isPaused = paused;
  if (typeof until === "function") pausedUntil = until;
  if (typeof config === "function") getCfg = config;
  // learned lists changed: remember removals, send the new lists (desktop)
  chrome.storage.onChanged.addListener((c, area) => {
    if (area !== "local" || !c.tabguardConfig) return;
    noteRemovals(c.tabguardConfig.oldValue, c.tabguardConfig.newValue).catch(() => {});
    // a protection was switched on: reconnect, so the Mac sends its finds once more
    const was = protections(c.tabguardConfig.oldValue), now = protections(c.tabguardConfig.newValue);
    if (port && ((now.proxy && !was.proxy) || (now.adult && !was.adult))) {
      try { port.disconnect(); } catch (_) {}
      port = null; clearInterval(beatTimer); beatTimer = null;
      setTimeout(connect, 2000);       // after the background has taken the new config
      return;
    }
    scheduleSend();
  });
  chrome.permissions?.onAdded?.addListener((p) => {
    if (p.permissions?.includes("nativeMessaging") || matchesAndroid(p)) connect();
  });
  chrome.permissions?.onRemoved?.addListener((p) => {
    if (p.permissions?.includes("nativeMessaging") || matchesAndroid(p)) disconnect();
  });
  // A new or closed window changes the count Touch Grass compares against.
  chrome.windows?.onCreated?.addListener(() => { beat(); });
  chrome.windows?.onRemoved?.addListener(() => { beat(); });
  // After the browser restarts the worker, reconnect.
  chrome.storage.onChanged.addListener((c, area) => {
    if (area !== "local" || !c[TG_ON_KEY]) return;
    if (c[TG_ON_KEY].newValue === true) { lastAndroidBeat = 0; connect(); } else disconnect();
  });
  chrome.alarms.create("tabguard-touchgrass", { periodInMinutes: 1 });
  chrome.alarms.onAlarm.addListener((a) => { if (a.name === "tabguard-touchgrass") connect(); });
  connect();
}
