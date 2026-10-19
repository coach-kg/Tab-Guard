// overlay.js — the intervention screen, injected in a shadow root so page CSS
// can't touch it. Two modes:
//   "intention" — the OneSec-style breathe-then-set-intention pause
//   "pause"     — the circuit-breaker full-screen stop (too many tabs)
// Friction, not a hard wall: to bypass you must let the breath finish, and the
// dismiss button only unlocks after disableFrictionSeconds.

import { t } from "../assets/i18n.js";

// Builds DOM from the extension's own markup templates (no page content goes in
// unescaped). DOMParser never runs scripts; the nodes are moved into place.
function setHTML(el, html) {
  const doc = new DOMParser().parseFromString("<!doctype html><body>" + html, "text/html");
  el.replaceChildren(...doc.body.childNodes);
}

let host = null;

export function removeIntervention() {
  if (host) { host.remove(); host = null; }
}

export function showIntervention(opts, onResult) {
  removeIntervention();
  const L = opts.lang;
  const tr = (k, v) => t(L, k, v);
  const breathSeconds = Math.max(3, Number(opts.breathSeconds) || 8);
  const friction = Math.max(0, Number(opts.disableFrictionSeconds) || 0);

  host = document.createElement("div");
  host.id = "tabguard-overlay-host";
  host.style.cssText = "all:initial;position:fixed;inset:0;z-index:2147483647;";
  (document.documentElement).appendChild(host);
  const root = host.attachShadow({ mode: "open" });

  const accent = opts.late ? "#8b5cf6" : "#3b82f6";
  setHTML(root, `
    <style>
      :host { all: initial; }
      .wrap { position: fixed; inset: 0; display: flex; align-items: center; justify-content: center;
        background: rgba(10,12,18,.72); backdrop-filter: blur(14px);
        font: 16px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif; color: #f4f6fb; }
      .card { width: min(92vw, 460px); text-align: center; padding: 34px 30px 28px;
        background: #12151f; border: 1px solid #232838; border-radius: 22px;
        box-shadow: 0 30px 80px rgba(0,0,0,.5); }
      .ring { width: 128px; height: 128px; margin: 4px auto 18px; position: relative; }
      svg { transform: rotate(-90deg); }
      .track { stroke: #232838; }
      .prog { stroke: ${accent}; stroke-linecap: round; }
      .ring svg { transform-origin: 50% 50%; transition: transform .12s linear; }
      .breath { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
        font-size: 15px; color: #aeb6c8; transition: color .3s; }
      h1 { margin: 0 0 6px; font-size: 22px; font-weight: 650; letter-spacing: -.01em; }
      .sub { margin: 0 0 18px; font-size: 14px; color: #9aa3b6; }
      .reason { font-size: 12.5px; color: #6f7891; margin-bottom: 16px; }
      input { width: 100%; box-sizing: border-box; padding: 12px 14px; margin-bottom: 16px;
        background: #0d1017; border: 1px solid #2a3042; border-radius: 12px; color: #f4f6fb; font-size: 15px; }
      input::placeholder { color: #5b6478; }
      .btns { display: flex; flex-direction: column; gap: 10px; }
      button { padding: 13px 16px; border-radius: 12px; border: 0; font-size: 15px; font-weight: 600;
        cursor: pointer; font-family: inherit; }
      .close { background: ${accent}; color: white; }
      .break { background: #1b2130; color: #cdd4e4; }
      .continue { background: transparent; color: #6f7891; border: 1px solid #2a3042; }
      .continue:disabled { opacity: .4; cursor: not-allowed; }
      .hint { margin-top: 12px; font-size: 11.5px; color: #5b6478; }
      .late { color: #c4b5fd; font-size: 12px; margin-bottom: 10px; }
      .sources { margin: 4px 0 14px; }
      .sources .lbl { font-size: 11.5px; color: #6f7891; margin-bottom: 8px; }
      .src { display: inline-block; margin: 3px; padding: 7px 12px; font-size: 13px; color: #cdd4e4;
        background: #171c28; border: 1px solid #2a3042; border-radius: 999px; cursor: pointer; }
      .src:hover { border-color: ${accent}; color: #fff; }
      .hint.ok { color: #6fbf8a; }
      .iw { position: relative; }
      .iw input { padding-right: 38px; }
      .iw .tick { position: absolute; right: 14px; top: 12px; font-size: 15px; line-height: 1.4; color: #6fbf8a; opacity: 0; transition: opacity .4s; pointer-events: none; }
      .iw.ok .tick { opacity: .9; }
    </style>
    <div class="wrap">
      <div class="card">
        ${opts.late ? `<div class="late">${tr("ov_late")}</div>` : ''}
        <div class="ring">
          <svg width="128" height="128" viewBox="0 0 128 128">
            <circle class="track" cx="64" cy="64" r="58" fill="none" stroke-width="8"/>
            <circle class="prog" cx="64" cy="64" r="58" fill="none" stroke-width="8"
              stroke-dasharray="364.4" stroke-dashoffset="0"/>
          </svg>
          <div class="breath">${tr("ov_breathe")}</div>
        </div>
        <h1>${opts.mode === "pause" ? tr("ov_pauseTitle") : tr("ov_oneMoment")}</h1>
        <p class="sub">${opts.mode === "pause" ? tr("ov_pauseSub") : tr("ov_intentSub")}</p>
        <div class="reason">${escapeHtml(opts.reason || "")}</div>
        ${opts.mode === "intention" ? `<div class="iw" id="iw"><input id="intent" placeholder="${escapeHtml(opts.question || tr("ov_question"))}" autocomplete="off"/><span class="tick" aria-hidden="true">✓</span></div>` : ''}
        ${sourcesHtml(opts.betterSources, tr("ov_sources"))}
        <div class="btns">
          <button class="close" id="close">${tr("ov_close")}</button>
          <button class="break" id="break">${tr("ov_break")}</button>
          <button class="continue" id="continue" disabled>${tr("ov_continue")}</button>
        </div>
        <div class="hint" id="hint"></div>
      </div>
    </div>`);

  // Breathing animation: the outline fills on the inhale, holds full, empties
  // on the exhale — looping, so you can actually see the cadence and follow it.
  const C = 364.4;                    // circle circumference (r = 58)
  const IN = 4000, HOLD = 2000, OUT = 6000; // ms per phase (4-2-6, calming)
  const CYCLE = IN + HOLD + OUT;
  const prog = root.querySelector(".prog");
  const svg = root.querySelector(".ring svg");
  const breath = root.querySelector(".breath");
  prog.style.strokeDashoffset = String(C); // start empty
  const labels = { in: tr("ov_in"), hold: tr("ov_hold"), out: tr("ov_out") };
  let breatheRaf = null;
  const start = performance.now();
  function frame(now) {
    const pos = (now - start) % CYCLE;
    let p, phase; // p = fill 0..1
    if (pos < IN) { p = pos / IN; phase = "in"; }
    else if (pos < IN + HOLD) { p = 1; phase = "hold"; }
    else { p = 1 - (pos - IN - HOLD) / OUT; phase = "out"; }
    prog.style.strokeDashoffset = String(C * (1 - p));
    const scale = 0.82 + 0.18 * p;                 // gentle grow/shrink
    svg.style.transform = `rotate(-90deg) scale(${scale.toFixed(3)})`;
    breath.textContent = labels[phase];
    breath.style.color = phase === "hold" ? "#cdd4e4" : "#8b93a7";
    breatheRaf = requestAnimationFrame(frame);
  }
  breatheRaf = requestAnimationFrame(frame);

  // "Continue anyway" stays locked until the breath finishes + friction delay
  const cont = root.querySelector("#continue");
  const hint = root.querySelector("#hint");
  let unlockAt = Date.now() + breathSeconds * 1000 + friction * 1000;
  let intentOk = false;
  const tick = setInterval(() => {
    const left = Math.ceil((unlockAt - Date.now()) / 1000);
    hint.classList.toggle("ok", intentOk);                       // a clear intention: the countdown just turns green
    if (left > 0) { hint.textContent = tr(intentOk ? "ov_intentOk" : "ov_unlockIn", { s: left }); }
    else { hint.textContent = ""; cont.disabled = false; clearInterval(tick); }
  }, 250);

  // A clear intention shortens the wait to 3–5 s (random, so it can't be
  // timed). No Enter needed: it counts once you pause typing for a moment.
  // Enter does it at once. A small ✓ at the end of the field says it counted;
  // something unreadable gets no comment — the ✓ just doesn't appear.
  const intent = root.querySelector("#intent");
  if (intent) {
    let idle = null;
    const accept = () => {
      if (intentOk || !intentLooksClear(intent.value)) return false;
      root.querySelector("#iw").classList.add("ok");
      intentOk = true;
      unlockAt = Math.min(unlockAt, Date.now() + 3000 + Math.floor(Math.random() * 2001));
      return true;
    };
    intent.addEventListener("input", () => {
      clearTimeout(idle);
      idle = setTimeout(accept, 1200);
    });
    intent.addEventListener("keydown", (e) => {
      if (e.key !== "Enter") return;
      e.preventDefault();
      clearTimeout(idle);
      accept();
    });
  }

  function finish(action) {
    if (breatheRaf) cancelAnimationFrame(breatheRaf); clearInterval(tick);
    removeIntervention();
    onResult(action);
  }

  root.querySelector("#close").addEventListener("click", () => finish("closed"));
  root.querySelector("#break").addEventListener("click", () => finish("break"));
  cont.addEventListener("click", () => { if (!cont.disabled) finish("continued"); });
  root.querySelectorAll(".src").forEach(el => el.addEventListener("click", () => {
    const url = el.getAttribute("data-url");
    if (url) { finish("continued"); location.href = url; }
  }));

  // Leaving the tab / navigating away without choosing counts as "ignored".
  window.addEventListener("pagehide", () => { if (host) onResult("ignored"); }, { once: true });
}

// Does this read like an actual intention? One real word is enough ("Buch").
// Only keyboard mashing ("ncs,dsjkf sdfjksdf", "asdf", "aaaa") and stock
// non-answers ("nichts", "weiter", "idk") are turned away.
const KEY_RUNS = ["qwertzuiop", "qwertyuiop", "asdfghjkl", "yxcvbnm", "zxcvbnm"];
function looksLikeWord(w) {
  const letters = w.replace(/[^\p{L}]/gu, "");
  if (letters.length < 3) return false;
  if (/(.)\1{2,}/u.test(letters)) return false;                         // "aaa", "kkkk"
  const vowels = (letters.match(/[aeiouyäöüàâéèêëîïôûùáíóúăœæ]/giu) || []).length;
  if (vowels === 0 || vowels / letters.length < 0.18) return false;      // "sdfjksdf", "dsjkf"
  for (const run of KEY_RUNS)                                          // "asdf", "qwer", "hjkl"
    for (let i = 0; i + 4 <= run.length; i++) if (letters.includes(run.slice(i, i + 4))) return false;
  return true;
}
export function intentLooksClear(text) {
  const t = String(text || "").toLowerCase().replace(/\s+/g, " ").trim().replace(/[.!?…]+$/, "");
  const filler = /^(nothing|nix|nichts|idk|egal|whatever|weiter|weitermachen|scroll|scrolling|scrollen|keine ahnung|no idea|just looking|nur gucken|nur schauen|weiß nicht|weiss nicht|dunno|rien|nada|nimic|test)$/;
  if (!t || filler.test(t)) return false;
  const words = t.split(/[^\p{L}\p{N}']+/u).filter(w => /\p{L}/u.test(w));
  if (!words.length) return false;
  const real = words.filter(looksLikeWord).length;
  return real >= 1 && real >= words.length / 2;                         // most of it reads like words
}

function sourcesHtml(sources, label) {
  if (!Array.isArray(sources) || !sources.length) return "";
  const chips = sources.filter(s => s && s.url).slice(0, 6).map(s =>
    `<span class="src" data-url="${escapeHtml(s.url)}">${escapeHtml(s.label || s.url)}</span>`).join("");
  if (!chips) return "";
  return `<div class="sources"><div class="lbl">${escapeHtml(label || "Or go somewhere better:")}</div>${chips}</div>`;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
