import { t } from "../assets/i18n.js";

// Builds DOM from the extension's own markup templates (no page content goes in
// unescaped). DOMParser never runs scripts; the nodes are moved into place.
function setHTML(el, html) {
  const doc = new DOMParser().parseFromString("<!doctype html><body>" + html, "text/html");
  el.replaceChildren(...doc.body.childNodes);
}

const params = new URLSearchParams(location.search);
const host = params.get("host") || "";
const reason = params.get("reason") || "";

// Where the tab was going. Only http(s), and only on the locked site itself,
// so this page can never be used to send you somewhere else.
function destination() {
  const raw = params.get("url");
  if (raw) {
    try {
      const u = new URL(raw);
      const h = u.hostname.replace(/^www\./, ""), want = host.replace(/^www\./, "");
      if ((u.protocol === "https:" || u.protocol === "http:") && (h === want || h.endsWith("." + want))) return u.href;
    } catch (_) {}
  }
  return host ? `https://${host}/` : null;      // older cooldown tabs carried only the host
}
const target = destination();

let LANG = "auto";
let firstTick = true, freeShown = false;
const ESCALATED_WAIT_MS = 10000;               // no lock to wait out here, so a short pause instead
const openedAt = Date.now();

async function boot() {
  const cfg = (await chrome.storage.local.get("tabguardConfig")).tabguardConfig || {};
  LANG = cfg.language || "auto";
  document.getElementById("host").textContent = host || t(LANG, "cd_thisSite");
  // the nudge, with one of two questions
  document.getElementById("nudge").textContent = t(LANG, "cd_nudge") + " " + t(LANG, Math.random() < 0.5 ? "cd_nudgeQ1" : "cd_nudgeQ2");

  const hard = reason === "temp" || reason === "blocked" || reason === "adult" || reason === "import" || reason === "unfiltered" || reason === "proxy";
  const adultish = reason === "adult" || reason === "unfiltered" || reason === "proxy";
  if (hard) {
    document.querySelector(".glyph").textContent = reason === "proxy" ? "🧭" : adultish ? "🔞" : "🚫";
    const until = +params.get("until") || 0;
    // a temporary block runs out by itself: then the way on appears here
    if (reason === "temp" && until && target) {
      const iv = setInterval(() => {
        if (Date.now() < until) return;
        clearInterval(iv);
        const a = document.getElementById("go");
        a.textContent = t(LANG, "cd_go", { host: host || new URL(target).hostname });
        a.href = target; a.style.display = "inline-block";
      }, 1000);
    }
    const hhmm = until ? new Date(until).toLocaleTimeString(LANG === "auto" ? undefined : LANG, { hour: "2-digit", minute: "2-digit" }) : "";
    document.querySelector("h1").textContent = reason === "temp" ? t(LANG, "cd_tempTitle", { t: hhmm }) : reason === "proxy" ? t(LANG, "cd_proxyTitle") : adultish ? t(LANG, "cd_adultTitle") : t(LANG, "cd_blocked");
    document.getElementById("timer").style.display = "none";
    document.getElementById("lead").textContent = "";
    document.getElementById("host").style.display = "none";
    document.getElementById("reason").textContent = t(LANG, { temp: "cd_reasonTemp", adult: "cd_reasonAdult", import: "cd_reasonImport", unfiltered: "cd_reasonUnfiltered", proxy: "cd_reasonProxy" }[reason] || "cd_reasonBlock");
    // how to undo it — only where that is possible, and said as it is
    const locked = !!(cfg.lock && cfg.lock.enabled);
    const hintKey = reason === "proxy" ? "cd_hintProxy" : (reason === "unfiltered" || reason === "temp") ? "" : locked ? "cd_hintLock" : "cd_hintNoLock";
    if (hintKey) {
      const p = document.createElement("p");
      p.className = "small";
      p.textContent = t(LANG, hintKey);
      document.querySelector(".card").appendChild(p);
    }
  } else {
    document.querySelector("h1").textContent = t(LANG, "cd_cooldown");
    document.getElementById("lead").textContent = t(LANG, "cd_lead");
    document.getElementById("reason").textContent =
      reason === "escalated" ? t(LANG, "cd_escalated")
      : reason === "locked" ? t(LANG, "cd_lockedReason") : "";
    tick(); setInterval(tick, 1000);
  }

  // the way out that isn't the site: your last tab, or a real break
  offerWaysOut();

  // localize the static small paragraph (marked with data-t in html)
  document.querySelectorAll("[data-t]").forEach(el => { el.textContent = t(LANG, el.getAttribute("data-t")); });
  document.title = document.querySelector("h1").textContent + " · Tab Guard";
}

// ---- ways out: back to the last tab, or a break --------------------------
// Most of all Tab Guard wants you to step away until the pressure drops; going
// back to what you were doing before is the other good way.
async function lastTab() {
  try {
    const me = await chrome.tabs.getCurrent();
    if (!me) return null;
    const ours = chrome.runtime.getURL("");
    const tabs = (await chrome.tabs.query({ windowId: me.windowId }))
      .filter(x => x.id !== me.id && x.url && !x.url.startsWith(ours));   // never another block page
    if (!tabs.length) return null;
    tabs.sort((a, b) => (b.lastAccessed || 0) - (a.lastAccessed || 0) || Math.abs(a.index - me.index) - Math.abs(b.index - me.index));
    return { me, prev: tabs[0] };
  } catch (_) { return null; }
}

async function offerWaysOut() {
  const back = document.getElementById("back"), brk = document.getElementById("brk");
  brk.textContent = t(LANG, "cd_break");
  brk.addEventListener("click", startBreak);
  const lt = await lastTab();
  if (!lt) return;
  back.textContent = t(LANG, "cd_back");
  back.hidden = false;
  back.addEventListener("click", async () => {
    try { await chrome.tabs.update(lt.prev.id, { active: true }); await chrome.tabs.remove(lt.me.id); } catch (_) {}
  });
}

const BREAK_MS = 5 * 60 * 1000;
function startBreak() {
  const card = document.querySelector(".card");
  setHTML(card, `<div class="glyph">🌿</div><h1 id="bt"></h1><div class="timer" id="bm"></div><p id="bs"></p>`);
  card.querySelector("#bt").textContent = t(LANG, "br_title");
  document.title = t(LANG, "br_title") + " · Tab Guard";
  const end = Date.now() + BREAK_MS;
  const tickBreak = () => {
    const left = end - Date.now();
    card.querySelector("#bm").textContent = fmt(left);
    card.querySelector("#bs").textContent = left > 0 ? t(LANG, "br_sub", { t: fmt(left) }) : t(LANG, "br_end");
    if (left <= 0) { clearInterval(iv); setTimeout(() => location.reload(), 2500); }
  };
  const iv = setInterval(tickBreak, 500);
  tickBreak();
}

function fmt(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}

function go() { if (target) location.replace(target); }

function showFree() {
  const el = document.getElementById("timer");
  if (!el) return;
  el.textContent = t(LANG, "cd_cleared"); el.style.color = "#4ade80";
  if (!target || freeShown) return;
  freeShown = true;
  el.classList.add("free"); el.onclick = go;
  const a = document.getElementById("go");
  a.textContent = t(LANG, "cd_go", { host: host || new URL(target).hostname });
  a.href = target;
  a.onclick = (e) => { e.preventDefault(); go(); };
  a.style.display = "inline-block";
}

async function tick() {
  const el = document.getElementById("timer");
  if (!el) return;                             // a break has taken over the page
  if (reason === "escalated") {
    const left = ESCALATED_WAIT_MS - (Date.now() - openedAt);
    if (left > 0) { el.textContent = fmt(left); return; }
    return showFree();                         // never auto-forward: that would undo the pause
  }
  const resp = await new Promise(r =>
    chrome.runtime.sendMessage({ type: "GET_STATUS", host }, x => { void chrome.runtime.lastError; r(x || {}); }));
  if (resp.locked && resp.lockRemainingMs > 0) { el.textContent = fmt(resp.lockRemainingMs); firstTick = false; return; }
  // Reloading a cooldown tab after the lock has ended takes you where you were going.
  if (firstTick && reason === "locked" && target) return go();
  firstTick = false;
  showFree();
}

boot();


// ---- emergency access (once a day, 20 minutes) --------------------------------
// Not offered for the content filter: that block exists exactly for the moment
// you'd want to skip it.
const send = (m) => new Promise(r => chrome.runtime.sendMessage(m, x => { void chrome.runtime.lastError; r(x || {}); }));
async function emergencyOffer() {
  const box = document.getElementById("em");
  if (!box || !host || !target || reason === "adult" || reason === "unfiltered" || reason === "proxy" || reason === "temp") return;
  const st = await send({ type: "EMERGENCY_STATUS", host });
  if (!st.available) { box.replaceChildren(); return; }
  setHTML(box, `<button class="eml" id="emLink"></button>`);
  const link = box.querySelector("#emLink");
  link.textContent = t(LANG, "em_link");
  link.addEventListener("click", () => {
    setHTML(box, `<div class="emp"><b></b><p></p><button class="emh" id="emHold"><i></i><span></span></button><button class="emc" id="emCancel"></button></div>`);
    box.querySelector("b").textContent = t(LANG, "em_title");
    box.querySelector("p").textContent = t(LANG, "em_text");
    box.querySelector("#emHold span").textContent = t(LANG, "em_hold");
    box.querySelector("#emCancel").textContent = t(LANG, "em_cancel");
    box.querySelector("#emCancel").addEventListener("click", emergencyOffer);
    const hold = box.querySelector("#emHold"), bar = hold.querySelector("i");
    let t0 = 0, raf = 0;
    const stop = () => { cancelAnimationFrame(raf); bar.style.width = "0"; };
    const step = async () => {
      const p = Math.min(1, (Date.now() - t0) / 5000);
      bar.style.width = (p * 100) + "%";
      if (p < 1) { raf = requestAnimationFrame(step); return; }
      hold.disabled = true;
      const r = await send({ type: "EMERGENCY_START", host, reason, url: target });
      if (r.ok) location.href = target; else stop();
    };
    hold.addEventListener("pointerdown", (e) => { e.preventDefault(); t0 = Date.now(); raf = requestAnimationFrame(step); });
    ["pointerup", "pointerleave", "pointercancel"].forEach(ev => hold.addEventListener(ev, () => { if (!hold.disabled) stop(); }));
  });
}
setTimeout(emergencyOffer, 300);
