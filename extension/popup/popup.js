import { t, apply } from "../assets/i18n.js";

const $ = (id) => document.getElementById(id);
const msg = (m) => new Promise(r => chrome.runtime.sendMessage(m, x => { void chrome.runtime.lastError; r(x || {}); }));

let LANG = "auto";
const STAGE_COLOR = { none: "#4ade80", grey: "#fbbf24", blur: "#fb923c", block: "#fb7185" };
const STAGE_KEY = { none: "st_none", grey: "st_grey", blur: "st_blur", block: "st_block" };

async function currentHost() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  lastTabUrl = tab && tab.url || "";
  try { return { host: new URL(tab.url).hostname.replace(/^www\./, ""), tabId: tab.id }; }
  catch { return { host: null, tabId: tab && tab.id }; }
}

// Feed to friction, live for this tab: ask the page what it actually sees.
function renderFeed(tabId) {
  const row = $("pgRow"), out = $("pgState");
  if (tabId == null) { row.style.display = "none"; return; }
  chrome.tabs.sendMessage(tabId, { type: "PG_STATUS" }, (r) => {
    if (chrome.runtime.lastError || !r) {
      // no content script here: a browser page, or a tab opened before an update
      out.textContent = t(LANG, "pg_s_noconn"); out.style.color = "var(--faint)";
      row.style.display = "none";
      chrome.storage.local.get("tabguardConfig", g => {
        const on = !!(((g.tabguardConfig || {}).pagination || {}).enabled);
        row.style.display = on && /^https?:/.test(String(lastTabUrl)) ? "" : "none";
      });
      return;
    }
    // only when it is doing something here (or can't): no row for "no feed" or a trusted site
    if (r.code === "off" || r.code === "nofeed" || r.code === "trusted") { row.style.display = "none"; return; }
    const key = { trusted: "pg_s_trusted", nofeed: "pg_s_nofeed", unsupported: "pg_s_unsupported",
      settling: "pg_s_settling", page1: "pg_s_active", holding: "pg_s_active", open: "pg_s_active" }[r.code] || "pg_s_nofeed";
    out.textContent = t(LANG, key);                       // no counts: "active" is all you need to know
    out.style.color = (r.code === "holding" || r.code === "open" || r.code === "page1") ? "var(--ok)" : "var(--faint)";
    row.style.display = "";
  });
}

let lastTabUrl = "";
async function render() {
  const { host, tabId } = await currentHost();
  const s = await msg({ type: "GET_STATUS", host, tabId });

  $("state").textContent = s.enabled ? t(LANG, "state_on") : t(LANG, "state_paused");
  $("state").style.color = s.enabled ? "var(--ok)" : "var(--faint)";

  const stg = s.stage || "none";
  $("fill").style.width = `${Math.round(s.pressure || 0)}%`;
  $("fill").style.background = STAGE_COLOR[stg];
  $("stageLbl").textContent = t(LANG, STAGE_KEY[stg]);
  $("pval").textContent = t(LANG, "pressureLbl", { n: Math.round(s.pressure || 0) });

  renderFeed(tabId);
  $("score").textContent = Math.round(s.score || 0);
  $("mins").textContent = `${(s.sessionMinutes || 0).toFixed(1)}m`;

  const b = $("site");
  if (s.blocked) { b.textContent = t(LANG, "blocked"); b.className = "badge b-lock"; }
  else if (s.locked) { b.textContent = t(LANG, "lockedBadge"); b.className = "badge b-lock"; }
  else if (s.watched) { b.textContent = t(LANG, "watched"); b.className = "badge b-watch"; }
  else { b.textContent = t(LANG, "trusted"); b.className = "badge b-known"; }

  // "block this site": only when the site is watched and not already blocked.
  const canBlock = s.watched && !s.onBlocklist && !s.blocked;
  $("block").style.display = canBlock ? "block" : "none";
  $("block").onclick = async () => {
    const { host } = await currentHost();
    if (!host) return;
    await msg({ type: "BLOCK_SITE", host });
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    render();
  };

  if (s.locked) {
    $("lockRow").style.display = "flex";
    $("unlock").style.display = "block";
    $("lockLeft").textContent = `${Math.ceil((s.lockRemainingMs || 0) / 60000)}m`;
    $("unlock").onclick = () => guard(async () => { await msg({ type: "UNLOCK", host }); render(); });
  }

  // Hardened mode: hide the instant-bypass buttons; manage via Settings.
  const lock = await window.TGLock.getLock();
  $("cool").style.display = lock.enabled ? "none" : "block";
  const cfg = (await chrome.storage.local.get("tabguardConfig")).tabguardConfig || {};
  const autoResume = cfg.autoResumeMinutes ?? 30;
  const pausedActive = !s.enabled && s.pausedUntil && s.pausedUntil > Date.now();
  const leftM = pausedActive ? Math.ceil((s.pausedUntil - Date.now()) / 60000) : 0;

  void autoResume;
  const ex = await msg({ type: "EXIT_STATUS", host });
  EXIT = ex;
  baseLabel.pause = t(LANG, "pauseP");
  baseLabel.reset = t(LANG, ex.resetMode === "full" ? "resetPressure" : "resetHalve");
  stopCountdown();
  if (s.enabled) {
    exitButton("pause", $("toggle"), host);
  } else {
    // resuming is always free
    $("toggle").disabled = false;
    $("toggle").textContent = pausedActive ? t(LANG, "resumeAuto", { m: leftM }) : t(LANG, "resumeP");
    $("toggle").onclick = async () => {
      const c = (await chrome.storage.local.get("tabguardConfig")).tabguardConfig || {};
      c.enabled = true; c.pausedUntil = 0;
      await chrome.storage.local.set({ tabguardConfig: c });
      render();
    };
  }
  exitButton("reset", $("cool"), host);
  const note = $("exitNote");
  const why = !ex.on ? "" : ex.grey ? "ex_noteGrey" : ex.left === 0 ? "ex_noteBudget" : "";
  note.textContent = why ? t(LANG, why) : "";
  note.style.display = why ? "" : "none";
  // a wait already running (popup closed and reopened): show it again
  const p = ex.pending;
  if (p && p.wait <= SHORT_WAIT && (p.kind === "reset" || s.enabled)) countdown(p, p.kind === "pause" ? $("toggle") : $("cool"), host);
}

// ---- emergency exits ----------------------------------------------------------
// Up to SHORT_WAIT seconds the wait is a countdown on the button itself;
// longer waits open a page with a loading bar.
const SHORT_WAIT = 20;
let EXIT = {};
const baseLabel = { pause: "", reset: "" };
let cdTimer = null;
function stopCountdown() { if (cdTimer) { clearInterval(cdTimer); cdTimer = null; } }

function exitButton(kind, btn, host) {
  btn.disabled = false;
  btn.textContent = baseLabel[kind];
  // greyed out, with one shared note under the buttons instead of a suffix on each
  if (EXIT.on && (EXIT.grey || EXIT.left === 0)) { btn.disabled = true; return; }
  btn.onclick = () => guard(async () => {
    const r = await msg({ type: "EXIT_START", kind, host });
    if (r.done) return render();
    if (r.error) return render();
    const p = r.pending;
    if (!p) return render();
    if (p.wait > SHORT_WAIT) { await msg({ type: "OPEN_EXIT_PAGE", kind }); window.close(); return; }
    countdown(p, btn, host);
  });
}

function countdown(p, btn, host) {
  stopCountdown();
  const other = p.kind === "pause" ? $("cool") : $("toggle");
  other.disabled = true;                       // one exit at a time
  const tick = () => {
    const left = Math.ceil((p.readyAt - Date.now()) / 1000);
    if (left > 0) {
      btn.disabled = true;
      btn.textContent = t(LANG, "ex_in", { label: baseLabel[p.kind], s: left });
      return;
    }
    stopCountdown();
    btn.disabled = false;
    btn.textContent = t(LANG, p.kind === "pause" ? "ex_nowPause" : (EXIT.resetMode === "full" ? "ex_nowReset" : "ex_nowHalve"));
    btn.onclick = async () => {
      btn.disabled = true;
      await msg({ type: "EXIT_COMMIT", kind: p.kind, host });
      render();
    };
  };
  tick();
  cdTimer = setInterval(tick, 250);
}



// Weakening actions require typing a shown code when the settings lock is on.
let pendingAction = null;
let pgChallenge = "";
async function guard(action) {
  const lock = (await window.TGLock.getLock());
  if (!lock.enabled) return action();
  pendingAction = action;
  $("pgErr").textContent = "";
  $("pgPass").value = "";
  pgChallenge = window.TGLock.generatePasscode(lock.length || 12);
  $("pgChallenge").textContent = pgChallenge;
  $("pgate").style.display = "flex";
  $("pgPass").focus();
}

async function submitPGate() {
  if ($("pgPass").value !== pgChallenge) { $("pgErr").textContent = t(LANG, "pg_mismatch"); $("pgPass").value = ""; return; }
  $("pgate").style.display = "none";
  const a = pendingAction; pendingAction = null;
  if (a) a();
}
$("pgOk").addEventListener("click", submitPGate);
$("pgCancel").addEventListener("click", () => { $("pgate").style.display = "none"; pendingAction = null; });
$("pgPass").addEventListener("keydown", (e) => { if (e.key === "Enter") submitPGate(); });
if (window.TGLock) window.TGLock.hardenInput($("pgPass"));

$("opts").onclick = () => chrome.runtime.openOptionsPage();

// Hovering the feed row outlines that feed on the page (kept alive by a ping).
let hlPing = 0;
async function feedHighlight(on) {
  clearInterval(hlPing);
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) return;
  const send = (v) => chrome.tabs.sendMessage(tab.id, { type: "PG_HIGHLIGHT", on: v }, () => void chrome.runtime.lastError);
  send(on);
  if (on) hlPing = setInterval(() => send(true), 1000);
}
$("pgRow").addEventListener("mouseenter", () => feedHighlight(true));
$("pgRow").addEventListener("mouseleave", () => feedHighlight(false));

(async () => {
  const cfg = (await chrome.storage.local.get("tabguardConfig")).tabguardConfig || {};
  LANG = cfg.language || "auto";
  apply(document, LANG);
  render();
})();
