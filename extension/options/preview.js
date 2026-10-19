// preview.js — "▶ preview" buttons on the settings page.
//
// Each one shows what a feature does, for five seconds, and then gets out of
// the way by itself. It never locks anything: Esc or a click on the backdrop
// ends it early, and nothing is stored or sent. Where the real thing is a
// self-contained screen (the breathing pause), the preview runs the real
// overlay code; the rest are small live stagings with the same filters,
// texts and button the content script uses on real pages.

import { t } from "../assets/i18n.js";
import { showIntervention, removeIntervention } from "../content/overlay.js";

// Builds DOM from the extension's own markup templates (no page content goes in
// unescaped). DOMParser never runs scripts; the nodes are moved into place.
function setHTML(el, html) {
  const doc = new DOMParser().parseFromString("<!doctype html><body>" + html, "text/html");
  el.replaceChildren(...doc.body.childNodes);
}

const SECONDS = 5;
let active = null;                       // { end(), timer } of the running preview

const css = `
.pv-btn{margin-left:auto;font:600 12px/1 var(--mono,ui-monospace,monospace);letter-spacing:.04em;color:var(--accent,#3b82f6);
  background:transparent;border:1px solid currentColor;border-radius:999px;padding:5px 10px;cursor:pointer;opacity:.85}
.pv-btn:hover{opacity:1}
h2.pv-h{display:flex;align-items:center;gap:8px}
.pv-back{position:fixed;inset:0;z-index:2147483400;background:rgba(6,8,12,.72);backdrop-filter:blur(3px);display:flex;align-items:center;justify-content:center}
.pv-bar{position:fixed;left:50%;top:18px;transform:translateX(-50%);z-index:2147483647;background:#12151f;color:#cdd4e4;
  border:1px solid #2a3042;border-radius:999px;padding:7px 14px;font:12.5px/1 system-ui,sans-serif;overflow:hidden;cursor:pointer}
.pv-bar i{position:absolute;left:0;bottom:0;height:2px;background:#3b82f6;width:100%;transform-origin:left;animation:pvshrink ${SECONDS}s linear forwards}
@keyframes pvshrink{to{transform:scaleX(0)}}
.pv-stage{width:min(560px,92vw);border-radius:14px;overflow:hidden;background:#f6f4ef;color:#1d1d1f;box-shadow:0 30px 80px rgba(0,0,0,.6);position:relative}
.pv-stage.dark{background:#0d1017;color:#e8ecf3}
.pv-pg{padding:18px 20px 22px;font:15px/1.45 Georgia,serif;transition:filter .4s}
.pv-pg h4{margin:0 0 10px;font:700 13px/1 system-ui;letter-spacing:.12em;text-transform:uppercase;color:#b4302a}
.pv-img{display:block;width:100%;height:170px;border-radius:8px;background:linear-gradient(135deg,#ff7a59,#ffb347 45%,#6a5acd);transition:filter .4s}
.pv-row{display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-top:10px}
.pv-row div{height:60px;border-radius:6px;transition:filter .4s}
.pv-txt{margin:12px 0 0}
.pv-tag{position:absolute;right:12px;top:12px;background:rgba(11,14,20,.85);color:#fff;font:700 12px/1 system-ui;padding:6px 10px;border-radius:999px}
.pv-block{position:absolute;inset:0;background:rgba(13,16,23,.94);color:#e8ecf3;display:none;flex-direction:column;align-items:center;justify-content:center;gap:8px;font:600 16px system-ui}
.pv-feed{padding:14px;display:flex;flex-direction:column;gap:8px;max-height:420px;overflow:hidden}
.pv-post{background:#1d2226;border-radius:8px;padding:12px;font:13px/1.4 system-ui;color:#e8e6e3}
.pv-post b{display:block;margin-bottom:6px}
.pv-post span{display:block;height:46px;border-radius:5px;background:linear-gradient(135deg,#2b3a4a,#1a2530)}
.pv-card{border:1px dashed rgba(255,255,255,.22);border-radius:12px;padding:16px;text-align:center;font:13px system-ui;color:#c9d1dc}
.pv-card p{margin:0 0 10px;opacity:.8}
.pv-card button{font:600 14px system-ui;color:#fff;background:#3b82f6;border:0;border-radius:999px;padding:10px 20px}
.pv-card button:disabled{background:#2a3140;color:#9aa3b6}
.pv-vert{width:180px;height:300px;margin:18px auto;border-radius:14px;background:linear-gradient(160deg,#ff6f91,#845ec2);display:flex;align-items:center;justify-content:center;font-size:44px;color:#fff}
.pv-sf{padding:40px 26px;text-align:center;font:14px/1.5 system-ui;color:#c9d1dc;display:none}
.pv-sf b{display:block;font-size:30px;margin-bottom:8px}
`;

function ensureCss() {
  if (document.getElementById("pv-css")) return;
  const st = document.createElement("style"); st.id = "pv-css"; st.textContent = css;
  document.head.appendChild(st);
}

// Run one preview: build the stage, play the script, end after SECONDS.
function run(lang, build) {
  stop();
  const tr = (k, v) => t(lang, k, v);
  const back = document.createElement("div"); back.className = "pv-back";
  const bar = document.createElement("div"); bar.className = "pv-bar";
  setHTML(bar, `<span></span><i></i>`);
  const label = bar.querySelector("span");
  const endAt = Date.now() + SECONDS * 1000;
  const tick = () => { label.textContent = tr("o_pv_bar", { s: Math.max(0, Math.ceil((endAt - Date.now()) / 1000)) }); };
  tick();
  const timers = [setInterval(tick, 250)];
  const later = (ms, fn) => timers.push(setTimeout(fn, ms));
  const end = () => {
    timers.forEach(clearTimeout); timers.forEach(clearInterval);
    removeIntervention(); back.remove(); bar.remove();
    document.removeEventListener("keydown", onKey, true);
    active = null;
  };
  const onKey = (e) => { if (e.key === "Escape") { e.preventDefault(); end(); } };
  back.addEventListener("click", (e) => { if (e.target === back) end(); });
  bar.addEventListener("click", end);
  document.addEventListener("keydown", onKey, true);
  document.body.append(back, bar);
  build({ back, tr, later, end, lang });
  later(SECONDS * 1000, end);
  active = { end };
}
function stop() { if (active) active.end(); }

const val = (id, d) => { const el = document.getElementById(id); const n = el ? Number(el.value) : NaN; return Number.isFinite(n) && n > 0 ? n : d; };

// A small "watched page": headline, a big image, three thumbnails, a line of text.
function samplePage(tr) {
  const st = document.createElement("div"); st.className = "pv-stage";
  setHTML(st, `<div class="pv-pg"><h4>${tr("o_pv_sample")}</h4>
    <div class="pv-img pv-m"></div>
    <div class="pv-row"><div class="pv-m" style="background:linear-gradient(135deg,#4facfe,#00f2fe)"></div>
    <div class="pv-m" style="background:linear-gradient(135deg,#f093fb,#f5576c)"></div>
    <div class="pv-m" style="background:linear-gradient(135deg,#43e97b,#38f9d7)"></div></div>
    <p class="pv-txt">Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor.</p></div>
    <span class="pv-tag"></span><div class="pv-block"><div style="font-size:30px">🛑</div><div class="pv-bt"></div></div>`);
  return st;
}

const PREVIEWS = {
  // grey → blur → block, the way pressure climbs on a watched page
  s_o_h_escalation({ back, tr, later }) {
    const st = samplePage(tr); back.appendChild(st);
    const media = st.querySelectorAll(".pv-m"), tag = st.querySelector(".pv-tag"), blk = st.querySelector(".pv-block");
    st.querySelector(".pv-bt").textContent = tr("ov_blockTitle");
    const blur = val("maxBlur", 10);
    const set = (f, key) => { media.forEach(m => m.style.filter = f); tag.textContent = tr(key); };
    set("none", "st_none");
    later(1100, () => set("grayscale(1) contrast(.92)", "st_grey"));
    later(2300, () => set(`grayscale(1) blur(${blur}px)`, "st_blur"));
    later(3500, () => { tag.textContent = tr("st_block"); blk.style.display = "flex"; });
  },
  // the whole page, text included, goes grey and then blurry
  s_o_h_fullblur({ back, tr, later }) {
    const st = samplePage(tr); back.appendChild(st);
    const pg = st.querySelector(".pv-pg"), tag = st.querySelector(".pv-tag");
    tag.textContent = tr("st_none");
    later(1200, () => { pg.style.filter = "grayscale(1) contrast(.92)"; tag.textContent = tr("st_grey"); });
    later(2600, () => { pg.style.filter = "grayscale(1) blur(4px)"; tag.textContent = tr("st_blur"); pg.style.userSelect = "none"; });
  },
  // the real breathing pause with the intention question
  s_o_h_intention({ lang, end }) {
    const q = document.getElementById("intentQ");
    showIntervention({ mode: "intention", lang, breathSeconds: 3, disableFrictionSeconds: 0,
      host: "example.com", reason: t(lang, "rs_scroll", { host: "example.com" }),
      question: q && q.value.trim() ? q.value.trim() : undefined, betterSources: [] }, () => end());
    lowerOverlay();
  },
  // the real tab-burst pause
  s_o_h_breaker({ lang, end }) {
    const n = val("w1c", 4), s = val("w1s", 90);
    showIntervention({ mode: "pause", lang, breathSeconds: 3, disableFrictionSeconds: 0,
      host: "example.com", reason: t(lang, "rs_tabs", { n, host: "example.com", s }), betterSources: [] }, () => end());
    lowerOverlay();
  },
  // a feed that stops at a button; the button counts down and lets two more in
  s_o_h_pagination({ back, tr, later }) {
    const st = document.createElement("div"); st.className = "pv-stage dark";
    const n = val("pgSize", 10), wait = Math.min(3, Math.max(0, Number((document.getElementById("pgDelay") || {}).value) || 0));
    const post = (i) => `<div class="pv-post"><b>#${i}</b><span></span></div>`;
    setHTML(st, `<div class="pv-feed">${post(1)}${post(2)}${post(3)}
      <div class="pv-card"><p>${tr("pg_end")}</p><button type="button">${tr("pg_load", { n })}</button></div></div>`);
    back.appendChild(st);
    const feed = st.querySelector(".pv-feed"), card = st.querySelector(".pv-card"), btn = card.querySelector("button");
    // the "click" lands at 0.8 s, then the configured countdown (capped at 3 s here)
    for (let k = wait; k >= 0; k--) later(800 + (wait - k) * 1000, () => { btn.disabled = true; btn.textContent = tr("pg_wait", { s: k }); });
    later(800 + wait * 1000 + 150, () => {
      card.remove();
      const more = document.createElement("div"); setHTML(more, post(4) + post(5)); feed.append(...more.childNodes);
      feed.querySelectorAll(".pv-post").forEach((p, i) => { if (i < 2) p.style.display = "none"; });
    });
  },
  // a vertical short video, replaced by the short-form notice
  s_o_h_shortform({ back, tr, later }) {
    const st = document.createElement("div"); st.className = "pv-stage dark";
    setHTML(st, `<div class="pv-vert">▶</div><div class="pv-sf"><b>⛔</b>${tr("sf_blockedText")}</div>`);
    back.appendChild(st);
    later(1400, () => { st.querySelector(".pv-vert").style.display = "none"; st.querySelector(".pv-sf").style.display = "block"; });
  },
};

// The real overlay claims the top layer; drop it one step so the preview bar
// (and its "closes in…" countdown) stays visible and clickable above it.
function lowerOverlay() {
  const h = document.getElementById("tabguard-overlay-host");
  if (h) h.style.zIndex = "2147483500";
}

export function initPreviews(getLang) {
  ensureCss();
  for (const id of Object.keys(PREVIEWS)) {
    const sec = document.getElementById(id);
    const h2 = sec && sec.querySelector("h2");
    if (!h2 || h2.querySelector(".pv-btn")) continue;
    h2.classList.add("pv-h");
    const b = document.createElement("button");
    b.type = "button"; b.className = "pv-btn";
    b.textContent = "▶ " + t(getLang(), "o_pv");
    b.addEventListener("click", () => run(getLang(), PREVIEWS[id]));
    h2.appendChild(b);
  }
}
// re-label after a language switch (apply() would drop the ▶)
export function relabelPreviews(lang) {
  document.querySelectorAll(".pv-btn").forEach(b => { b.textContent = "▶ " + t(lang, "o_pv"); });
}
