import { t, apply, resolve } from "../assets/i18n.js";
import { initPreviews, relabelPreviews } from "./preview.js";
import { LISTS_KEY, parseImport, importStats, migrateImports } from "../src/importList.js";
import { holdLoosening, withPendingShown, pendingAt, LOOSEN_DELAY } from "../src/loosen.js";
import { ESSENTIAL_SUFFIXES, ESSENTIAL_HOSTS } from "../src/essential.js";
import { PRESSURE_ADDS } from "../src/pressureEngine.js";

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
  waitRoom: { enabled: true, hosts: [], seconds: 20, openMinutes: 15 },
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
  $("adultBypass").checked = !(c.adultBlock && c.adultBlock.bypass === false);
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
  $("bypassSites").value = ((c.adultBlock && c.adultBlock.bypassSites) || []).join("\n");
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
  $("sens").value = String([0.6, 1, 1.5].reduce((a, b) => Math.abs(b - (+esc.sensitivity || 1)) < Math.abs(a - (+esc.sensitivity || 1)) ? b : a));
  drawPressure();
  $("revealOn").checked = esc.allowReveal !== false;
  $("dwellOn").checked = !!md.enabled; $("dwellIdle").value = md.idleSeconds;
  $("churnOn").checked = !!sc.enabled; $("churnCount").value = sc.count; $("churnSec").value = sc.seconds;
  $("lnOn").checked = !!ln.enabled; $("lnStart").value = ln.start; $("lnEnd").value = $("exDayStart").value || ln.end;
  const wr = { ...DEFAULTS.waitRoom, ...(c.waitRoom || {}) };
  $("wrOn").checked = wr.enabled !== false; $("wrSec").value = wr.seconds; $("wrOpen").value = wr.openMinutes;
  $("wrHosts").value = (wr.hosts || []).join("\n");
  $("friction").value = c.disableFrictionSeconds;
  $("autoResume").value = c.autoResumeMinutes ?? 30;
  $("language").value = c.language || "auto";
}

const lines = (v) => v.split("\n").map(s => s.trim().toLowerCase().replace(/^www\./, "")).filter(Boolean);
// ---- sorting the lists ---------------------------------------------------------
// A–Z / Z–A only change what you see. What is saved keeps the order you
// entered things in (new lines go to the end), so "as entered" can always be
// shown again. Nothing extra is stored.
const LIST_ORDER = {};
function keepOrder(id, list) {
  const orig = LIST_ORDER[id]; if (!orig) return list;
  const pos = new Map(orig.map((x, i) => [x, i]));
  const known = list.filter(x => pos.has(x)).sort((a, b) => pos.get(a) - pos.get(b));
  return [...new Set([...known, ...list.filter(x => !pos.has(x))])];
}
const ordered = (id) => keepOrder(id, lines($(id).value));
// One small button in the corner of the list: each click switches the view
// (as entered → A–Z → Z–A → as entered). The icon shows the current view.
const SORT_ICONS = {
  entered: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M10 6h10M10 12h10M10 18h10"/><path d="M4 5.5h1.5v4M4 9.5h3M4 15h3l-3 3.5h3"/></svg>',
  az: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 10l2.5-6 2.5 6M4.8 8h3.4M4 14h5l-5 6h5"/><path d="M17 4v16M13.5 16.5L17 20l3.5-3.5"/></svg>',
  za: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h5l-5 6h5M4 20l2.5-6 2.5 6M4.8 18h3.4"/><path d="M17 4v16M13.5 16.5L17 20l3.5-3.5"/></svg>',
};
const SORT_NEXT = { entered: "az", az: "za", za: "entered" };
const SORT_KEY = { entered: "o_sort_entered", az: "o_sort_az", za: "o_sort_za" };
function sortBar(id) {
  const ta = $(id); if (!ta || ta.parentElement.classList.contains("ta-wrap")) return;
  const wrap = document.createElement("div"); wrap.className = "ta-wrap";
  ta.parentNode.insertBefore(wrap, ta); wrap.appendChild(ta);
  const b = document.createElement("button"); b.type = "button"; b.className = "sortbtn"; b.dataset.mode = "entered";
  const raw = (v) => v.split("\n").map(x => x.trim()).filter(Boolean);
  const show = () => {
    const m = b.dataset.mode;
    setHTML(b, SORT_ICONS[m]);
    const label = t(LANG, "o_sort_title", { now: t(LANG, SORT_KEY[m]), next: t(LANG, SORT_KEY[SORT_NEXT[m]]) });
    b.title = label; b.setAttribute("aria-label", label);
  };
  b.addEventListener("click", () => {
    if (!LIST_ORDER[id]) LIST_ORDER[id] = lines(ta.value);
    const m = SORT_NEXT[b.dataset.mode]; b.dataset.mode = m;
    const cur = raw(ta.value);
    ta.value = (m === "az" ? [...cur].sort((x, y) => x.localeCompare(y)) : m === "za" ? [...cur].sort((x, y) => y.localeCompare(x))
      : keepOrder(id, cur.map(x => x.toLowerCase().replace(/^www\./, "")))).join("\n");
    show();
  });
  b.__show = show;
  show();
  wrap.appendChild(b);
}
function relabelSort() { document.querySelectorAll(".sortbtn").forEach(b => b.__show && b.__show()); }
function setHTML(el, html) { const d = new DOMParser().parseFromString(html, "image/svg+xml"); el.replaceChildren(document.importNode(d.documentElement, true)); }

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
  c.allowlist = ordered("allowlist");
  c.academicSearch = ordered("academic");
  c.academicProxies = $("proxyOn").checked;
  c.blocklist = ordered("blocklist");
  c.autoBlockOnLock = $("autoBlock").checked;
  c.adultBlock = { enabled: $("adult").checked, detect: $("adultDetect").checked, searchPause: $("adultSearch").checked,
    greyLinks: $("adultGrey").checked, safeSearch: $("adultSafe").checked, bypass: $("adultBypass").checked,
    terms: keepOrder("adultTerms", [...new Set($("adultTerms").value.split("\n").map(x => x.trim().toLowerCase()).filter(x => x.length >= 2))]),
    extraHosts: ordered("adultLearned"), bypassSites: ordered("bypassSites") };
  c.previews = { enabled: $("pvOn").checked, freezeGifs: $("pvGifs").checked, everywhere: $("pvAll").checked, hoverSwap: $("pvSwap").checked };
  c.exits = { enabled: $("exOn").checked, budget: Math.max(0, Math.min(99, Math.round(+$("exBudget").value || 0))),
    startSeconds: +$("exStart").value >= 10 ? 10 : 5,
    maxSeconds: +$("exMax").value || 120, resetMode: $("exReset").value === "full" ? "full" : "halve", notOnGrey: $("exGrey").checked };
  c.essentialExtra = ordered("essentialExtra");
  c.streamingHosts = ordered("streaming");
  c.fullBlurHosts = ordered("fullBlur");
  c.fullBlurAll = $("fbAll").checked; c.fullBlurDisableLinks = $("fbLinks").checked;
  c.shortForm = { enabled: $("sfOn").checked, action: $("sfAction").value, minSeconds: +$("sfMin").value || 0, portrait: $("sfPortrait").checked, blockShortsUrls: $("sfBlockUrls").checked,
    prePlay: $("sfPrePlay").checked, swipeFeeds: $("sfSwipe").checked };
  c.pagination = { enabled: $("pgOn").checked, pageSize: Math.max(1, +$("pgSize").value || 10), delaySeconds: Math.max(0, +$("pgDelay").value || 0), hosts: ordered("pgHosts") };
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
    enabled: $("escOn").checked, decayMinutes: +$("decay").value, sensitivity: +$("sens").value || 1,
    stages: { grey: +$("sGrey").value, blur: +$("sBlur").value, block: +$("sBlock").value },
    maxBlurPx: +$("maxBlur").value, baseRevealSeconds: +$("revMin").value, maxRevealSeconds: +$("revMax").value,
    allowReveal: $("revealOn").checked,
    add: (c.escalation && c.escalation.add) || undefined,
  };
  c.mediaDwell = { enabled: $("dwellOn").checked, idleSeconds: +$("dwellIdle").value, tickSeconds: 3 };
  c.searchChurn = { enabled: $("churnOn").checked, count: +$("churnCount").value, seconds: +$("churnSec").value };
  c.lateNight = { enabled: $("lnOn").checked, start: $("lnStart").value, end: $("lnEnd").value || "05:00" };
  c.waitRoom = { enabled: $("wrOn").checked, seconds: Math.max(5, Math.min(300, Math.round(+$("wrSec").value || 20))),
    openMinutes: Math.max(1, Math.min(240, Math.round(+$("wrOpen").value || 15))), hosts: ordered("wrHosts") };
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
    setReadOnly(false);
    renderLock(c.lock);
    return;
  }
  editingUnlocked = true;
  $("gate").style.display = "none";
  setReadOnly(false);
  renderLock(c.lock);
}

// on/off state labels next to toggles
const TOGGLES = ["wrOn", "adultBypass", "sfPrePlay", "sfSwipe", "adultSafe", "pvSwap", "exOn", "exGrey", "adultSearch", "adultGrey", "pvOn", "pvGifs", "pvAll", "adultDetect", "proxyOn", "escOn", "dwellOn", "churnOn", "lnOn", "lockReset", "autoBlock", "adult", "intentOn", "srcOn", "sfOn", "sfPortrait", "sfBlockUrls", "fbAll", "fbLinks", "revealOn", "pgOn"];

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

for (const id of ["allowlist", "academic", "blocklist", "adultLearned", "bypassSites", "adultTerms", "essentialExtra", "streaming", "fullBlur", "pgHosts", "wrHosts"]) sortBar(id);

// ---- loosening waits an hour: notes under the affected sections -------------
function renderPending(c) {
  const fmt = (at) => new Date(at).toLocaleTimeString(resolve(LANG), { hour: "2-digit", minute: "2-digit" });
  for (const [id, paths] of [["exPending", ["exits", "lateNight"]], ["adultPending", ["adultBlock"]], ["blockPending", ["blocklist"]], ["essPending", ["essentialExtra"]], ["allowPending", ["allowlist"]], ["academicPending", ["academicSearch"]], ["streamPending", ["streamingHosts"]], ["wrPending", ["waitRoom"]], ["escPending", ["escalation"]]]) {
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
  const store = await migrateImports(chrome.storage.local);
  const box = $("lists"); if (!box) return;
  const fmt = (at) => new Date(at).toLocaleTimeString(resolve(LANG), { hour: "2-digit", minute: "2-digit" });
  box.replaceChildren();
  const lists = store.lists || [];
  if (!lists.length) { const e = document.createElement("div"); e.className = "empty"; e.textContent = t(LANG, "o_ct_none"); box.appendChild(e); return; }
  for (const l of lists) {
    const st = importStats(l.data) || { hosts: 0, paths: 0, patterns: 0, searches: 0 };
    const row = document.createElement("div"); row.className = "li";
    const left = document.createElement("div");
    const nm = document.createElement("div"); nm.className = "nm"; nm.textContent = l.name || "Import";
    const sub = document.createElement("div"); sub.className = "st"; sub.textContent = t(LANG, "o_ct_stats", { h: st.hosts, p: st.paths, w: st.patterns, q: st.searches });
    left.append(nm, sub);
    if (l.removeAt && l.removeAt > Date.now()) { const pd = document.createElement("div"); pd.className = "pd"; pd.textContent = t(LANG, "o_ct_removeAt", { t: fmt(l.removeAt) }); left.appendChild(pd); }
    const btn = document.createElement("button"); btn.type = "button"; btn.className = "mini-btn" + (l.removeAt ? "" : " danger");
    btn.textContent = t(LANG, l.removeAt ? "o_b_ctKeep" : "o_b_ctRemove");
    btn.addEventListener("click", () => (l.removeAt ? keepImport(l.id) : removeImport(l.id)));
    row.append(left, btn); box.appendChild(row);
  }
}
async function importBlockFiles(files) {
  const store = await migrateImports(chrome.storage.local);
  const lists = [...(store.lists || [])];
  let bad = 0;
  for (const file of files) {
    try {
      const d = parseImport(await file.text());
      if (!d.hosts.length && !d.prefixes.length && !d.patterns.length) { bad++; continue; }
      lists.push({ id: Math.random().toString(36).slice(2, 10), name: String(file.name || "Import").slice(0, 80), at: Date.now(), data: d });
    } catch (_) { bad++; }
  }
  await chrome.storage.local.set({ [LISTS_KEY]: { lists } });      // adding is tightening: at once
  const m = $("ctMsg"); m.textContent = bad ? t(LANG, "o_importFail") : ""; m.style.display = bad ? "" : "none";
  renderImport();
}
async function removeImport(id) {
  // removing weakens protection → behind the settings lock like any change, and it waits an hour
  const lock = (await chrome.storage.local.get(KEY))[KEY]?.lock;
  if (lock?.enabled && !editingUnlocked) { openGate("change"); return; }
  const store = await migrateImports(chrome.storage.local);
  const lists = (store.lists || []).map(l => l.id === id ? { ...l, removeAt: l.removeAt || Date.now() + LOOSEN_DELAY } : l);
  await chrome.storage.local.set({ [LISTS_KEY]: { lists } });
  renderImport();
}
async function keepImport(id) {
  const store = await migrateImports(chrome.storage.local);
  const lists = (store.lists || []).map(l => { if (l.id !== id) return l; const { removeAt, ...rest } = l; return rest; });
  await chrome.storage.local.set({ [LISTS_KEY]: { lists } });
  renderImport();
}
$("ctPick")?.addEventListener("click", () => $("ctFile").click());
$("ctFile")?.addEventListener("change", (e) => { const f = [...e.target.files]; if (f.length) importBlockFiles(f); e.target.value = ""; });
setInterval(() => { if (document.visibilityState === "visible") renderImport(); }, 30000);

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
  // the side list scrolls along, so the marked entry is always in view
  const follow = () => { const a = nav.querySelector("a.active"); if (!a) return;
    const r = a.getBoundingClientRect(), n = nav.getBoundingClientRect();
    if (r.top < n.top + 30 || r.bottom > n.bottom - 30) nav.scrollTo({ top: a.offsetTop - nav.clientHeight / 2, behavior: "smooth" }); };
  spyObs = new IntersectionObserver(es => {
    es.forEach(e => { if (e.isIntersecting) { links.forEach(l => l.classList.toggle("active", l.dataset.target === e.target.id)); if (jump) jump.value = e.target.id; follow(); } });
  }, { rootMargin: "-8% 0px -82% 0px", threshold: 0 });
  main.querySelectorAll("section[id]").forEach(s => spyObs.observe(s));
  // at the very end the last sections can't scroll to the top: mark them by position
  const mark = (id) => { links.forEach(l => l.classList.toggle("active", l.dataset.target === id)); if (jump) jump.value = id; follow(); };
  links.forEach(l => l.addEventListener("click", () => setTimeout(() => mark(l.dataset.target), 60)));
  if (!window.__tgSpyEnd) {
    window.__tgSpyEnd = true;
    window.addEventListener("scroll", () => {
      if (window.innerHeight + window.scrollY < document.documentElement.scrollHeight - 4) return;
      const secs = [...main.querySelectorAll("section[id]")];
      const vis = secs.filter(s => s.getBoundingClientRect().top < window.innerHeight * 0.8);
      const last = vis[vis.length - 1]; if (last) mark(last.id);
    }, { passive: true });
  }
}

// ---- number fields: accent steppers ----------------------------------------------
const CHEV_UP = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M6 15l6-6 6 6"/></svg>';
const CHEV_DN = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>';
function enhanceNumbers() {
  document.querySelectorAll('.tg-main input[type=number]').forEach(inp => {
    if (inp.parentElement.classList.contains("num")) return;
    const wrap = document.createElement("span"); wrap.className = "num";
    inp.parentNode.insertBefore(wrap, inp); wrap.appendChild(inp);
    const st = document.createElement("span"); st.className = "st";
    for (const [svg, dir] of [[CHEV_UP, 1], [CHEV_DN, -1]]) {
      const b = document.createElement("button"); b.type = "button"; b.tabIndex = -1;
      b.setAttribute("aria-label", dir > 0 ? "+" : "−");
      setHTML(b, svg);
      b.addEventListener("click", () => {
        if (inp.disabled) return;
        try { dir > 0 ? inp.stepUp() : inp.stepDown(); } catch (_) { inp.value = String((+inp.value || 0) + dir); }
        inp.dispatchEvent(new Event("input", { bubbles: true })); inp.dispatchEvent(new Event("change", { bubbles: true }));
      });
      st.appendChild(b);
    }
    wrap.appendChild(st);
  });
}
enhanceNumbers();

// ---- the pressure, as a picture ------------------------------------------------
// One example hour with the current settings: what raises the pressure, where
// the stages begin, and how it cools off. Redrawn as you change the numbers.
const SVGNS = "http://www.w3.org/2000/svg";
function svgEl(tag, attrs, text) { const e = document.createElementNS(SVGNS, tag); for (const [k, v] of Object.entries(attrs || {})) e.setAttribute(k, v); if (text != null) e.textContent = text; return e; }
function drawPressure() {
  const box = $("pxChart"); if (!box) return;
  const tau = Math.max(1, +$("decay").value || 25), k = +$("sens").value || 1;
  const st = { grey: +$("sGrey").value || 20, blur: +$("sBlur").value || 50, block: +$("sBlock").value || 80 };
  const add = Object.fromEntries(Object.entries(PRESSURE_ADDS).map(([n, v]) => [n, v * k]));
  // the example story: each step is numbered on the curve and in the list below
  const story = [
    { n: 1, at: [2], kind: "scroll" }, { n: 2, at: [5], kind: "scroll" }, { n: 3, at: [8], kind: "scroll" },
    { n: 4, at: [10], kind: "tabPause" }, { n: 5, at: [12, 12.1, 12.2, 12.3, 12.4, 12.5], kind: "dwell" },
    { n: 6, at: [15, 17], kind: "revisit" },
  ];
  const events = story.flatMap(s => s.at.map(t => [t, s.kind, s.n])).sort((p, q) => p[0] - q[0]);
  const T = 60, step = 0.1, pts = []; let v = 0, ei = 0; const marks = new Map();
  for (let t = 0; t <= T + 1e-9; t += step) {
    v *= Math.exp(-step / tau);
    while (ei < events.length && events[ei][0] <= t + 1e-9) { v = Math.min(100, v + add[events[ei][1]]); marks.set(events[ei][2], [t, v]); ei++; }
    pts.push([t, v]);
  }
  const W = 640, H = 230, L = 34, R = 92, Tp = 14, B = 26, x = (t) => L + (t / T) * (W - L - R), y = (p) => Tp + (1 - p / 100) * (H - Tp - B);
  const svg = svgEl("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": t(LANG, "o_px_title") });
  const band = (from, to, fill) => svg.appendChild(svgEl("rect", { x: L, y: y(to), width: W - L - R, height: Math.max(0, y(from) - y(to)), fill }));
  band(st.grey, st.blur, "rgba(160,170,190,.10)"); band(st.blur, st.block, "rgba(111,157,255,.12)"); band(st.block, 100, "rgba(251,113,133,.13)");
  for (const p of [0, 50, 100]) svg.appendChild(svgEl("text", { x: L - 8, y: y(p) + 4, fill: "#6a7284", "font-size": 11, "text-anchor": "end" }, String(p)));
  for (const m of [0, 15, 30, 45, 60]) svg.appendChild(svgEl("text", { x: x(m), y: H - 8, fill: "#6a7284", "font-size": 11, "text-anchor": "middle" }, m === 60 ? `${m} ${t(LANG, "o_px_min")}` : String(m)));
  svg.appendChild(svgEl("line", { x1: L, x2: W - R, y1: y(0), y2: y(0), stroke: "#2a3042" }));
  const area = `M${x(0)},${y(0)} ` + pts.map(([a, b]) => `L${x(a).toFixed(1)},${y(b).toFixed(1)}`).join(" ") + ` L${x(T)},${y(0)} Z`;
  svg.appendChild(svgEl("path", { d: area, fill: "rgba(111,157,255,.10)" }));
  svg.appendChild(svgEl("path", { d: "M" + pts.map(([a, b]) => `${x(a).toFixed(1)},${y(b).toFixed(1)}`).join(" L"), fill: "none", stroke: "#e8ebf2", "stroke-width": 2, "stroke-linejoin": "round" }));
  for (const s of story) {
    const m = marks.get(s.n); if (!m) continue;
    const g = svgEl("g", {});
    g.appendChild(svgEl("circle", { cx: x(m[0]), cy: y(m[1]) - 12, r: 8, fill: "#e8ebf2" }));
    g.appendChild(svgEl("text", { x: x(m[0]), y: y(m[1]) - 8, "font-size": 10.5, "font-weight": 700, fill: "#0d1017", "text-anchor": "middle" }, String(s.n)));
    svg.appendChild(g);
  }
  // threshold lines: drag them up or down
  const ids = { grey: "sGrey", blur: "sBlur", block: "sBlock" };
  for (const [key, label, col] of [["grey", "o_px_grey", "#9aa3b6"], ["blur", "o_px_blur", "#6f9dff"], ["block", "o_px_block", "#fb7185"]]) {
    const p = st[key];
    const g = svgEl("g", { class: "drag", "data-key": key });
    g.appendChild(svgEl("line", { x1: L, x2: W - R, y1: y(p), y2: y(p), stroke: col, "stroke-dasharray": "4 4", "stroke-width": 1.2 }));
    g.appendChild(svgEl("line", { x1: L, x2: W - 4, y1: y(p), y2: y(p), stroke: "transparent", "stroke-width": 14 }));
    g.appendChild(svgEl("path", { d: `M${W - R + 6},${y(p) - 4} l4,-4 l4,4 M${W - R + 6},${y(p) + 4} l4,4 l4,-4`, stroke: col, fill: "none", "stroke-width": 1.4 }));
    g.appendChild(svgEl("text", { x: W - R + 20, y: y(p) + 4, fill: col, "font-size": 12 }, `${t(LANG, label)} · ${p}`));
    g.addEventListener("pointerdown", (ev) => {
      if ($(ids[key]).disabled) return;
      ev.preventDefault(); g.setPointerCapture(ev.pointerId);
      const move = (e) => {
        const cur = $("pxChart").querySelector("svg") || svg; const r = cur.getBoundingClientRect(); if (!r.height) return; const py = (e.clientY - r.top) * (H / r.height);
        let val = Math.round(100 * (1 - (py - Tp) / (H - Tp - B)));
        const lo = key === "grey" ? 1 : (+$(key === "blur" ? "sGrey" : "sBlur").value || 0) + 1;
        const hi = key === "block" ? 100 : (+$(key === "grey" ? "sBlur" : "sBlock").value || 100) - 1;
        val = Math.max(lo, Math.min(hi, val));
        if (+$(ids[key]).value !== val) { $(ids[key]).value = val; drawPressure(); }
      };
      const up = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
      window.addEventListener("pointermove", move); window.addEventListener("pointerup", up);
    });
    svg.appendChild(g);
  }
  const head = document.createElement("p"); head.className = "t"; head.textContent = t(LANG, "o_px_title");
  const desc = document.createElement("p"); desc.className = "d"; desc.textContent = t(LANG, "o_px_desc2");
  const ol = document.createElement("ol");
  for (const s of story) {
    const li = document.createElement("li");
    const n = document.createElement("span"); n.className = "n"; n.textContent = String(s.n);
    const pts2 = document.createElement("b"); pts2.textContent = (s.at.length > 1 ? s.at.length + " × " : "") + "+" + Math.round(add[s.kind]);
    li.append(n, document.createTextNode(t(LANG, "o_pxs_" + s.n)), pts2); ol.appendChild(li);
  }
  const more = document.createElement("p"); more.className = "dec"; more.textContent = t(LANG, "o_px_more", { lock: Math.round(add.tabLock), churn: Math.round(add.churn) });
  const dec = document.createElement("p"); dec.className = "dec"; dec.textContent = t(LANG, "o_px_decay", { m: Math.round(tau * Math.LN2) });
  const hint = document.createElement("p"); hint.className = "hint"; hint.textContent = t(LANG, "o_px_drag");
  box.replaceChildren(head, desc, svg, hint, ol, more, dec);
}
for (const id of ["decay", "sens", "sGrey", "sBlur", "sBlock"]) { $(id)?.addEventListener("input", drawPressure); $(id)?.addEventListener("change", drawPressure); }

$("language")?.addEventListener("change", () => { LANG = $("language").value || "auto"; apply(document, LANG); relabelPreviews(LANG); buildNav(); relabelSort(); renderImport(); drawPressure(); });

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
  $("tgLinkStatus").textContent = t(LANG, key) + (granted && st?.state !== "connected" && st?.error ? ` (${st.error})` : "");
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
// ---- view only, while locked ---------------------------------------------------
// The settings can be read (and exported) without typing the code; every
// control that would change something stays inert until you unlock.
const RO_KEEP = new Set(["exportBtn", "roUnlock", "jump", "gatePass", "gateSubmit", "gateView"]);
function setReadOnly(on) {
  document.body.classList.toggle("readonly", on);
  document.querySelectorAll(".tg-main input, .tg-main textarea, .tg-main select, .tg-main button, #saveM, #save").forEach(el => {
    if (RO_KEEP.has(el.id) || el.closest(".sortbar")) return;
    if (on) { if (!el.disabled) { el.disabled = true; el.dataset.roOff = "1"; } }
    else if (el.dataset.roOff) { el.disabled = false; delete el.dataset.roOff; }
  });
}
$("gateView")?.addEventListener("click", () => { $("gate").style.display = "none"; if (!editingUnlocked) setReadOnly(true); });
$("roUnlock")?.addEventListener("click", () => openGate("change"));
boot();
