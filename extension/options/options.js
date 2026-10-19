import { t, apply, resolve } from "../assets/i18n.js";
import { initPreviews, relabelPreviews } from "./preview.js";
import { IMPORT_KEY, IMPORT_NEXT_KEY, parseImport, importStats, mergeImports } from "../src/importList.js";
import { holdLoosening, withPendingShown, pendingAt, LOOSEN_DELAY } from "../src/loosen.js";
import { ESSENTIAL_SUFFIXES, ESSENTIAL_HOSTS } from "../src/essential.js";

const KEY = "tabguardConfig";
const $ = (id) => document.getElementById(id);
let LANG = "auto";

const DEFAULTS = {
  allowlist: ["mail.google.com","calendar.google.com","docs.google.com","drive.google.com","github.com","gitlab.com","stackoverflow.com","claude.ai","chatgpt.com","notion.so","linear.app","figma.com","wikipedia.org","localhost"],
  academicSearch: ["scholar.google.com","link.springer.com","springer.com","sciencedirect.com","jstor.org","arxiv.org","pubmed.ncbi.nlm.nih.gov","semanticscholar.org","base-search.net","doaj.org","worldcat.org","researchgate.net","nature.com","acm.org","ieee.org"],
  academicProxies: true,
  blocklist: [], autoBlockOnLock: false,
  adultBlock: { enabled: false, extraHosts: [] },
  fullBlurHosts: [], fullBlurAll: false, fullBlurDisableLinks: false,
  previews: { enabled: true, everywhere: false, freezeGifs: true, hoverSwap: true },
  exits: { enabled: true, budget: 5, startSeconds: 5, maxSeconds: 120, resetMode: "halve", notOnGrey: true },
  shortForm: { enabled: false, action: "blur", minSeconds: 20, portrait: true, blockShortsUrls: true, prePlay: true, swipeFeeds: false },
  pagination: { enabled: false, pageSize: 10, delaySeconds: 5, hosts: [] },
  streamingHosts: ["netflix.com","disneyplus.com","primevideo.com","arte.tv","mediathek.ard.de","zdf.de","mubi.com","criterionchannel.com"],
  redirects: [],
  intention: { enabled: true, question: "", betterSources: [{ label: "ARTE Mediathek", url: "https://www.arte.tv/de/" }, { label: "Project Gutenberg", url: "https://www.gutenberg.org/" }] },
  window1: { count: 4, seconds: 90 }, window2: { count: 7, seconds: 300 },
  lockMinutes: 30, ignoredBeforeCooldown: 2,
  intenseScore: 70, watchAfterMinutes: 1.5, breathSeconds: 8,
  escalation: { enabled: true, decayMinutes: 25, stages: { grey: 20, blur: 50, block: 80 }, maxBlurPx: 12, baseRevealSeconds: 2, maxRevealSeconds: 12 },
  mediaDwell: { enabled: true, idleSeconds: 2.5, tickSeconds: 3 },
  searchChurn: { enabled: true, count: 6, seconds: 60 },
  lateNight: { enabled: true, start: "23:00", end: "05:00" },
  disableFrictionSeconds: 30,
  autoResumeMinutes: 30,
};

async function load() {
  const stored = (await chrome.storage.local.get(KEY))[KEY] || {};
  LANG = $("language")?.value && $("language").value !== "auto" ? $("language").value : (stored.language || "auto");
  const c = { ...DEFAULTS, ...withPendingShown(stored) };     // the form shows what you chose, pending or not
  renderPending(stored);
  const esc = { ...DEFAULTS.escalation, ...(c.escalation || {}) };
  esc.stages = { ...DEFAULTS.escalation.stages, ...(esc.stages || {}) };
  const md = { ...DEFAULTS.mediaDwell, ...(c.mediaDwell || {}) };
  const sc = { ...DEFAULTS.searchChurn, ...(c.searchChurn || {}) };
  const ln = { ...DEFAULTS.lateNight, ...(c.lateNight || {}) };

  $("allowlist").value = (c.allowlist || []).join("\n");
  $("academic").value = (c.academicSearch || []).join("\n");
  $("proxyOn").checked = c.academicProxies !== false;
  $("blocklist").value = (c.blocklist || []).join("\n");
  $("autoBlock").checked = !!c.autoBlockOnLock;
  $("adult").checked = !!(c.adultBlock && c.adultBlock.enabled);
  $("adultDetect").checked = !(c.adultBlock && c.adultBlock.detect === false);
  $("adultSearch").checked = !(c.adultBlock && c.adultBlock.searchPause === false);
  $("adultGrey").checked = !(c.adultBlock && c.adultBlock.greyLinks === false);
  $("adultSafe").checked = !(c.adultBlock && c.adultBlock.safeSearch === false);
  $("adultTerms").value = ((c.adultBlock && c.adultBlock.terms) || []).join("\n");
  { const ex = { ...DEFAULTS.exits, ...(c.exits || {}) };
    $("exStart").value = String(+ex.startSeconds >= 10 ? 10 : 5);
    $("exDayStart").value = (c.lateNight && c.lateNight.end) || "05:00";
    $("exOn").checked = ex.enabled !== false; $("exBudget").value = ex.budget ?? 5;
    $("exMax").value = String([20, 60, 120, 300].includes(+ex.maxSeconds) ? +ex.maxSeconds : 120);
    $("exGrey").checked = ex.notOnGrey !== false; $("exReset").value = ex.resetMode === "full" ? "full" : "halve"; }
  renderImport();
  $("essentialExtra").value = (c.essentialExtra || []).join("\n");
  $("essList").textContent = [...ESSENTIAL_HOSTS, ...ESSENTIAL_SUFFIXES.map(x => "*." + x)].join("  ");
  { const pv = { ...DEFAULTS.previews, ...(c.previews || {}) };
    $("pvOn").checked = pv.enabled !== false; $("pvGifs").checked = pv.freezeGifs !== false; $("pvAll").checked = !!pv.everywhere; $("pvSwap").checked = pv.hoverSwap !== false; }
  $("adultLearned").value = ((c.adultBlock && c.adultBlock.extraHosts) || []).join("\n");
  $("streaming").value = (c.streamingHosts || []).join("\n");
  $("fullBlur").value = (c.fullBlurHosts || []).join("\n");
  $("fbAll").checked = !!c.fullBlurAll; $("fbLinks").checked = !!c.fullBlurDisableLinks;
  const sf = { ...DEFAULTS.shortForm, ...(c.shortForm || {}) };
  $("sfOn").checked = !!sf.enabled; $("sfAction").value = sf.action || "blur";
  $("sfMin").value = sf.minSeconds ?? 20; $("sfPortrait").checked = !!sf.portrait; $("sfBlockUrls").checked = !!sf.blockShortsUrls;
  $("sfPrePlay").checked = sf.prePlay !== false; $("sfSwipe").checked = !!sf.swipeFeeds;
  const pg = { ...DEFAULTS.pagination, ...(c.pagination || {}) };
  $("pgOn").checked = !!pg.enabled; $("pgSize").value = pg.pageSize ?? 10; $("pgDelay").value = pg.delaySeconds ?? 5;
  $("pgHosts").value = (pg.hosts || []).join("\n");
  $("redirects").value = (c.redirects || []).map(r => `${r.from} ⇒ ${r.to}`).join("\n");
  const intent = c.intention || DEFAULTS.intention;
  $("intentOn").checked = intent.enabled !== false;
  $("intentQ").value = intent.question || "";
  $("srcOn").checked = !!intent.sourcesEnabled;
  $("srcAfter").value = intent.sourcesAfterMinutes ?? 10;
  $("betterSources").value = (intent.betterSources || []).map(s => `${s.label} ⇒ ${s.url}`).join("\n");
  $("w1c").value = c.window1.count; $("w1s").value = c.window1.seconds;
  $("w2c").value = c.window2.count; $("w2s").value = c.window2.seconds;
  $("lock").value = c.lockMinutes; $("ignored").value = c.ignoredBeforeCooldown;
  $("intense").value = c.intenseScore; $("watchAfter").value = c.watchAfterMinutes; $("breath").value = c.breathSeconds;
  $("escOn").checked = !!esc.enabled; $("decay").value = esc.decayMinutes;
  $("sGrey").value = esc.stages.grey; $("sBlur").value = esc.stages.blur; $("sBlock").value = esc.stages.block;
  $("maxBlur").value = esc.maxBlurPx; $("revMin").value = esc.baseRevealSeconds; $("revMax").value = esc.maxRevealSeconds;
  $("revealOn").checked = esc.allowReveal !== false;
  $("dwellOn").checked = !!md.enabled; $("dwellIdle").value = md.idleSeconds;
  $("churnOn").checked = !!sc.enabled; $("churnCount").value = sc.count; $("churnSec").value = sc.seconds;
  $("lnOn").checked = !!ln.enabled; $("lnStart").value = ln.start; $("lnEnd").value = $("exDayStart").value || ln.end;
  $("friction").value = c.disableFrictionSeconds;
  $("autoResume").value = c.autoResumeMinutes ?? 30;
  $("language").value = c.language || "auto";
}

const lines = (v) => v.split("\n").map(s => s.trim().toLowerCase().replace(/^www\./, "")).filter(Boolean);

let editingUnlocked = false;

async function save() {
  const stored = (await chrome.storage.local.get(KEY))[KEY] || {};
  let c = { ...stored };
  const lock = c.lock || { enabled: false };
  if (lock.enabled) {
    if (!editingUnlocked) { openGate("change"); return; }
    if ((lock.unlocksUsed || 0) >= (lock.maxUnlocks || 0)) { $("gateErr").textContent = ""; return; }
    lock.unlocksUsed = (lock.unlocksUsed || 0) + 1;
    c.lock = lock;
  }
  c.allowlist = lines($("allowlist").value);
  c.academicSearch = lines($("academic").value);
  c.academicProxies = $("proxyOn").checked;
  c.blocklist = lines($("blocklist").value);
  c.autoBlockOnLock = $("autoBlock").checked;
  c.adultBlock = { enabled: $("adult").checked, detect: $("adultDetect").checked, searchPause: $("adultSearch").checked,
    greyLinks: $("adultGrey").checked, safeSearch: $("adultSafe").checked,
    terms: [...new Set($("adultTerms").value.split("\n").map(x => x.trim().toLowerCase()).filter(x => x.length >= 2))],
    extraHosts: lines($("adultLearned").value) };
  c.previews = { enabled: $("pvOn").checked, freezeGifs: $("pvGifs").checked, everywhere: $("pvAll").checked, hoverSwap: $("pvSwap").checked };
  c.exits = { enabled: $("exOn").checked, budget: Math.max(0, Math.min(99, Math.round(+$("exBudget").value || 0))),
    startSeconds: +$("exStart").value >= 10 ? 10 : 5,
    maxSeconds: +$("exMax").value || 120, resetMode: $("exReset").value === "full" ? "full" : "halve", notOnGrey: $("exGrey").checked };
  c.essentialExtra = lines($("essentialExtra").value);
  c.streamingHosts = lines($("streaming").value);
  c.fullBlurHosts = lines($("fullBlur").value);
  c.fullBlurAll = $("fbAll").checked; c.fullBlurDisableLinks = $("fbLinks").checked;
  c.shortForm = { enabled: $("sfOn").checked, action: $("sfAction").value, minSeconds: +$("sfMin").value || 0, portrait: $("sfPortrait").checked, blockShortsUrls: $("sfBlockUrls").checked,
    prePlay: $("sfPrePlay").checked, swipeFeeds: $("sfSwipe").checked };
  c.pagination = { enabled: $("pgOn").checked, pageSize: Math.max(1, +$("pgSize").value || 10), delaySeconds: Math.max(0, +$("pgDelay").value || 0), hosts: lines($("pgHosts").value) };
  c.redirects = $("redirects").value.split("\n").map(l => {
    const m = l.split(/\s*(?:⇒|=>|->|>)\s*/); if (m.length < 2) return null;
    const from = m[0].trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0];
    const to = m[1].trim();
    return from && to ? { from, to } : null;
  }).filter(Boolean);
  c.intention = {
    enabled: $("intentOn").checked,
    question: $("intentQ").value.trim(),
    sourcesEnabled: $("srcOn").checked,
    sourcesAfterMinutes: +$("srcAfter").value || 0,
    betterSources: $("betterSources").value.split("\n").map(l => {
      const m = l.split(/\s*(?:⇒|=>|->|>)\s*/); if (m.length < 2) return null;
      const label = m[0].trim(); const url = m.slice(1).join(">").trim();
      return label && url ? { label, url } : null;
    }).filter(Boolean),
  };
  c.window1 = { count: +$("w1c").value, seconds: +$("w1s").value };
  c.window2 = { count: +$("w2c").value, seconds: +$("w2s").value };
  c.lockMinutes = +$("lock").value; c.ignoredBeforeCooldown = +$("ignored").value;
  c.intenseScore = +$("intense").value; c.watchAfterMinutes = +$("watchAfter").value; c.breathSeconds = +$("breath").value;
  c.escalation = {
    enabled: $("escOn").checked, decayMinutes: +$("decay").value,
    stages: { grey: +$("sGrey").value, blur: +$("sBlur").value, block: +$("sBlock").value },
    maxBlurPx: +$("maxBlur").value, baseRevealSeconds: +$("revMin").value, maxRevealSeconds: +$("revMax").value,
    allowReveal: $("revealOn").checked,
    add: (c.escalation && c.escalation.add) || undefined,
  };
  c.mediaDwell = { enabled: $("dwellOn").checked, idleSeconds: +$("dwellIdle").value, tickSeconds: 3 };
  c.searchChurn = { enabled: $("churnOn").checked, count: +$("churnCount").value, seconds: +$("churnSec").value };
  c.lateNight = { enabled: $("lnOn").checked, start: $("lnStart").value, end: $("lnEnd").value || "05:00" };
  c.disableFrictionSeconds = +$("friction").value;
  c.autoResumeMinutes = +$("autoResume").value;
  c.language = $("language").value || "auto";
  c = holdLoosening(stored, c);                 // loosening waits an hour, tightening applies now
  await chrome.storage.local.set({ [KEY]: c });
  renderPending(c);
  for (const id of ["saved", "savedM"]) { const s = $(id); if (s) { s.classList.add("show"); setTimeout(() => s.classList.remove("show"), 1500); } }
  renderLock(c.lock);
}

// ---- settings lock ----------------------------------------------------------
function renderLock(lock) {
  lock = lock || { enabled: false };
  $("lockOff").style.display = lock.enabled ? "none" : "";
  $("lockOn").style.display = lock.enabled ? "" : "none";
  if (lock.enabled) {
    const left = Math.max(0, (lock.maxUnlocks || 0) - (lock.unlocksUsed || 0));
    $("lockLeft").textContent = `${left} / ${lock.maxUnlocks}`;
    $("lockStatus").textContent = left > 0 ? t(LANG, "o_active") : t(LANG, "o_frozen");
    $("lockStatus").style.color = left > 0 ? "var(--ok)" : "var(--bad)";
    $("lockResetInfo").textContent = lock.resetDaily ? t(LANG, "o_resetDailyV") : t(LANG, "o_resetNeverV");
    $("save").disabled = !editingUnlocked || left <= 0;
    $("save").style.opacity = $("save").disabled ? ".45" : "1";
  } else {
    $("save").disabled = false; $("save").style.opacity = "1";
  }
}

function todayKey() { const d = new Date(); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; }

async function enableLock() {
  const len = Math.min(40, Math.max(4, +$("lockLen").value || 12));
  const max = Math.max(1, +$("lockMax").value || 10);
  const resetDaily = $("lockReset").checked;
  const c = (await chrome.storage.local.get(KEY))[KEY] || {};
  c.lock = { enabled: true, mode: "shown", length: len, maxUnlocks: max, unlocksUsed: 0, resetDaily, unlockDay: todayKey() };
  await chrome.storage.local.set({ [KEY]: c });
  editingUnlocked = true; // just created it, still editable this session
  renderLock(c.lock);
}

// Apply the daily reset if a new day has begun.
async function applyDailyReset() {
  const c = (await chrome.storage.local.get(KEY))[KEY] || {};
  const lock = c.lock;
  if (lock && lock.enabled && lock.resetDaily && lock.unlockDay !== todayKey()) {
    lock.unlocksUsed = 0; lock.unlockDay = todayKey();
    c.lock = lock;
    await chrome.storage.local.set({ [KEY]: c });
  }
  return c.lock || { enabled: false };
}

async function removeLock() {
  // requires passcode
  openGate("remove");
}

// ---- gate: show a random code, require it typed back exactly ----------------
let gateMode = "change";
let gateChallenge = "";
async function openGate(mode) {
  gateMode = mode;
  $("gateErr").textContent = "";
  $("gatePass").value = "";
  const lock = (await chrome.storage.local.get(KEY))[KEY]?.lock || {};
  const left = Math.max(0, (lock.maxUnlocks || 0) - (lock.unlocksUsed || 0));
  gateChallenge = window.TGLock.generatePasscode(lock.length || 12);
  $("gateChallenge").textContent = gateChallenge;
  $("gateTitle").textContent = mode === "remove" ? t(LANG, "o_g_titleRemove") : t(LANG, "o_g_title");
  $("gateMsg").textContent = t(LANG, "o_g_msg");
  $("gateHint").textContent = left > 0 ? t(LANG, "o_g_leftToday", { n: left }) : t(LANG, "o_g_leftReinstall");
  $("gate").style.display = "flex";
  $("gatePass").focus();
}

async function submitGate() {
  if ($("gatePass").value !== gateChallenge) {
    $("gateErr").textContent = t(LANG, "o_g_mismatch");
    $("gatePass").value = "";
    return;
  }
  const c = (await chrome.storage.local.get(KEY))[KEY] || {};
  if (gateMode === "remove") {
    c.lock = { ...(c.lock || {}), enabled: false, unlocksUsed: 0 };
    await chrome.storage.local.set({ [KEY]: c });
    editingUnlocked = true;
    $("gate").style.display = "none";
    renderLock(c.lock);
    return;
  }
  editingUnlocked = true;
  $("gate").style.display = "none";
  renderLock(c.lock);
}

// on/off state labels next to toggles
const TOGGLES = ["sfPrePlay", "sfSwipe", "adultSafe", "pvSwap", "exOn", "exGrey", "adultSearch", "adultGrey", "pvOn", "pvGifs", "pvAll", "adultDetect", "proxyOn", "escOn", "dwellOn", "churnOn", "lnOn", "lockReset", "autoBlock", "adult", "intentOn", "srcOn", "sfOn", "sfPortrait", "sfBlockUrls", "fbAll", "fbLinks", "revealOn", "pgOn"];

// ---- export / import --------------------------------------------------------
async function exportSettings() {
  const c = (await chrome.storage.local.get(KEY))[KEY] || {};
  const safe = { ...c }; delete safe.lock; // never export the lock
  const blob = new Blob([JSON.stringify(safe, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "tab-guard-settings.json";
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

async function importSettings(file) {
  const lock = (await chrome.storage.local.get(KEY))[KEY]?.lock;
  if (lock?.enabled && !editingUnlocked) { openGate("change"); return; }
  try {
    const text = await file.text();
    const incoming = JSON.parse(text);
    if (!incoming || typeof incoming !== "object") throw new Error("not an object");
    const c = (await chrome.storage.local.get(KEY))[KEY] || {};
    // start from what you already chose (pending changes included), and merge
    // nested sections key by key, so a partial file can't silently drop lists
    const base = withPendingShown(c);
    let merged = { ...base };
    for (const [k, v] of Object.entries(incoming)) {
      merged[k] = (v && typeof v === "object" && !Array.isArray(v) && base[k] && typeof base[k] === "object" && !Array.isArray(base[k])) ? { ...base[k], ...v } : v;
    }
    if (lock) merged.lock = lock; // keep existing lock, ignore any in the file
    delete merged.loosenPending;
    merged = holdLoosening(c, merged);           // a settings file can't loosen faster than the form
    await chrome.storage.local.set({ [KEY]: merged });
    $("importMsg").textContent = t(LANG, "o_importOk");
    await load(); syncStates();
  } catch (e) {
    $("importMsg").textContent = t(LANG, "o_importFail");
  }
}
function syncStates() {
  for (const id of TOGGLES) {
    const s = $(id + "S");
    if (s) s.textContent = $(id).checked ? t(LANG, "o_on") : t(LANG, "o_off");
  }
  applyDeps();
}

// Grey out + disable fields that depend on a master toggle until it's on.
function applyDeps() {
  document.querySelectorAll("[data-dep]").forEach(el => {
    const master = $(el.getAttribute("data-dep"));
    const on = !!(master && master.checked);
    el.classList.toggle("dep-off", !on);
    el.querySelectorAll("input,select,textarea,button").forEach(i => { i.disabled = !on; });
    if (el.matches("input,select,textarea,button")) el.disabled = !on;
  });
}
for (const id of TOGGLES) {
  const el = $(id);
  if (el) el.addEventListener("change", syncStates);
}

$("revealDone")?.addEventListener("click", () => { $("reveal").style.display = "none"; });
$("exportBtn")?.addEventListener("click", exportSettings);
$("importBtn")?.addEventListener("click", () => $("importFile").click());
$("importFile")?.addEventListener("change", (e) => { const f = e.target.files[0]; if (f) importSettings(f); e.target.value = ""; });
try { $("verLabel").textContent = "v" + chrome.runtime.getManifest().version; } catch (_) {}
$("save").addEventListener("click", save);
$("saveM")?.addEventListener("click", save);
$("jump")?.addEventListener("change", () => { const t = document.getElementById($("jump").value); if (t) t.scrollIntoView({ behavior: "smooth", block: "start" }); });
$("lockEnable")?.addEventListener("click", enableLock);
$("lockRemove")?.addEventListener("click", removeLock);
$("gateSubmit")?.addEventListener("click", submitGate);
$("gatePass")?.addEventListener("keydown", (e) => { if (e.key === "Enter") submitGate(); });
if (window.TGLock) window.TGLock.hardenInput($("gatePass"));

// ---- loosening waits an hour: notes under the affected sections -------------
function renderPending(c) {
  const fmt = (at) => new Date(at).toLocaleTimeString(resolve(LANG), { hour: "2-digit", minute: "2-digit" });
  for (const [id, paths] of [["exPending", ["exits", "lateNight"]], ["adultPending", ["adultBlock"]], ["blockPending", ["blocklist"]], ["essPending", ["essentialExtra"]]]) {
    const el = $(id); if (!el) continue;
    const at = pendingAt(c, paths);
    el.textContent = at ? t(LANG, "o_ex_pending", { t: fmt(at) }) : "";
    el.style.display = at ? "" : "none";
  }
}

// the day start is the end of the late-night window: one value, two places
for (const [a, b] of [["exDayStart", "lnEnd"], ["lnEnd", "exDayStart"]]) {
  $(a)?.addEventListener("input", () => { $(b).value = $(a).value; });
}

// ---- imported block list (Cold Turkey export, hosts files) -------------------
// Stored under its own key; only the counts are shown, never the entries.
// Removing or replacing the list loosens protection, so it waits an hour like
// every other loosening: a replacement applies on top at once (both lists
// count) and the old one drops out after the hour; a removal just waits.
async function renderImport() {
  const g = await chrome.storage.local.get([IMPORT_KEY, IMPORT_NEXT_KEY]);
  const d = g[IMPORT_KEY], next = g[IMPORT_NEXT_KEY];
  const st = importStats(d);
  const fmt = (at) => new Date(at).toLocaleTimeString(resolve(LANG), { hour: "2-digit", minute: "2-digit" });
  const has = st && (st.hosts || st.paths || st.patterns);
  $("ctStats").textContent = !has ? t(LANG, "o_ct_none")
    : (d.name ? d.name + " · " : "") + t(LANG, "o_ct_stats", { h: st.hosts, p: st.paths, w: st.patterns, q: st.searches });
  const pend = $("ctPending");
  if (next && next.at > Date.now()) {
    pend.textContent = t(LANG, next.data ? "o_ct_swapAt" : "o_ct_removeAt", { t: fmt(next.at) });
    pend.style.display = "";
  } else { pend.textContent = ""; pend.style.display = "none"; }
  $("ctRemove").style.display = has && !(next && !next.data) ? "" : "none";
}
async function importBlockFile(file) {
  try {
    const text = await file.text();
    const d = parseImport(text);
    if (!d.hosts.length && !d.prefixes.length && !d.patterns.length) throw new Error("empty");
    d.name = String(file.name || "").slice(0, 80); d.at = Date.now();
    const cur = (await chrome.storage.local.get(IMPORT_KEY))[IMPORT_KEY];
    if (!cur) await chrome.storage.local.set({ [IMPORT_KEY]: d });          // nothing to loosen
    else await chrome.storage.local.set({ [IMPORT_KEY]: mergeImports(cur, d), [IMPORT_NEXT_KEY]: { data: d, at: Date.now() + LOOSEN_DELAY } });
  } catch (_) { $("ctStats").textContent = t(LANG, "o_importFail"); return; }
  renderImport();
}
async function removeImport() {
  // removing weakens protection → behind the settings lock like any change, and it waits an hour
  const lock = (await chrome.storage.local.get(KEY))[KEY]?.lock;
  if (lock?.enabled && !editingUnlocked) { openGate("change"); return; }
  const next = (await chrome.storage.local.get(IMPORT_NEXT_KEY))[IMPORT_NEXT_KEY];
  const at = next && !next.data && next.at > Date.now() ? next.at : Date.now() + LOOSEN_DELAY;
  await chrome.storage.local.set({ [IMPORT_NEXT_KEY]: { data: null, at } });
  renderImport();
}
$("ctPick")?.addEventListener("click", () => $("ctFile").click());
$("ctFile")?.addEventListener("change", (e) => { const f = e.target.files[0]; if (f) importBlockFile(f); e.target.value = ""; });
$("ctRemove")?.addEventListener("click", removeImport);

// ---- built-in term list: deliberately awkward to open ---------------------
// The words themselves can pull you in, so the list sits behind a sentence
// you type by hand (no pasting), shows for 20 seconds and closes again.
let biTimer = null;
function biClose() { clearInterval(biTimer); biTimer = null; $("biList").style.display = "none"; $("biGate").style.display = "none"; $("biTerms").textContent = ""; }
$("biOpen")?.addEventListener("click", () => {
  biClose();
  $("biPrompt").textContent = t(LANG, "o_bi_prompt");
  $("biPhrase").textContent = t(LANG, "o_bi_phrase");
  $("biInput").value = ""; $("biErr").textContent = "";
  $("biGate").style.display = "";
  $("biInput").focus();
});
function biSubmit() {
  const norm = (x) => x.toLowerCase().replace(/\s+/g, " ").trim();
  if (norm($("biInput").value) !== norm(t(LANG, "o_bi_phrase"))) { $("biErr").textContent = t(LANG, "pg_mismatch"); return; }
  $("biGate").style.display = "none";
  const terms = (globalThis.TGAdultSignals && globalThis.TGAdultSignals.TERMS) || [];
  $("biTerms").textContent = terms.join("  ");
  $("biList").style.display = "";
  const end = Date.now() + 20000;
  const tick = () => { const s = Math.ceil((end - Date.now()) / 1000); if (s <= 0) return biClose(); $("biTimer").textContent = t(LANG, "o_bi_hides", { s }); };
  tick(); biTimer = setInterval(tick, 500);
}
$("biShow")?.addEventListener("click", biSubmit);
$("biInput")?.addEventListener("keydown", (e) => { if (e.key === "Enter") biSubmit(); });
$("biCancel")?.addEventListener("click", biClose);
if (window.TGLock) window.TGLock.hardenInput($("biInput"));

// ---- sidebar nav + scroll-spy ----------------------------------------------
let spyObs = null;
function buildNav() {
  const nav = $("nav"); const main = document.querySelector(".tg-main");
  if (!nav || !main) return;
  nav.replaceChildren();
  // phones: the same sections as a "jump to" menu in the top bar
  const jump = $("jump"); let og = null;
  if (jump) { jump.replaceChildren(); jump.setAttribute("aria-label", t(LANG, "settings")); }
  main.querySelectorAll(":scope > .grp, :scope > section[id]").forEach(el => {
    if (el.classList.contains("grp")) {
      const g = document.createElement("div"); g.className = "ng"; g.textContent = el.textContent.replace(/—/g, "").trim();
      nav.appendChild(g);
      if (jump) { og = document.createElement("optgroup"); og.label = g.textContent; jump.appendChild(og); }
    } else {
      const h = el.querySelector("h2 [data-i18n^='o_h_']") || el.querySelector("h2");
      const a = document.createElement("a");
      a.href = "#" + el.id; a.textContent = (h ? h.textContent : el.id).trim(); a.dataset.target = el.id;
      a.addEventListener("click", ev => { ev.preventDefault(); const t = document.getElementById(el.id); if (t) t.scrollIntoView({ behavior: "smooth", block: "start" }); });
      nav.appendChild(a);
      if (jump) { const o = document.createElement("option"); o.value = el.id; o.textContent = a.textContent; (og || jump).appendChild(o); }
    }
  });
  if (spyObs) spyObs.disconnect();
  const links = [...nav.querySelectorAll("a")];
  spyObs = new IntersectionObserver(es => {
    es.forEach(e => { if (e.isIntersecting) { links.forEach(l => l.classList.toggle("active", l.dataset.target === e.target.id)); if (jump) jump.value = e.target.id; } });
  }, { rootMargin: "-8% 0px -82% 0px", threshold: 0 });
  main.querySelectorAll("section[id]").forEach(s => spyObs.observe(s));
}

$("language")?.addEventListener("change", () => { LANG = $("language").value || "auto"; apply(document, LANG); relabelPreviews(LANG); buildNav(); });

// ---- OPTIONAL, EXPERIMENTAL: Touch Grass link (see src/touchGrass.js) ----
// Switching it on asks the browser for the optional nativeMessaging
// permission; switching it off gives the permission back. It is not part of
// the saved settings, so it is not behind Save.
const TG_STATUS_KEY = "tabguardTouchGrass";
async function tgRefresh() {
  const sw = $("tgLink");
  if (!sw) return;
  let granted = false;
  try { granted = await chrome.permissions.contains({ permissions: ["nativeMessaging"] }); } catch (_) {}
  sw.checked = granted;
  $("tgLinkS").textContent = t(LANG, granted ? "o_on" : "o_off");
  let st = null;
  try { st = (await chrome.storage.session.get(TG_STATUS_KEY))[TG_STATUS_KEY]; } catch (_) {}
  const key = !granted ? "tg_st_off" : st?.state === "connected" ? "tg_st_ok" : "tg_st_missing";
  $("tgLinkStatus").textContent = t(LANG, key);
  if (granted) $("expBox").open = true;
}
$("tgLink")?.addEventListener("change", (e) => {
  // The request has to happen inside the click, with nothing awaited before it.
  const ask = e.target.checked
    ? chrome.permissions.request({ permissions: ["nativeMessaging"] })
    : chrome.permissions.remove({ permissions: ["nativeMessaging"] });
  Promise.resolve(ask).catch(() => {}).finally(tgRefresh);
});
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "session" && changes[TG_STATUS_KEY]) tgRefresh();
});
$("language")?.addEventListener("change", tgRefresh);

async function boot() {
  await load();
  const cfg = (await chrome.storage.local.get(KEY))[KEY] || {};
  LANG = cfg.language || "auto";
  apply(document, LANG);
  initPreviews(() => LANG);
  syncStates();
  const lock = await applyDailyReset();
  renderLock(lock);
  buildNav();
  tgRefresh();
  if (lock.enabled) openGate("change"); // gate on open until the code is typed
}
boot();
