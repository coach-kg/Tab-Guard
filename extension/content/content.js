// content.js (v1.1) — signals + escalation rendering.
// Collects scroll/keys/selection, detects lingering on animated media, and
// renders the current escalation stage (grey -> blur -> block) across the
// whole page including images. All state decisions come from the background;
// this script only measures and paints.

// Builds DOM from the extension's own markup templates (no page content goes in
// unescaped). DOMParser never runs scripts; the nodes are moved into place.
function setHTML(el, html) {
  const doc = new DOMParser().parseFromString("<!doctype html><body>" + html, "text/html");
  el.replaceChildren(...doc.body.childNodes);
}

// ---- tamper guard -------------------------------------------------------------
// Covers and filters that Tab Guard puts up on purpose come back when someone
// deletes or hides them in the inspector. Only what is meant to be there is
// restored: a cover lifted on purpose (emergency access, a reveal, the end of a
// lock) is gone from the state first, so it stays gone.
const tgGuards = [];
function tgGuard(g) { tgGuards.push(g); }
function tgCoverStyle(el, z) {
  el.setAttribute("style", `all:initial!important;position:fixed!important;inset:0!important;z-index:${z}!important;display:block!important;visibility:visible!important;opacity:1!important;pointer-events:auto!important;transform:none!important;filter:none!important;clip-path:none!important`);
}
function tgHidden(el) {
  if (!el || !el.isConnected) return true;
  try {
    const cs = getComputedStyle(el), r = el.getBoundingClientRect();
    if (cs.display === "none" || cs.visibility !== "visible" || parseFloat(cs.opacity) < 0.95 || cs.position !== "fixed") return true;
    if (r.width < innerWidth * 0.9 || r.height < innerHeight * 0.9 || +cs.zIndex < 2147483000) return true;
    if ((cs.transform && cs.transform !== "none") || (cs.clipPath && cs.clipPath !== "none") || (cs.filter && cs.filter !== "none")) return true;
    const sr = el.shadowRoot;
    if (sr) {
      const w = sr.querySelector(".w");
      if (!w) return true;
      const ws = getComputedStyle(w);
      if (ws.display === "none" || ws.visibility !== "visible" || parseFloat(ws.opacity) < 0.95) return true;
    }
  } catch (_) {}
  return false;
}
// style elements that keep things hidden underneath a cover, by name
const tgUnder = {};
function tgUnderStyle(name, css) {
  tgUnder[name] = css;
  let el = document.getElementById("__tabguard_under_" + name);
  if (!css) { if (el) el.remove(); return; }
  if (!el) { el = document.createElement("style"); el.id = "__tabguard_under_" + name; }
  if (el.textContent !== css) el.textContent = css;
  const parent = document.head || document.documentElement;
  if (!el.isConnected) parent.appendChild(el);
}
function tgCheckGuards() {
  for (const [name, css] of Object.entries(tgUnder)) {
    if (!css) continue;
    const el = document.getElementById("__tabguard_under_" + name);
    if (!el || el.textContent !== css || el.disabled || (el.media && el.media !== "all")) { if (el) el.remove(); tgUnderStyle(name, css); }
  }
  for (const g of tgGuards) { try { if (g.want() && (g.broken ? g.broken() : tgHidden(g.el()))) g.fix(); } catch (_) {} }
}
try {
  new MutationObserver(() => tgCheckGuards()).observe(document.documentElement, { childList: true, attributes: true, attributeFilter: ["style", "class", "hidden"] });
  if (document.head) new MutationObserver(() => tgCheckGuards()).observe(document.head, { childList: true, subtree: true, characterData: true });
} catch (_) {}
setInterval(tgCheckGuards, 800);

(() => {
  const SAMPLE_MS = 500;

  // ---- scroll sampling ------------------------------------------------------
  let lastY = window.scrollY || 0, pendingPixels = 0, sampleStart = 0, flushTimer = null;
  let lastScrollAt = 0, lastKeyAt = 0;

  function onScroll() {
    const y = window.scrollY || 0;
    pendingPixels += Math.abs(y - lastY); lastY = y; lastScrollAt = Date.now();
    if (!sampleStart) sampleStart = performance.now();
    if (!flushTimer) flushTimer = setTimeout(flush, SAMPLE_MS);
  }
  function flush() {
    flushTimer = null;
    const durationMs = sampleStart ? performance.now() - sampleStart : SAMPLE_MS;
    const pixels = pendingPixels; pendingPixels = 0; sampleStart = 0;
    if (pixels <= 0) return;
    safeSend({ type: "SCROLL_SAMPLE", sample: { pixels, durationMs, timestamp: Date.now() } }, (resp) => {});
  }
  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("keydown", () => { lastKeyAt = Date.now(); }, { passive: true });

  document.addEventListener("selectionchange", () => {
    if (String(document.getSelection() || "").length > 8) lastKeyAt = Date.now();
  });

  // ---- focus / visibility ---------------------------------------------------
  function reportFocus() { safeSend({ type: "FOCUS", focused: document.visibilityState === "visible" && document.hasFocus() }); }
  document.addEventListener("visibilitychange", reportFocus);
  window.addEventListener("focus", reportFocus);
  window.addEventListener("blur", reportFocus);
  reportFocus();
  safeSend({ type: "REVISIT" });

  function safeSend(msg, cb) { try { chrome.runtime.sendMessage(msg, (r) => { void chrome.runtime.lastError; cb && cb(r); }); } catch (_) {} }
  // True only while this content script's extension context is still alive.
  function extAlive() { try { return !!(chrome.runtime && chrome.runtime.id); } catch (_) { return false; } }
  // An orphaned content script (left behind by an extension reload) still has a
  // truthy chrome.runtime.id, but getURL() quietly hands back
  // "chrome-extension://invalid/…" instead of throwing. Loading that fails with
  // ERR_FAILED and takes any feature depending on it down in silence, so treat
  // an invalid URL as "no URL".
  // The one place that loads the extension's own modules (i18n, overlay):
  // always a chrome.runtime.getURL() address from tgURL(), never page input.
  function tgImport(u) { return import(u); }
  function tgURL(p) {
    if (!extAlive()) return null;
    try {
      const u = chrome.runtime.getURL(p);
      return (u && u.indexOf("://invalid/") === -1) ? u : null;
    } catch (_) { return null; }
  }

  // ---- media-dwell detection ------------------------------------------------
  // "Animated media present and visible" + you're not scrolling or typing.
  // How many moving things are on screen: playing videos and GIF/WebP images.
  function animatedMediaCount(max = 6) {
    let n = 0;
    for (const v of document.querySelectorAll("video")) {
      if (!v.paused && !v.ended && v.readyState > 2 && inViewport(v) && ++n >= max) return n;
    }
    for (const img of document.images) {
      if (/\.(gif|webp)(\?|$)/i.test(img.currentSrc || img.src || "") && inViewport(img) && ++n >= max) return n;
    }
    return n;
  }
  function animatedMediaVisible() { return animatedMediaCount(1) > 0; }
  function inViewport(el) {
    const r = el.getBoundingClientRect();
    return r.width > 60 && r.height > 60 && r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth;
  }

  let dwellMs = 0;
  setInterval(() => {
    if (document.visibilityState !== "visible" || !document.hasFocus()) { dwellMs = 0; return; }
    const idleMs = Date.now() - Math.max(lastScrollAt, lastKeyAt);
    const idleGate = 2500;
    if (animatedMediaVisible() && idleMs >= idleGate) {
      dwellMs += 1000;
      if (dwellMs >= 3000) { dwellMs = 0; safeSend({ type: "MEDIA_DWELL", n: animatedMediaCount() }); }
    } else if (idleMs < idleGate) {
      dwellMs = 0;
    }
  }, 1000);

  // ---- escalation rendering (grey / blur / block) ---------------------------
  const STYLE_ID = "tabguard-stage-style";
  let revealUntil = 0, revealTimer = null, currentStage = "none";

  function styleEl() {
    let el = document.getElementById(STYLE_ID);
    if (!el) { el = document.createElement("style"); el.id = STYLE_ID; (document.head || document.documentElement).appendChild(el); }
    return el;
  }

  let stageLang = null;
  let lastStageMsg = null;
  function applyStage(msg) { lastStageMsg = msg || {}; applyLadder(lastStageMsg); calmRender(); }

  // ---- calm view (popup: Normal · Grey · Blurred) -----------------------------
  // Your own way of looking at pages, separate from the escalation ladder.
  // Kept in its own style element after the ladder's: while the ladder is
  // active it wins (it is at least as strong), except that a blurred calm view
  // keeps the blur on top of the ladder's grey. Hovering a picture for a moment
  // shows it — only in the calm view, never while the ladder is greying.
  const CALM_ID = "__tabguard_calm__";
  const CALM_SEL = 'img,video,picture,[style*="background-image"]';
  let CALM = { mode: "normal", except: [] }, calmLastCss = "";
  tgGuard({ want: () => !!calmLastCss,
    broken: () => { const el = document.getElementById(CALM_ID); return !el || !el.isConnected || el.disabled || el.textContent !== calmLastCss; },
    fix: () => { const el = document.getElementById(CALM_ID); if (el) el.remove(); calmRender(); } });
  function calmMode() {
    if (!CALM || !CALM.mode || CALM.mode === "normal") return "normal";
    const h = location.hostname.replace(/^www\./, "");
    if ((CALM.except || []).some(d => h === d || h.endsWith("." + d))) return "normal";
    return CALM.mode;
  }
  function calmRender() {
    const mode = calmMode();
    let el = document.getElementById(CALM_ID);
    const ladderOn = currentStage !== "none" && !(Date.now() < revealUntil && currentStage !== "block");
    let css = "";
    if (mode !== "normal") {
      if (ladderOn) {
        if (mode === "blur" && currentStage === "grey") css = `${CALM_SEL}{filter:grayscale(1) blur(12px)!important}`;
      } else if (mode === "grey") {
        css = `${CALM_SEL}{filter:grayscale(1)!important;transition:filter .3s}`;
      } else {
        css = `${CALM_SEL}{filter:blur(12px) grayscale(.35)!important;transition:filter .15s}`
          + `img:hover,video:hover,picture:hover img,a:hover img,a:hover video,:is(div,span,figure,button):hover>:is(img,video,picture)`
          + `{filter:none!important;transition:filter .25s .6s!important}`;
      }
    }
    calmLastCss = css;
    if (!css) { if (el) el.remove(); return; }
    if (!el) { el = document.createElement("style"); el.id = CALM_ID; }
    el.textContent = css;
    const parent = document.head || document.documentElement;
    if (el.parentNode !== parent || el.nextElementSibling) parent.appendChild(el);   // stay after the ladder's style
  }
  function loadCalm() {
    try { chrome.storage.local.get("tabguardView", g => { CALM = (g && g.tabguardView) || { mode: "normal", except: [] }; calmRender(); }); } catch (_) {}
  }
  try { chrome.storage.onChanged.addListener((c, a) => { if (a === "local" && c.tabguardView) { CALM = c.tabguardView.newValue || { mode: "normal" }; calmRender(); } }); } catch (_) {}
  loadCalm();

  function applyLadder({ stage = "none", blurPx = 0, revealMs = 2000, value = 0, lang, fullBlur = false, disableLinks = false, allowReveal = true }) {
    currentStage = stage;
    if (lang !== undefined) stageLang = lang;
    const rMs = allowReveal ? revealMs : false; // false → no reveal button
    const el = styleEl();
    // "none" lifts everything, the block screen included (e.g. right after
    // emergency access starts). A running reveal only lifts grey/blur.
    if (stage === "none") { el.textContent = ""; removeReveal(); setNoCopy(false); ensureBlock(false); return; }
    if (Date.now() < revealUntil && stage !== "block") { el.textContent = ""; removeReveal(); setNoCopy(false); return; }

    // Whole-page mode: blur the entire site including text, and make it
    // unselectable / uncopyable. Otherwise only media is affected.
    if (fullBlur) {
      const locked = stage !== "grey"; // grey still readable; blur/block lock text
      setNoCopy(locked);
      const amount = stage === "grey" ? "grayscale(1) contrast(.92)" : `grayscale(1) blur(${Math.max(blurPx, stage === "block" ? 8 : 3)}px)`;
      el.textContent = `html{filter:${amount}!important;transition:filter .4s}`
        + (locked ? `*{user-select:none!important;-webkit-user-select:none!important;}` : "")
        + (locked && disableLinks ? `a,button{pointer-events:none!important;}` : "");
      if (stage === "block") { ensureBlock(true, value); ensureReveal(false); }
      else { ensureBlock(false); ensureReveal(rMs, value); }
      return;
    }

    setNoCopy(false);
    // inline backgrounds count too, including the `background:url(…)` shorthand
    const sel = 'img,video,canvas,picture,svg,[style*="background-image"],[style*="url("]';
    if (stage === "grey") {
      el.textContent = `${sel}{filter:grayscale(1) contrast(.92)!important;transition:filter .4s}`;
      ensureBlock(false); ensureReveal(rMs, value);
    } else if (stage === "blur") {
      el.textContent = `${sel}{filter:grayscale(1) blur(${blurPx}px)!important;transition:filter .4s}`;
      ensureBlock(false); ensureReveal(rMs, value);
    } else if (stage === "block") {
      el.textContent = `${sel}{filter:grayscale(1) blur(${Math.max(blurPx, 8)}px)!important}`;
      // The reveal button from the blur stage must go: left in place it sat
      // under the block screen, and a click would have lifted the block.
      ensureBlock(true, value); ensureReveal(false);
    }
  }

  // Block copy / selection when whole-page mode locks text.
  let noCopyOn = false;
  const blockCopy = (e) => { e.preventDefault(); e.stopPropagation(); };
  function setNoCopy(on) {
    if (on === noCopyOn) return;
    noCopyOn = on;
    if (on) {
      document.addEventListener("copy", blockCopy, true);
      document.addEventListener("cut", blockCopy, true);
      document.addEventListener("selectstart", blockCopy, true);
      document.addEventListener("contextmenu", blockCopy, true);
    } else {
      document.removeEventListener("copy", blockCopy, true);
      document.removeEventListener("cut", blockCopy, true);
      document.removeEventListener("selectstart", blockCopy, true);
      document.removeEventListener("contextmenu", blockCopy, true);
    }
  }

  // Floating "reveal" control: one click, a visible countdown (the escalating
  // delay is the friction), then media is cleared for 20s.
  let revealHost = null;
  function ensureReveal(revealMs, value) {
    if (!revealMs) { removeReveal(); return; }
    if (revealHost) { updateReveal(revealMs); return; }
    revealHost = document.createElement("div");
    revealHost.setAttribute("data-tabguard", "reveal");
    revealHost.style.cssText = "all:initial;position:fixed;right:14px;bottom:14px;z-index:2147483646;";
    document.documentElement.appendChild(revealHost);
    const root = revealHost.attachShadow({ mode: "open" });
    setHTML(root, `
      <style>
        .b{position:relative;overflow:hidden;font:600 12.5px/1.2 ui-monospace,SFMono-Regular,Menlo,monospace;
          color:#cdd4e4;background:#12151f;border:1px solid #2a3042;border-radius:10px;padding:9px 13px;
          cursor:pointer;box-shadow:0 6px 20px rgba(0,0,0,.35);user-select:none;}
        .b:hover{border-color:#3b82f6;}
        .fill{position:absolute;inset:0;background:#3b82f640;width:0%;transition:width .1s linear;}
        .lbl{position:relative;}
        .row{display:flex;align-items:center;gap:6px;}
        .cog{opacity:0;transition:opacity .15s;font:13px/1 system-ui;color:#6a7284;background:#12151f;
          border:1px solid #2a3042;border-radius:8px;padding:8px 9px;cursor:pointer;box-shadow:0 6px 20px rgba(0,0,0,.35);}
        .row:hover .cog{opacity:1;}
        .cog:hover{color:#6f9dff;border-color:#3b82f6;}
      </style>
      <div class="row">
        <div class="cog" id="cog" title="">⚙</div>
        <div class="b" id="r"><div class="fill" id="f"></div><span class="lbl" id="s"></span></div>
      </div>`);
    const btn = root.getElementById("r");
    revealHost._label = root.getElementById("s");
    revealHost._fill = root.getElementById("f");
    revealHost._ms = revealMs;
    revealHost._counting = false;
    setRevealLabel();
    btn.addEventListener("click", () => startReveal());
    const cog = root.getElementById("cog");
    const _u2 = tgURL("assets/i18n.js");
    if (_u2) tgImport(_u2).then(m => { cog.title = m.t(stageLang, "rv_settings"); }).catch(() => {});
    cog.addEventListener("click", () => safeSend({ type: "OPEN_OPTIONS", hash: "#s_o_h_escalation" }));
  }
  function setRevealLabel() {
    if (!revealHost) return;
    const _u=tgURL("assets/i18n.js"); if(!_u){removeReveal&&removeReveal();return;} tgImport(_u).then(m => {
      if (revealHost && !revealHost._counting) revealHost._label.textContent = m.t(stageLang, "reveal");
    }).catch(() => { if (revealHost) revealHost._label.textContent = "◐ reveal"; });
  }
  function startReveal() {
    if (!revealHost || revealHost._counting) return;
    revealHost._counting = true;
    const total = revealHost._ms;
    const start = Date.now();
    const _u=tgURL("assets/i18n.js"); if(!_u){removeReveal&&removeReveal();return;} tgImport(_u).then(m => {
      const tick = () => {
        if (!revealHost) return;
        const left = Math.max(0, total - (Date.now() - start));
        revealHost._fill.style.width = `${100 * (1 - left / total)}%`;
        revealHost._label.textContent = m.t(stageLang, "reveal_in", { s: Math.ceil(left / 1000) });
        if (left <= 0) { doReveal(); return; }
        requestAnimationFrame(tick);
      };
      tick();
    }).catch(() => doReveal());
  }
  function updateReveal(revealMs) { if (revealHost && !revealHost._counting) { revealHost._ms = revealMs; } }
  function removeReveal() { if (revealHost) { revealHost.remove(); revealHost = null; } }
  function doReveal() {
    revealUntil = Date.now() + 20000; // clear friction for 20s
    styleEl().textContent = "";
    removeReveal(); calmRender();
    if (revealTimer) clearTimeout(revealTimer);
    revealTimer = setTimeout(() => { safeSend({ type: "GET_STATUS" }, (s) => s && applyStage({ stage: s.stage })); }, 20000);
  }

  // Full "blocked" cover for the top stage.
  let blockHost = null;
  let lastBlockValue = 0;
  function ensureBlock(on, value) {
    if (on) lastBlockValue = value;
    if (!on) { if (blockHost) { blockHost.remove(); blockHost = null; } return; }
    if (blockHost) return;
    blockHost = document.createElement("div");
    tgCoverStyle(blockHost, 2147483646);
    document.documentElement.appendChild(blockHost);
    const root = blockHost.attachShadow({ mode: "open" });
    setHTML(root, `
      <style>
        .w{position:fixed;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(10,12,18,.9);backdrop-filter:blur(6px);}
        .c{text-align:center;color:#e8ebf2;font:16px/1.6 system-ui,sans-serif;max-width:400px;padding:32px;}
        h1{font-size:22px;margin:0 0 8px;} p{color:#9aa3b6;margin:0 0 18px;}
        button{font:inherit;font-weight:650;padding:11px 18px;border:0;border-radius:11px;cursor:pointer;background:#3b82f6;color:#fff;margin:5px;}
        .g{background:#1b2130;color:#cdd4e4;}
      </style>
      <div class="w"><div class="c">
        <div style="font-size:38px">🛑</div>
        <h1 data-t="ov_blockTitle">Blocked for now</h1>
        <p data-t="ov_blockText">You've hit the top of the ladder here. This is the pattern you asked me to stop. Step away — pressure eases off on its own.</p>
        <button class="g" id="close" data-t="ov_close">Close tab</button>
        <div id="em"></div>
      </div></div>`);
    root.getElementById("close").addEventListener("click", () => safeSend({ type: "INTERVENTION_RESULT", action: "closed" }));
    emergencyOffer(root.getElementById("em"), "stage", location.href);
    // localize
    const _u=tgURL("assets/i18n.js"); if(!_u){removeReveal&&removeReveal();return;} tgImport(_u).then(m => {
      root.querySelectorAll("[data-t]").forEach(el => { el.textContent = m.t(stageLang, el.getAttribute("data-t")); });
    }).catch(() => {});
  }

  tgGuard({ want: () => blockHost !== null, el: () => blockHost,
    fix: () => { try { blockHost.remove(); } catch (_) {} blockHost = null; ensureBlock(true, lastBlockValue); } });
  tgGuard({ want: () => !!(lastStageMsg && lastStageMsg.stage && lastStageMsg.stage !== "none" && !(Date.now() < revealUntil && lastStageMsg.stage !== "block")),
    broken: () => { const el = document.getElementById(STYLE_ID); return !el || !el.isConnected || !el.textContent || el.disabled; },
    fix: () => { const el = document.getElementById(STYLE_ID); if (el) el.remove(); applyLadder(lastStageMsg); calmRender(); } });

  // ---- emergency access -------------------------------------------------------
  // Once a day a blocked page can be opened for 20 minutes. A quiet link, a
  // short explanation, and a button you hold for 5 seconds (against misclicks;
  // an emergency shouldn't make you wait). During the access a thin strip at
  // the top says until when it lasts, with a way to end it early.
  function emergencyOffer(box, reason, url) {
    if (!box) return;
    safeSend({ type: "EMERGENCY_STATUS" }, (r) => {
      if (!r || !r.available) return;
      const u = tgURL("assets/i18n.js"); if (!u) return;
      tgImport(u).then(m => {
        const tr = (k, v) => m.t(stageLang || tgLang, k, v);
        setHTML(box, `<style>.eml{display:inline-block;margin-top:22px;font-size:12.5px;color:#6a7284;text-decoration:underline;cursor:pointer;background:none;border:0;padding:0}
          .emp{margin-top:18px;padding:16px;border:1px solid #2a3042;border-radius:12px;text-align:left;font-size:14px;color:#cdd4e4}
          .emp p{margin:0 0 12px;color:#9aa3b6;font-size:13.5px}.emh{position:relative;overflow:hidden;width:100%;margin:0}
          .emh i{position:absolute;left:0;top:0;bottom:0;width:0;background:rgba(255,255,255,.18)}.emh span{position:relative}</style>
          <button class="eml" id="emLink"></button>`);
        const link = box.querySelector("#emLink");
        link.textContent = tr("em_link");
        link.addEventListener("click", () => {
          const st = box.querySelector("style");
          setHTML(box, `<div class="emp"><b></b><p></p>
            <button class="emh" id="emHold"><i></i><span></span></button><button class="g" id="emCancel" style="width:100%;margin:6px 0 0"></button></div>`);
          box.prepend(st);
          box.querySelector("b").textContent = tr("em_title");
          box.querySelector("p").textContent = tr("em_text");
          box.querySelector("#emHold span").textContent = tr("em_hold");
          box.querySelector("#emCancel").textContent = tr("em_cancel");
          box.querySelector("#emCancel").addEventListener("click", () => emergencyOffer(box, reason, url));
          const hold = box.querySelector("#emHold"), bar = hold.querySelector("i");
          let t0 = 0, raf = 0;
          const stop = () => { cancelAnimationFrame(raf); t0 = 0; bar.style.width = "0"; };
          const step = () => {
            const p = Math.min(1, (Date.now() - t0) / 5000);
            bar.style.width = (p * 100) + "%";
            if (p < 1) { raf = requestAnimationFrame(step); return; }
            hold.disabled = true;
            safeSend({ type: "EMERGENCY_START", host: location.hostname, reason, url }, (res) => {
              if (res && res.ok) { if (reason !== "stage" && url) location.href = url; }
              else stop();
            });
          };
          hold.addEventListener("pointerdown", (e) => { e.preventDefault(); t0 = Date.now(); raf = requestAnimationFrame(step); });
          ["pointerup", "pointerleave", "pointercancel"].forEach(ev => hold.addEventListener(ev, () => { if (!hold.disabled) stop(); }));
        });
      }).catch(() => {});
    });
  }
  let tgLang = "auto";
  try { chrome.storage.local.get("tabguardConfig", g => { tgLang = ((g && g.tabguardConfig) || {}).language || "auto"; }); } catch (_) {}
  let emStrip = null;
  function emergencyStrip() {
    safeSend({ type: "EMERGENCY_STATUS" }, (r) => {
      if (!r || !r.active) { if (emStrip) { emStrip.remove(); emStrip = null; } return; }
      if (emStrip) return;
      const u = tgURL("assets/i18n.js"); if (!u) return;
      tgImport(u).then(m => {
        const tr = (k, v) => m.t(stageLang || tgLang, k, v);
        emStrip = document.createElement("div");
        emStrip.setAttribute("data-tabguard", "emergency");
        emStrip.style.cssText = "all:initial;position:fixed;left:0;right:0;top:0;z-index:2147483645;";
        const root = emStrip.attachShadow({ mode: "open" });
        const t = new Date(r.until).toLocaleTimeString(m.resolve(stageLang || tgLang), { hour: "2-digit", minute: "2-digit" });
        setHTML(root, `<style>.s{display:flex;justify-content:center;gap:12px;align-items:center;padding:4px 12px;
          background:rgba(17,21,31,.92);color:#cdd4e4;font:12px/1.4 system-ui,sans-serif;border-bottom:1px solid #2a3042}
          button{font:inherit;background:none;border:0;color:#7fa4ff;text-decoration:underline;cursor:pointer;padding:0}</style>
          <div class="s"><span></span><button></button></div>`);
        root.querySelector("span").textContent = tr("em_bar", { t });
        root.querySelector("button").textContent = tr("em_end");
        root.querySelector("button").addEventListener("click", () => safeSend({ type: "EMERGENCY_END" }));
        document.documentElement.appendChild(emStrip);
      }).catch(() => {});
    });
  }
  emergencyStrip();
  setInterval(emergencyStrip, 30000);

  // ---- intervention overlay (pause / intention) -----------------------------
  // Full-screen "on a break" cover with a countdown — a real pause, not a pass.
  let breakHost = null, breakTimer = null;
  function showBreak(seconds, lang) {
    if (breakHost) breakHost.remove();
    breakHost = document.createElement("div");
    breakHost.style.cssText = "all:initial;position:fixed;inset:0;z-index:2147483647;";
    document.documentElement.appendChild(breakHost);
    const root = breakHost.attachShadow({ mode: "open" });
    setHTML(root, `<style>.w{position:fixed;inset:0;display:flex;align-items:center;justify-content:center;
      background:rgba(10,12,18,.96);backdrop-filter:blur(14px);font:16px/1.6 system-ui,sans-serif;color:#e8ebf2}
      .c{text-align:center;max-width:380px;padding:32px}.t{font-size:52px;font-weight:700;font-variant-numeric:tabular-nums;margin:6px 0}
      h1{font-size:22px;margin:0 0 6px}p{color:#9aa3b6;margin:0}</style>
      <div class="w"><div class="c"><div style="font-size:40px">🌿</div>
      <h1 id="bt">On a break</h1><div class="t" id="tm">5:00</div><p id="bs"></p></div></div>`);
    const end = Date.now() + seconds * 1000;
    const fmt = (ms) => { const s = Math.max(0, Math.ceil(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };
    const u = tgURL("assets/i18n.js");
    const paint = (m) => {
      if (m) { root.getElementById("bt").textContent = m.t(lang, "br_title"); }
      const tick = () => {
        if (!breakHost) return;
        const left = end - Date.now();
        root.getElementById("tm").textContent = fmt(left);
        if (m) root.getElementById("bs").textContent = left > 0 ? m.t(lang, "br_sub", { t: fmt(left) }) : m.t(lang, "br_end");
        if (left <= 0) { clearInterval(breakTimer); setTimeout(() => { if (breakHost) { breakHost.remove(); breakHost = null; } }, 1200); return; }
      };
      tick(); breakTimer = setInterval(tick, 500);
    };
    if (u) tgImport(u).then(paint).catch(() => paint(null)); else paint(null);
  }

  chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
    if (msg.type === "PG_STATUS") {
      let code = pgCode;
      if (!PG || !PG.enabled) code = "off";
      else if (!pgReady) code = "settling";
      else if (!pgActive()) code = "trusted";
      try { reply({ code, held: pgHeldNow, credit: pgCredit }); } catch (_) {}
      return;                                // answered synchronously
    }
    if (msg.type === "PG_HIGHLIGHT") { pgHighlight(!!msg.on); return; }
    if (msg.type === "APPLY_STAGE") { applyStage(msg); return; }
    if (msg.type === "SHOW_BREAK") { showBreak(msg.seconds || 300, msg.lang); return; }
    if (msg.type === "SHOW_INTERVENTION") {
      const u = tgURL("content/overlay.js");
      if (u) tgImport(u).then((mod) => mod.showIntervention(msg, (action) => safeSend({ type: "INTERVENTION_RESULT", action }))).catch(() => {});
    }
  });

  // ask for the current stage on load
  safeSend({ type: "GET_STATUS" }, (s) => { if (s && s.watched) applyStage({ stage: s.stage, fullBlur: s.fullBlur, disableLinks: s.disableLinks, allowReveal: s.allowReveal }); });

  // ---- feed to friction -----------------------------------------------------
  // A button in the feed, nothing else.
  //
  // Whatever the feed shows once it has settled is page 1. Every post the site
  // adds after that is held: hidden via an attribute plus one stylesheet rule,
  // and a button card is placed in the feed exactly where the held posts begin.
  // Clicking (after the countdown) releases the next page.
  //
  // What earlier versions taught, the hard way:
  // - A curtain drawn over the document needs document coordinates, and with
  //   a scroll stop it deadlocked: you could never reach the site's own
  //   end-of-feed trigger, so nothing new ever loaded. No overlay now.
  // - Hidden posts take no space, so that trigger stays reachable.
  // - Empty slots are never hidden. LinkedIn's last child is an empty element
  //   its infinite scroll watches; hiding it (as v1.9 did) stops the feed dead.
  // - The site re-renders and resets inline styles (React writes
  //   style="display:contents" back onto its wrappers). The rule therefore
  //   lives in a stylesheet with !important and keys off our own attribute.
  // - We track each slot by identity, not by index: a virtualised feed
  //   unmounts and remounts content, but its wrappers stay put.
  let PG = null, pgLib = null, pgI18n = null, pgWatched = false, pgSettingsKey = "";
  let pgCont = null, pgBtnHost = null, pgBtn = null;
  let pgBusy = false, pgPend = false, pgReady = false;
  let pgState = new WeakMap();          // slot element -> "shown" | "held"
  let pgCredit = 0, pgBaselined = false, pgSettle = { n: -1, t: 0 };
  let pgReleasedTotal = 0, pgParked = false, pgHeldNow = 0;
  const pgTally = new Map();
  let pgLastScan = 0, pgFoundBy = null, pgLogged = false, pgWhy = null;
  let pgCode = "nofeed";                // machine-readable status for the popup
  const PG_MIN_PAGE = 5;                // fewer posts than this is not yet a page
  const PG_SETTLE_MS = 1200;            // page 1 = a count that held still this long
  const PG_ATTR = "data-tabguard-held";
  const PG_PARK = "data-tabguard-parked";

  function pgActive() {
    if (!PG || !PG.enabled || !pgLib || !pgReady) return false;
    return pgLib.isActiveHost(location.hostname, PG.hosts || [], pgWatched);
  }
  // A rect for an element, even when it generates no box of its own.
  //
  // LinkedIn (Oct 2026) wraps every single feed item in
  // <div data-lazy-mount-id=… style="display:contents">. Such a wrapper has an
  // empty getClientRects() and a 0x0 bounding rect, so the old "only count
  // children that render" filter threw away all 44 feed items and the feed
  // became invisible to us. Measure what the wrapper actually paints instead.
  function pgRect(el) {
    if (!el || typeof el.getBoundingClientRect !== "function") return null;
    let r = null;
    try { r = el.getBoundingClientRect(); } catch (_) { return null; }
    if (r && (r.width > 0 || r.height > 0)) return r;
    try {                                   // a Range spans the rendered contents
      const rg = document.createRange();
      rg.selectNodeContents(el);
      const cr = rg.getBoundingClientRect();
      if (cr && (cr.width > 0 || cr.height > 0)) return cr;
    } catch (_) {}
    let top = Infinity, bot = -Infinity, left = Infinity, right = -Infinity, any = false;
    for (const c of el.children || []) {    // recurses through nested box-less wrappers
      const cr = pgRect(c);
      if (!cr) continue;
      any = true;
      top = Math.min(top, cr.top); bot = Math.max(bot, cr.bottom);
      left = Math.min(left, cr.left); right = Math.max(right, cr.right);
    }
    return any ? { top, bottom: bot, left, right, width: right - left, height: bot - top } : null;
  }
  // Hovering "Feed" in the popup outlines the feed this page uses and its
  // posts: soft, dashed, no fill, drawn on a separate layer that ignores the
  // mouse. The popup keeps it alive with a ping; without one it fades after 3 s.
  let pgHlHost = null, pgHlRaf = 0, pgHlTimer = 0;
  function pgHighlight(on) {
    clearTimeout(pgHlTimer);
    if (!on || !pgCont || !pgCont.isConnected) {
      cancelAnimationFrame(pgHlRaf); pgHlRaf = 0;
      if (pgHlHost) { pgHlHost.remove(); pgHlHost = null; }
      return;
    }
    pgHlTimer = setTimeout(() => pgHighlight(false), 3000);
    if (pgHlHost) return;
    pgHlHost = document.createElement("div");
    pgHlHost.setAttribute("data-tabguard", "feed-highlight");
    pgHlHost.style.cssText = "all:initial;position:fixed;inset:0;z-index:2147483646;pointer-events:none;";
    const root = pgHlHost.attachShadow({ mode: "open" });
    const st = document.createElement("style");
    st.textContent = ".f{position:fixed;border:3px dashed rgba(111,157,255,.9);border-radius:12px;box-sizing:border-box;background:rgba(111,157,255,.05);box-shadow:0 0 0 4px rgba(111,157,255,.15)}" +
      ".p{position:fixed;border:2px solid rgba(111,157,255,.6);border-radius:8px;box-sizing:border-box}";
    root.appendChild(st);
    const layer = document.createElement("div"); root.appendChild(layer);
    document.documentElement.appendChild(pgHlHost);
    const box = (cls, r, pad) => { const d = document.createElement("div"); d.className = cls;
      d.style.cssText = `left:${r.left - pad}px;top:${r.top - pad}px;width:${r.width + 2 * pad}px;height:${r.height + 2 * pad}px`; return d; };
    const draw = () => {
      if (!pgHlHost) return;
      layer.replaceChildren();
      const fr = pgRect(pgCont);
      if (fr) layer.appendChild(box("f", fr, 6));
      for (const s of pgSlots()) {
        if (!pgHasContent(s) || s.hasAttribute("data-tabguard-held")) continue;
        const r = pgRect(s);
        if (!r || r.bottom < 0 || r.top > innerHeight) continue;          // only what is on screen
        layer.appendChild(box("p", r, 2));
      }
      pgHlRaf = requestAnimationFrame(draw);                               // follows scrolling
    };
    draw();
  }
  // The feed's slots: its element children, minus our own button card.
  function pgSlots() {
    if (!pgCont || !pgCont.isConnected) return [];
    return [...pgCont.children].filter(el => el.nodeType === 1 && el !== pgBtnHost && !el.__pgSkip);
  }
  // Does a slot carry a post? Empty ones are sentinels or placeholders.
  function pgHasContent(el) {
    try { return el.childElementCount > 0 || (el.textContent || "").trim().length > 0; } catch (_) { return false; }
  }
  // Measure an element the way a reader sees it: how many rendered children,
  // how tall they typically are, how wide the column is.
  function pgMeasure(el) {
    if (!el || !el.isConnected || el.__pgSkip) return null;
    const rects = [];
    try {
      for (const c of el.children) {
        if (c.nodeType !== 1 || c.__pgSkip) continue;
        const r = pgRect(c);
        if (r) rects.push(r);
      }
    } catch (_) { return null; }
    if (rects.length < 5) return null;
    const hs = rects.map(r => Math.round(r.height)).sort((a, b) => a - b);
    const own = pgRect(el);
    let inMedia = false, listish = false;
    try { inMedia = !!(el.closest && el.closest('video, audio, .video-js, [class*="vjs-"]')); } catch (_) {}
    try {
      listish = el.tagName === "UL" || el.tagName === "OL" ||
        (el.getAttribute && el.getAttribute("role") === "list");
    } catch (_) {}
    return {
      key: el,
      children: rects.length,
      medH: hs[Math.floor(hs.length / 2)] || 0,
      width: Math.round(own ? own.width : 0),
      added: pgTally.get(el) || 0,
      inMedia,
      listish,
    };
  }
  // Attribute hints, tried before the shape scan.
  //
  // Class names are a dead end — LinkedIn ships CSS modules, so the feed's
  // classes read `ckymvu ckya1x ckyio3` and change every build. But the
  // *structural* attributes are stable and, in the captured feed, unique:
  // role="list" appeared exactly once on the whole page, on the feed itself.
  // These are web standards and test hooks, not one site's styling, so they
  // generalise: role="feed" is the ARIA role for an infinite stream, and
  // data-testid is what sites hang their own tests off and therefore keep.
  const PG_HINTS = [
    '[role="feed"]',
    '[data-testid="mainFeed"]',
    '[data-testid*="feed" i][role="list"]',
    '[data-testid*="feed" i]',
    '[data-test-id*="feed" i]',
    '[data-component-type="LazyColumn"]',
    'main [role="list"]',
    '[role="list"]',
    'main [role="main"] > div',
  ];
  // A looser check for a hinted element: it was named by a real structural
  // attribute, so it does not have to win the shape contest too.
  function pgLooksListy(el) {
    if (!el || !el.isConnected || el.__pgSkip) return false;
    let inMedia = false;
    try { inMedia = !!(el.closest && el.closest('video, audio, .video-js, [class*="vjs-"]')); } catch (_) {}
    if (inMedia) return false;
    const own = pgRect(el);
    if (!own || own.width < 300) return false;
    let n = 0, tall = 0;
    for (const c of el.children || []) {
      if (c.nodeType !== 1 || c.__pgSkip) continue;
      const r = pgRect(c);
      if (!r) continue;
      n++;
      if (r.height >= 80) tall++;
    }
    return n >= 3 && tall >= 2;
  }
  function pgFromHints() {
    for (const sel of PG_HINTS) {
      let els = [];
      try { els = document.querySelectorAll(sel); } catch (_) { continue; }
      for (const el of els) {
        if (pgLooksListy(el)) return el;
      }
    }
    return null;
  }
  function pgScan() {
    const out = [];
    let nodes = [];
    try { nodes = document.querySelectorAll("ul,ol,main,section,div"); } catch (_) { return out; }
    let i = 0;
    for (const el of nodes) {
      if (++i > 6000) break;                 // keep the scan bounded on huge pages
      if (el.children.length < 5) continue;
      const m = pgMeasure(el);
      if (m) out.push(m);
    }
    return out;
  }

  // Feeds that place every post with position:absolute (X/Twitter-style
  // virtual lists) compute each post's offset themselves. Hiding a post there
  // leaves a hole instead of closing the gap, and our card would land at the
  // top. We leave those alone rather than break them.
  function pgAbsoluteList(cont) {
    let n = 0, abs = 0;
    for (const el of cont.children) {
      if (el.nodeType !== 1 || el === pgBtnHost || !pgHasContent(el)) continue;
      let box = el;
      try { if (getComputedStyle(el).display === "contents") box = el.firstElementChild || el; } catch (_) {}
      try { const pos = getComputedStyle(box).position; if (pos === "absolute" || pos === "fixed") abs++; } catch (_) {}
      if (++n >= 12) break;
    }
    return n >= 3 && abs / n >= 0.6;
  }

  // Forget everything about the current feed and show all its posts again.
  function pgReset(why) {
    try {
      document.querySelectorAll("[" + PG_ATTR + "]").forEach(el => el.removeAttribute(PG_ATTR));
      document.querySelectorAll("[" + PG_PARK + "]").forEach(el => el.removeAttribute(PG_PARK));
    } catch (_) {}
    if (pgBtnHost) { pgBtnHost.remove(); pgBtnHost = null; pgBtn = null; }
    pgCont = null; pgState = new WeakMap(); pgCredit = 0; pgBaselined = false;
    pgSettle = { n: -1, t: 0 }; pgReleasedTotal = 0; pgBusy = false; pgParked = false;
    if (why) pgWhy = why;
  }
  function pgFindCont() {
    // Keep the container while it is in the document. Not re-checking its
    // shape here on purpose: once we hold posts, it legitimately looks emptier.
    if (pgCont && pgCont.isConnected) return pgCont;
    if (pgCont) pgReset("feed replaced, rescanning");
    const now = Date.now();
    if (now - pgLastScan < 4000) { pgWhy = pgWhy || "waiting to rescan"; return null; }
    pgLastScan = now;
    pgFoundBy = null;
    const hinted = pgFromHints();               // structural attributes first
    if (hinted) { pgCont = hinted; pgFoundBy = "attribute"; return pgCont; }
    const best = pgLib.pickFeedParent(pgScan(), { viewportWidth: window.innerWidth });
    if (best) { pgCont = best; pgFoundBy = "shape"; return pgCont; }
    pgWhy = "no feed found";
    return null;
  }

  function pgEnsureStyle() {
    if (document.getElementById("tabguard-pg-style")) return;
    const st = document.createElement("style");
    st.id = "tabguard-pg-style";
    st.textContent = "[" + PG_ATTR + "],[" + PG_PARK + "]{display:none !important}";
    (document.head || document.documentElement).appendChild(st);
  }
  function pgDark() {
    try {
      const c = getComputedStyle(document.body).backgroundColor.match(/\d+(\.\d+)?/g);
      if (c && c.length >= 3 && !(c.length === 4 && +c[3] === 0)) return (0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]) < 128;
    } catch (_) {}
    return matchMedia("(prefers-color-scheme: dark)").matches;
  }
  function pgEnsureBtn() {
    if (pgBtnHost) return;
    pgBtnHost = document.createElement("div");
    pgBtnHost.__pgSkip = true;
    pgBtnHost.setAttribute("data-tabguard", "feed-button");
    pgBtnHost.style.cssText = "display:block;margin:8px 0 16px;";
    const root = pgBtnHost.attachShadow({ mode: "open" });
    const dark = pgDark();
    setHTML(root, `<style>
      .card{box-sizing:border-box;width:100%;padding:22px 18px;border-radius:12px;text-align:center;
        font:14px/1.4 system-ui,-apple-system,"Segoe UI",sans-serif;
        border:1px dashed ${dark ? "rgba(255,255,255,.22)" : "rgba(0,0,0,.18)"};
        background:${dark ? "rgba(255,255,255,.04)" : "rgba(0,0,0,.025)"};
        color:${dark ? "#c9d1dc" : "#4a5361"};}
      .end{margin:0 0 12px;font-size:13px;letter-spacing:.02em;opacity:.8}
      .b{font:600 15px/1.2 system-ui,-apple-system,sans-serif;color:#fff;background:#3b82f6;border:0;
        border-radius:999px;padding:12px 24px;cursor:pointer;}
      .b:hover{background:#2f6fde}
      .b:disabled{cursor:default;background:${dark ? "#2a3140" : "#d9dee6"};color:${dark ? "#9aa3b6" : "#5b6472"};}
    </style><div class="card"><p class="end" id="end"></p><button class="b" id="pg" type="button"></button></div>`);
    pgBtn = root.getElementById("pg");
    pgBtn.addEventListener("click", (e) => { e.stopPropagation(); pgOnClick(); });
    const end = root.getElementById("end");
    pgText((m) => { end.textContent = m ? m.t(stageLang, "pg_end") : "End of page"; });
  }
  function pgText(fn) {
    if (pgI18n) return fn(pgI18n);
    const u = tgURL("assets/i18n.js");
    if (u) tgImport(u).then(m => { pgI18n = m; fn(m); }).catch(() => fn(null)); else fn(null);
  }
  function pgLabel() {
    if (!pgBtn || pgBusy) return;
    const n = PG.pageSize || 10;
    pgText((m) => { if (pgBtn && !pgBusy) pgBtn.textContent = m ? m.t(stageLang, "pg_load", { n }) : `Load next ${n}`; });
  }

  // One pass: classify new posts, sync the hidden attribute, place the button.
  function pgRender() {
    if (!pgActive()) { if (pgCont || pgBtnHost) pgReset("inactive"); pgCode = (PG && PG.enabled) ? "trusted" : "off"; return; }
    if (!pgFindCont()) { pgCode = "nofeed"; return; }
    if (pgAbsoluteList(pgCont)) {
      if (pgBaselined || pgBtnHost) { const c = pgCont; pgReset(null); pgCont = c; }
      pgCode = "unsupported"; pgWhy = "posts are absolutely positioned (virtual list) — left alone";
      return;
    }
    const slots = pgSlots();
    const posts = slots.filter(pgHasContent);

    // Page 1 = the post count once it has held still for a moment. Measuring
    // mid-hydration once fixed page 1 at a single post, for good.
    if (!pgBaselined) {
      if (posts.length < PG_MIN_PAGE) { pgWhy = `feed not settled (${posts.length} posts)`; pgCode = "settling"; return; }
      const now = Date.now();
      if (posts.length !== pgSettle.n) { pgSettle = { n: posts.length, t: now }; pgWhy = "feed settling"; pgCode = "settling"; return; }
      if (now - pgSettle.t < PG_SETTLE_MS) { pgWhy = "feed settling"; pgCode = "settling"; return; }
      // Posts on screen now are page 1. Empty slots present now are marked
      // "slot": never hidden (one of them is the feed's end-of-list trigger,
      // which may later hold a spinner) and never an anchor for the wall.
      for (const el of slots) pgState.set(el, pgHasContent(el) ? "shown" : "slot");
      pgBaselined = true; pgCredit = 0;
    }

    // Classify posts we have not decided on yet. A post inserted above one
    // that is already shown belongs above the wall (refresh at the top, a late
    // ad); everything else is new arrivals, admitted only on credit.
    // Only real shown posts count as that anchor. The feed's empty trigger at
    // the very end once counted too — and then every new post sat "above" it
    // and nothing was ever held.
    let lastShown = -1;
    slots.forEach((el, i) => { if (pgState.get(el) === "shown" && pgHasContent(el)) lastShown = i; });
    slots.forEach((el, i) => {
      if (pgState.has(el) || !pgHasContent(el)) return;   // empty: decide once it gets content
      const a = pgLib.admit(pgCredit, i < lastShown);
      pgCredit = a.credit;
      pgState.set(el, a.show ? "shown" : "held");
    });

    // Sync the attribute. Never on an empty slot — that is the feed's own
    // end-of-list trigger, and hiding it stops the feed.
    let held = 0, firstHeld = null;
    for (const el of slots) {
      const hold = pgState.get(el) === "held" && pgHasContent(el);
      if (hold) { held++; if (!firstHeld) firstHeld = el; }
      if (hold !== el.hasAttribute(PG_ATTR)) { if (hold) el.setAttribute(PG_ATTR, ""); else el.removeAttribute(PG_ATTR); }
    }

    // Park the feed's end-of-list trigger while a full page is waiting.
    // Hidden posts take no space, so the trigger stays in view and the site
    // would keep loading in the background — measured: 33 -> 66 held posts in
    // six idle seconds. The trailing empty slots are that trigger; hiding them
    // makes the observer see it leave. Once less than a page waits, it comes
    // back into view and the site loads as usual.
    const full = held >= Math.max(1, PG.pageSize || 10);
    let lastPost = -1;
    slots.forEach((el, i) => { if (pgHasContent(el) && pgState.get(el) !== "slot") lastPost = i; });
    slots.forEach((el, i) => {
      const park = full && i > lastPost && pgState.get(el) !== "held";
      if (park !== el.hasAttribute(PG_PARK)) { if (park) el.setAttribute(PG_PARK, ""); else el.removeAttribute(PG_PARK); }
    });
    pgParked = full;

    if (held > 0 || pgBusy) {
      pgEnsureStyle(); pgEnsureBtn();
      // the card sits right where the held posts begin
      const anchor = firstHeld || (pgBtnHost && pgBtnHost.nextSibling);
      if (anchor && anchor.parentNode === pgCont && pgBtnHost.nextSibling !== anchor) {
        try { pgCont.insertBefore(pgBtnHost, anchor); } catch (_) {}
      } else if (!pgBtnHost.isConnected) {
        try { pgCont.appendChild(pgBtnHost); } catch (_) {}
      }
      pgLabel();
      pgWhy = null; pgCode = "holding"; pgHeldNow = held;
    } else {
      if (pgBtnHost) { pgBtnHost.remove(); pgBtnHost = null; pgBtn = null; }
      pgWhy = pgCredit > 0 ? `page open (${pgCredit} more before the button)` : "page 1, nothing new yet";
      pgCode = pgCredit > 0 ? "open" : "page1"; pgHeldNow = 0;
    }
  }
  function pgThrottle() { if (pgPend) return; pgPend = true; setTimeout(() => { pgPend = false; pgRender(); }, 150); }

  function pgCountdown(secs) {
    return new Promise(res => {
      if (secs <= 0 || !pgBtn) return res();
      pgBtn.disabled = true;
      const end = Date.now() + secs * 1000;
      const tick = () => {
        if (!pgBtn) return res();
        const left = Math.ceil((end - Date.now()) / 1000);
        pgBtn.textContent = pgI18n ? pgI18n.t(stageLang, "pg_wait", { s: Math.max(0, left) }) : `wait ${Math.max(0, left)}s…`;
        if (left <= 0) { pgBtn.disabled = false; return res(); }
        setTimeout(tick, 250);
      };
      tick();
    });
  }
  async function pgOnClick() {
    if (pgBusy || !pgBtn) return;
    pgBusy = true;
    try {
      await pgCountdown(Math.max(0, PG.delaySeconds || 0));
      const heldEls = pgSlots().filter(el => pgState.get(el) === "held");
      const r = pgLib.release(heldEls.length, PG.pageSize);
      heldEls.slice(0, r.release).forEach(el => pgState.set(el, "shown"));
      pgCredit = r.credit;
      pgReleasedTotal += r.release;
    } finally { pgBusy = false; pgRender(); }
  }

  // discovery: remember which elements receive appended children
  try {
    new MutationObserver(muts => {
      let relevant = false;
      for (const m of muts) {
        const parent = m.target;
        if (!(parent instanceof Element) || parent.__pgSkip) continue;
        if (m.addedNodes && m.addedNodes.length) {
          let n = 0; m.addedNodes.forEach(x => { if (x.nodeType === 1 && !x.__pgSkip) n++; });
          if (n) { pgTally.set(parent, (pgTally.get(parent) || 0) + n); relevant = true; }
        }
        if (m.removedNodes && m.removedNodes.length) relevant = true;
      }
      if (relevant && pgActive() && !pgBusy) pgThrottle();
    }).observe(document.documentElement, { childList: true, subtree: true });
  } catch (_) {}
  window.addEventListener("resize", () => pgThrottle(), { passive: true });

  function loadPG() {
    // declared as a content script in the manifest, so it is simply there
    pgLib = (typeof globalThis !== "undefined" ? globalThis : self).TGFeedFriction || null;
    try {
      chrome.storage.local.get("tabguardConfig", g => {
        const conf = g.tabguardConfig || {};
        // "pause protection" switches this off too; it comes back with the pause
        const next = conf.enabled === false ? null : (conf.pagination || null);
        const key = JSON.stringify(next);
        if (key === pgSettingsKey && pgReady) return;        // other settings changed: leave the feed alone
        pgSettingsKey = key;
        PG = next;
        pgReset(null); pgReady = false;
        if (!PG || !PG.enabled || !pgLib) return;
        // Don't let a missing status reply strand the feature: ask, but start
        // regardless after a moment. A watched host is the common case, and
        // isActiveHost() still honours an explicit entry in PG.hosts.
        let settled = false;
        const start = (watched) => {
          if (settled) return;
          settled = true;
          pgWatched = !!watched;
          pgReady = true;
          pgRender();
          // print the state once, unprompted, so a break is visible without
          // anyone having to know a magic incantation
          if (!pgLogged) { pgLogged = true; setTimeout(() => pgReport("startup"), 4000); }
        };
        safeSend({ type: "GET_STATUS" }, (s) => start(s && s.watched));
        setTimeout(() => start(true), 2500);
      });
    } catch (_) {}
  }

  // ---- diagnostics ----------------------------------------------------------
  // A content script lives in an isolated world: anything it hangs on `window`
  // is invisible to the page console. Two routes that do work: the report is
  // printed by itself a few seconds after load, and a postMessage handler
  // crosses the world boundary on demand.
  function pgDescribe(el) {
    if (!el) return null;
    const a = (n) => { try { const v = el.getAttribute(n); return v ? `[${n}="${v}"]` : ""; } catch (_) { return ""; } };
    return el.tagName + a("role") + a("data-testid") + a("data-component-type");
  }
  function pgReport(label) {
    const slots = pgSlots();
    const info = {
      version: (() => { try { return chrome.runtime.getManifest().version; } catch (_) { return "?"; } })(),
      extAlive: extAlive(), lib: !!pgLib, enabled: !!(PG && PG.enabled),
      pageSize: PG && PG.pageSize, delaySeconds: PG && PG.delaySeconds, listedHosts: PG && PG.hosts,
      ready: pgReady, watched: pgWatched, active: pgActive(),
      container: pgDescribe(pgCont), foundBy: pgFoundBy, baselined: pgBaselined,
      slots: slots.length, posts: slots.filter(pgHasContent).length,
      shown: slots.filter(el => pgState.get(el) === "shown").length,
      held: slots.filter(el => pgState.get(el) === "held").length,
      credit: pgCredit, released: pgReleasedTotal, loaderParked: pgParked,
      button: !!(pgBtnHost && pgBtnHost.isConnected), code: pgCode, status: pgWhy,
    };
    console.log(`%c[Tab Guard] feed to friction — ${label}`, "font-weight:bold", info);
    const hints = PG_HINTS.map(sel => {
      let n = 0, listy = 0;
      try {
        const els = document.querySelectorAll(sel);
        n = els.length;
        for (const el of els) if (pgLooksListy(el)) listy++;
      } catch (_) { return { selector: sel, matches: "bad selector", usable: 0 }; }
      return { selector: sel, matches: n, usable: listy };
    });
    console.table(hints);
    return info;
  }
  // from the page console:  postMessage({ __tabguard: "feed" }, "*")
  window.addEventListener("message", (e) => {
    try {
      if (e.source !== window || !e.data) return;
      if (e.data.__tabguard === "feed") {
        const info = pgReport("on request");
        // answer in the page world too, so a test (or you) can read it back
        window.postMessage({ __tabguardReport: info }, "*");
      }
    } catch (_) {}
  });
  try { chrome.storage.onChanged.addListener((c, a) => { if (a === "local" && c.tabguardConfig) loadPG(); }); } catch (_) {}
  setInterval(() => { if (pgActive() && !pgBusy) pgRender(); }, 1000);
  loadPG();

  // ---- short-form video filter ----------------------------------------------
  let SF = null;
  // The pause switches the filter off; items it greyed or blurred get their
  // look back right away (removed or collapsed ones return on the next load).
  const sfTouched = new Set();
  function sfFrom(conf) { conf = conf || {}; return conf.enabled === false ? null : (conf.shortForm || null); }
  function sfApply(next) {
    SF = next;
    if (!SF || !SF.enabled) {
      sfTouched.forEach(el => { try { el.style.removeProperty("filter"); el.style.removeProperty("cursor"); el.__tgSF = false; } catch (_) {} });
      sfTouched.clear();
    }
    sfScan(); sfMaybeBlockUrl();
  }
  function loadSF() {
    try { chrome.storage.local.get("tabguardConfig", g => sfApply(sfFrom(g.tabguardConfig))); } catch (_) {}
  }
  try {
    chrome.storage.onChanged.addListener((c, a) => {
      if (a === "local" && c.tabguardConfig) sfApply(sfFrom(c.tabguardConfig.newValue));
    });
  } catch (_) {}

  // Level 1: block /shorts/ and /reels/ pages outright — and (experimental)
  // pages recognised as a swipe feed by their layout.
  let sfUrlCover = null, sfSwipeHit = false;
  function sfMaybeBlockUrl() {
    const on = SF && SF.enabled && SF.blockShortsUrls;
    const isShort = /\/(shorts|reels)(\/|$)/i.test(location.pathname);
    const swipe = SF && SF.enabled && SF.swipeFeeds && sfSwipeHit;
    if ((on && isShort) || swipe) {
      if (sfUrlCover) return;
      const kind = (on && isShort) ? "sf_blocked" : "sf_swipe";
      sfUrlCover = document.createElement("div");
      tgCoverStyle(sfUrlCover, 2147483647);
      tgUnderStyle("sf", "video{visibility:hidden!important}");
      document.querySelectorAll("video").forEach(v => { try { v.pause(); } catch (_) {} });
      document.documentElement.appendChild(sfUrlCover);
      const r = sfUrlCover.attachShadow({ mode: "open" });
      setHTML(r, `<style>.w{position:fixed;inset:0;display:flex;align-items:center;justify-content:center;
        background:rgba(10,12,18,.94);backdrop-filter:blur(8px);font:16px/1.5 system-ui,sans-serif;color:#e8ebf2}
        .c{text-align:center;max-width:360px;padding:30px}h1{font-size:21px;margin:8px 0}p{color:#9aa3b6;margin:0 0 18px}
        button{font:inherit;font-weight:650;padding:11px 18px;border:0;border-radius:11px;cursor:pointer;background:#3b82f6;color:#fff;margin:4px}
        .g{background:#1b2130;color:#cdd4e4}</style>
        <div class="w"><div class="c"><div style="font-size:40px">🚫</div>
        <h1 data-t="${kind}Title">Short-form blocked</h1>
        <p data-t="${kind}Text">This is a short-form feed — the format you asked me to keep you out of.</p>
        <button class="g" id="back" data-t="sf_back">Go back</button></div></div>`);
      r.getElementById("back").addEventListener("click", () => history.length > 1 ? history.back() : window.close());
      const _u=tgURL("assets/i18n.js"); if(!_u){removeReveal&&removeReveal();return;} tgImport(_u).then(m => {
        r.querySelectorAll("[data-t]").forEach(el => el.textContent = m.t(stageLang, el.getAttribute("data-t")));
      }).catch(() => {});
    } else if (sfUrlCover) { sfUrlCover.remove(); sfUrlCover = null; tgUnderStyle("sf", ""); }
  }

  tgGuard({ want: () => sfUrlCover !== null, el: () => sfUrlCover,
    fix: () => { try { sfUrlCover.remove(); } catch (_) {} sfUrlCover = null; sfMaybeBlockUrl(); } });

  // Level 3: catch portrait / short videos — when they play, and (pre-play,
  // on by default) as soon as their format is known: on load, for videos that
  // already autoplay before this script arrives, and for every new video.
  // Embedded players (iframes) get the same rule from frame.js.
  function sfCheckVideo(v) {
    if (!SF || !SF.enabled || !(v instanceof HTMLVideoElement) || v.__tgRevealed) return;
    const lib = (typeof globalThis !== "undefined" ? globalThis : self).TGShortForm;
    if (lib && lib.classify(v, SF)) sfAct(v, false);
  }
  document.addEventListener("play", (e) => sfCheckVideo(e.target), true);
  document.addEventListener("loadedmetadata", (e) => { if (SF && SF.prePlay !== false) sfCheckVideo(e.target); }, true);

  // Experimental: a swipe feed by its layout — at least three tiles about one
  // screen high, each holding a large video or picture, mostly vertical, in a
  // container that snaps while scrolling. Off by default (settings).
  function sfSwipeCheck() {
    if (sfSwipeHit || !SF || !SF.enabled || !SF.swipeFeeds) return;
    const vh = innerHeight, vw = innerWidth;
    const groups = new Map();                       // feed container → { tiles:Set, portrait:n }
    let n = 0;
    for (const m of document.querySelectorAll("video, img")) {
      if (++n > 400) break;
      const r = m.getBoundingClientRect();
      if (r.width < 160 || r.height < vh * 0.4) continue;
      let tile = m.parentElement, k = 0;                // the tile holds the media; the media itself isn't one
      while (tile && tile !== document.body && k++ < 8) {
        const tr = tile.getBoundingClientRect();
        if (tr.height >= vh * 0.8 && tr.height <= vh * 1.15 && tr.width >= vw * 0.25) break;
        tile = tile.parentElement;
      }
      if (!tile || tile === document.body || k > 8 || !tile.parentElement) continue;
      const feed = tile.parentElement;
      const g = groups.get(feed) || { tiles: new Set(), portrait: 0 };
      if (!g.tiles.has(tile)) {
        g.tiles.add(tile);
        const w = m.videoWidth || m.naturalWidth || r.width, h = m.videoHeight || m.naturalHeight || r.height;
        if (h / w >= 1.15) g.portrait++;
      }
      groups.set(feed, g);
    }
    const snaps = (el) => {
      for (let x = el, i = 0; x && i < 6; x = x.parentElement, i++) {
        try { const t = getComputedStyle(x).scrollSnapType || ""; if (/(^|\s)(y|block|both)(\s|$)/.test(t)) return true; } catch (_) {}
      }
      try { const t = getComputedStyle(document.documentElement).scrollSnapType || ""; if (/(y|block|both)/.test(t)) return true; } catch (_) {}
      return false;
    };
    for (const [feed, g] of groups) {
      if (g.tiles.size >= 3 && g.portrait / g.tiles.size > 0.5 && snaps(feed)) { sfSwipeHit = true; sfMaybeBlockUrl(); return; }
    }
  }

  // Level 2: feed-card filtering for known short-form containers/links.
  const SF_SEL = 'a[href*="/shorts/"], a[href*="/reels/"], ytd-reel-shelf-renderer, ytd-rich-shelf-renderer[is-shorts], ytm-reel-shelf-renderer, [data-e2e="recommend-list-item-container"], ' +
    'iframe[src*="tiktok.com/embed"], iframe[src*="tiktok.com/player"], iframe[src*="instagram.com/reel"], iframe[src*="youtube.com/shorts"], blockquote.tiktok-embed, blockquote.instagram-media[data-instgrm-permalink*="/reel/"]';
  function sfScan() {
    if (!SF || !SF.enabled) return;
    // already playing (autoplay that started before this script) always counts; idle ones only with pre-play on
    document.querySelectorAll("video").forEach(v => { if (v.readyState >= 1 && !v.__tgSF && (SF.prePlay !== false || !v.paused)) sfCheckVideo(v); });
    sfSwipeCheck();
    document.querySelectorAll(SF_SEL).forEach(node => {
      const card = node.closest('ytd-rich-item-renderer, ytd-video-renderer, ytd-grid-video-renderer, ytd-reel-item-renderer, ytd-reel-shelf-renderer, ytd-rich-shelf-renderer, li, article') || node;
      if (card && !card.__tgSF) sfAct(card, true);
    });
  }
  const sfObserver = new MutationObserver(() => { if (SF && SF.enabled) sfScanThrottled(); });
  let sfPending = false;
  function sfScanThrottled() { if (sfPending) return; sfPending = true; setTimeout(() => { sfPending = false; sfScan(); }, 400); }
  try { sfObserver.observe(document.documentElement, { childList: true, subtree: true }); } catch (_) {}

  function sfAct(el, isCard) {
    const action = (SF && SF.action) || "blur";
    el.__tgSF = true;
    if (action === "blur" || action === "greyscale" || action === "pause") sfTouched.add(el);
    if (el instanceof HTMLVideoElement) { try { el.pause(); } catch (_) {} }
    if (action === "remove" && isCard) { el.style.setProperty("display", "none", "important"); return; }
    if (action === "collapse" && isCard) {
      el.style.cssText += ";filter:none!important;";
      setHTML(el, `<div style="padding:10px 12px;font:600 12px/1.3 ui-monospace,Menlo,monospace;color:#6a7284;border:1px dashed #2a3042;border-radius:10px">⃠ <span data-t="sf_hidden"></span></div>`);
      const sp = el.querySelector('[data-t="sf_hidden"]');
      const u = tgURL("assets/i18n.js");
      if (u && sp) tgImport(u).then(m => { sp.textContent = m.t(stageLang, "sf_hidden"); }).catch(() => {});
      return;
    }
    if (action === "greyscale") el.style.setProperty("filter", "grayscale(1) contrast(.9)", "important");
    else el.style.setProperty("filter", "grayscale(1) blur(12px)", "important"); // blur / pause default
    el.style.setProperty("cursor", "pointer", "important");
    // Click to reveal (spoiler-style): one click clears the filter on this item.
    const reveal = (ev) => {
      ev.preventDefault(); ev.stopPropagation();
      el.__tgRevealed = true;                     // revealed stays revealed, also when it plays
      el.style.setProperty("filter", "none", "important");
      el.style.removeProperty("pointer-events");
      el.removeEventListener("click", reveal, true);
    };
    el.addEventListener("click", reveal, true);
  }

  loadSF();

  // ---- video previews ---------------------------------------------------------
  // Thumbnails that start a muted clip when you point at them, and GIFs that
  // loop forever: the pull of a grid of moving pictures. Three layers:
  //  1. Preview addresses in data-preview & co are taken off the thumbnail
  //     before the site reads them, so most clips never start.
  //  2. A clip that starts anyway (sites that read the address at load) is
  //     paused and hidden if it is a preview: in a link or in a preview box,
  //     no controls. The still image underneath stays.
  //  3. Looping silent clips outside links ("video GIFs") are paused on their
  //     frame; real GIFs are painted once onto a canvas and the image hidden.
  //  4. Thumbnails that swap their picture when you point at them — to an
  //     animated GIF/WebP, or through a run of frames — keep their still.
  //     One plain swap (a shop's second product photo) is allowed.
  // The main player — big, or with controls — is never touched.
  let PV = null, pvWatched = false, pvPausedAll = false, pvLive = false;
  const PV_ATTRS = ["data-preview", "data-mediabook", "data-previewvideo", "data-video-preview", "data-preview-url", "data-trailer", "data-thumb-preview"];
  const PV_MEDIA = /\.(mp4|webm|m3u8|mov)(\?|\/|#|$)|\/get_file\//i;
  const pvStash = [];                     // [el, attr, value] to restore on pause/off
  const pvFrozen = [];                    // [img, canvas]
  function pvShouldRun() {
    if (!PV || PV.enabled === false || pvPausedAll) return false;
    return pvWatched || !!PV.everywhere;
  }
  function pvEnsureStyle() {
    if (document.getElementById("tabguard-pv-style")) return;
    const st = document.createElement("style");
    st.id = "tabguard-pv-style";
    st.textContent = "video[data-tabguard-preview]{display:none !important}img[data-tabguard-frozen]{display:none !important}";
    (document.head || document.documentElement).appendChild(st);
  }
  function pvStrip(root) {
    for (const a of PV_ATTRS) {
      let els = [];
      try { els = (root.querySelectorAll ? root : document).querySelectorAll("[" + a + "]"); } catch (_) { continue; }
      els.forEach(el => {
        const v = el.getAttribute(a);
        if (v && PV_MEDIA.test(v)) { pvStash.push([el, a, v]); el.removeAttribute(a); }
      });
    }
  }
  function pvKind(v) {
    if (!(v instanceof HTMLVideoElement) || v.controls) return null;
    if (v.closest("ytd-video-preview, #video-preview, #inline-preview-player, ytd-moving-thumbnail-renderer")) return "preview";
    const r = v.getBoundingClientRect();
    const w = r.width || v.clientWidth || v.width || 0, h = r.height || v.clientHeight || v.height || 0;
    if (w > 640 || h > 480) return null;                                  // a real player
    const silentLoop = v.muted || v.hasAttribute("muted") || v.loop || v.autoplay;
    if (!silentLoop) return null;
    if (v.closest("a[href]")) return "preview";
    return v.loop ? "gif" : null;
  }
  function pvHandleVideo(v) {
    const k = pvKind(v);
    // YouTube moves the very same <video> from the hover preview into the main
    // player; once it plays as a real player it must lose the preview mark.
    if (!k) { v.removeAttribute && (v.removeAttribute("data-tabguard-preview"), v.removeAttribute("data-tabguard-gif")); return; }
    if (k === "gif" && PV.freezeGifs === false) return;
    try { v.pause(); } catch (_) {}
    v.autoplay = false;
    if (k === "preview") { pvEnsureStyle(); v.setAttribute("data-tabguard-preview", ""); }
    else v.setAttribute("data-tabguard-gif", "");
  }
  function pvFreezeImg(img) {
    if (img.__tgFrozen || !img.complete || !img.naturalWidth || PV.freezeGifs === false) return;
    const src = img.currentSrc || img.src || "";
    if (!/\.gif(\?|#|$)/i.test(src) && !/^data:image\/gif/i.test(src)) return;
    const r = img.getBoundingClientRect();
    if (r.width < 40 || r.height < 40) return;                            // spinners, icons
    try {
      const cs = getComputedStyle(img);
      const c = document.createElement("canvas");
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      c.width = Math.round(r.width * dpr); c.height = Math.round(r.height * dpr);
      c.style.cssText = `width:${r.width}px;height:${r.height}px;display:${cs.display === "inline" ? "inline-block" : cs.display};` +
        `vertical-align:${cs.verticalAlign};border-radius:${cs.borderRadius};max-width:100%`;
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);         // one frame, drawn once
      c.setAttribute("data-tabguard-frozen-canvas", "");
      img.parentNode.insertBefore(c, img);
      pvEnsureStyle(); img.setAttribute("data-tabguard-frozen", "");
      img.__tgFrozen = c; pvFrozen.push([img, c]);
    } catch (_) {}
  }
  function pvScan(root) {
    if (!pvShouldRun()) return;
    pvStrip(root || document);
    (root && root.querySelectorAll ? root : document).querySelectorAll("video").forEach(pvHandleVideo);
    (root && root.querySelectorAll ? root : document).querySelectorAll("img").forEach(img => {
      if (img.complete) pvFreezeImg(img);
      else if (!img.__tgPvWait) { img.__tgPvWait = true; img.addEventListener("load", () => { if (pvShouldRun()) pvFreezeImg(img); }, { once: true }); }
    });
  }
  function pvUndo() {
    pvStash.splice(0).forEach(([el, a, v]) => { try { if (!el.hasAttribute(a)) el.setAttribute(a, v); } catch (_) {} });
    pvFrozen.splice(0).forEach(([img, c]) => { try { c.remove(); img.removeAttribute("data-tabguard-frozen"); img.__tgFrozen = null; } catch (_) {} });
    document.querySelectorAll("video[data-tabguard-preview], video[data-tabguard-gif]").forEach(v => {
      v.removeAttribute("data-tabguard-preview"); v.removeAttribute("data-tabguard-gif");
    });
  }
  function pvApply() {
    const run = pvShouldRun();
    if (run && !pvLive) { pvLive = true; pvScan(document); }
    else if (!run && pvLive) { pvLive = false; pvUndo(); }
    else if (run) pvScan(document);
  }
  // a clip that starts later is caught the moment it plays
  document.addEventListener("play", (e) => { if (pvLive) pvHandleVideo(e.target); }, true);
  let pvPend = false;
  try {
    new MutationObserver(() => {
      if (!pvLive || pvPend) return;
      pvPend = true; setTimeout(() => { pvPend = false; pvScan(document); }, 300);
    }).observe(document.documentElement, { childList: true, subtree: true });
  } catch (_) {}
  // ---- 4. hover image swap ----
  const PV_ANIM = /\.(gif|webp|apng)(\?|#|$)|^data:image\/(gif|webp)|preview|rotat|animat/i;
  const pvSwap = new WeakMap();           // el → { orig, n, at }
  const pvBg = (v) => ((/url\(\s*["']?([^"')]+)/i.exec(v || "") || [])[1] || "");
  const pvPlaceholder = (u) => !u || /^data:image\/(svg|png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB)/i.test(u) || /blank|placeholder|spacer|1x1|lazy|loading/i.test(u);
  function pvHovered(el) {
    try { const a = el.closest("a[href]"); return el.matches(":hover") || !!(a && a.matches(":hover")); } catch (_) { return false; }
  }
  function pvSwapGuard(recs) {
    if (!pvLive || !PV || PV.hoverSwap === false) return;
    for (const r of recs) {
      const el = r.target, attr = r.attributeName;
      if (!(el instanceof Element)) continue;
      const media = el.tagName === "IMG" || el.tagName === "SOURCE";
      if (attr === "style" ? media : !media) continue;            // style: background-image on a box; src/srcset: images
      const now = attr === "style" ? pvBg(el.getAttribute("style")) : (el.getAttribute(attr) || "");
      const old = attr === "style" ? pvBg(r.oldValue) : (r.oldValue || "");
      if (now === old || (attr === "style" && !now)) continue;
      if (!el.closest("a[href]") || !pvHovered(el)) continue;      // lazy loading happens without a pointer on it
      const st = pvSwap.get(el);
      if (st && now === st.key) continue;                          // our own revert coming back
      if (!st && pvPlaceholder(old)) continue;                     // first real picture arriving
      const cur = (st && Date.now() - st.at < 4000) ? st : { raw: r.oldValue, key: old, n: 0, at: 0 };
      cur.n++; cur.at = Date.now(); pvSwap.set(el, cur);
      if (!PV_ANIM.test(now) && cur.n < 2) continue;               // one plain swap is fine
      if (cur.raw == null) el.removeAttribute(attr); else el.setAttribute(attr, cur.raw);
      el.setAttribute("data-tabguard-noswap", "");
    }
  }
  try {
    new MutationObserver(pvSwapGuard).observe(document.documentElement,
      { attributes: true, attributeOldValue: true, attributeFilter: ["src", "srcset", "style"], subtree: true });
  } catch (_) {}

  function loadPV() {
    try {
      chrome.storage.local.get("tabguardConfig", g => {
        const c = g.tabguardConfig || {};
        PV = { enabled: true, everywhere: false, freezeGifs: true, ...(c.previews || {}) };
        pvPausedAll = c.enabled === false;                 // rests during "pause protection"
        safeSend({ type: "GET_STATUS" }, (st) => { pvWatched = !!(st && st.watched); pvApply(); });
      });
    } catch (_) {}
  }
  try { chrome.storage.onChanged.addListener((ch, a) => { if (a === "local" && ch.tabguardConfig) loadPV(); }); } catch (_) {}
  loadPV();

  // Jugendschutz: read what the page says about itself and let the background
  // decide (it also checks the page's outbound links against the adult list).
  // Catches sites that are on no list and carry no RTA label — such as the
  // endless clones of the same tube software. Scoring lives in adultSignals.js.
  function adultFeatures() {
    const host = location.hostname.replace(/^www\./, "");
    const f = {};
    // the voluntary RTA label and generic adult rating metas
    for (const m of document.querySelectorAll('meta[name="rating" i]')) {
      const c = (m.getAttribute("content") || "").toUpperCase();
      if (c.includes("RTA-5042") || c === "ADULT" || c === "MATURE" || c === "XXX") { f.rta = true; break; }
    }
    if (!f.rta) { try { f.rta = document.documentElement.outerHTML.includes("RTA-5042-1996-1400-1577-RTA"); } catch (_) {} }

    // links: the site's own 2257 page, and every outbound host (for the background)
    const out = new Set();
    let n = 0;
    for (const a of document.querySelectorAll("a[href]")) {
      if (++n > 3000) break;
      let u; try { u = new URL(a.getAttribute("href"), location.href); } catch (_) { continue; }
      if (!/^https?:$/.test(u.protocol)) continue;
      const h = u.hostname.replace(/^www\./, "");
      if (h === host || h.endsWith("." + host)) {
        // only the site's OWN compliance page counts; an article linking to the
        // law text (law.cornell.edu/…/2257) is a different host and is ignored
        // the LAST path segment must be the compliance page itself
        // (/2257/, /2257.html, /18-usc-2257, /usc2257.php …) — not /archive/2257-coverage/
        // and it sits near the root (/2257, /legal/2257) — a law library's
        // /uscode/text/18/2257 is not a site's own compliance notice
        const segs = u.pathname.split("/").filter(Boolean);
        const seg = segs[segs.length - 1] || "";
        if (segs.length <= 2 && /^((18-?)?u-?s-?c-?)?2257(\.(html?|php))?$/i.test(seg)) f.has2257 = true;
      } else if (out.size < 80) out.add(h);
    }
    f.hosts = [...out];

    // A search results page is made of other sites' titles and links, so those
    // must not count against the search engine itself (it would close and
    // remember google.com after one explicit query).
    f.searchPage = searchInfo().page;

    // the tube CMS most such clones run on (Kernel Video Sharing) and its kin
    f.tubeCms = !!document.querySelector('#kt_player, script[src*="/player/kt_player"], img[src*="/videos_screenshots/"], img[data-original*="/videos_screenshots/"], a[href*="/get_file/"]');
    f.previews = document.querySelectorAll('[data-preview*=".mp4"], [data-preview*="/get_file/"], [data-mediabook], [data-previewvideo]').length;
    let d = 0, k = 0;
    for (const el of document.querySelectorAll(".duration, [class*=duration], [class*=time], span, div")) {
      if (++k > 4000) break;
      if (el.childElementCount === 0 && /^\s*\d{1,2}:\d{2}(:\d{2})?\s*$/.test(el.textContent || "")) d++;
      if (d >= 40) break;
    }
    f.durations = d;

    // what the thumbnails and headings are called
    const texts = [document.title];
    document.querySelectorAll("h1, h2").forEach((h, i) => { if (i < 20) texts.push(h.textContent); });
    let t = 0;
    for (const el of document.querySelectorAll("img[alt], a[title]")) {
      if (++t > 300) break;
      texts.push(el.getAttribute("alt") || el.getAttribute("title"));
    }
    const lib = (typeof globalThis !== "undefined" ? globalThis : self).TGAdultSignals;
    if (lib) {
      f.explicit = lib.explicitStats(texts);
      const meta = (sel) => { const m = document.querySelector(sel); return m ? m.getAttribute("content") || "" : ""; };
      f.selfDescribed = lib.selfDescribedAdult([document.title, meta('meta[name="description"]'), meta('meta[property="og:site_name"]')].join(" \n "));
    }
    return f;
  }
  // Is this a search results page, and what was searched? Recognised by a
  // query in the address, a /search path, the searx/SearXNG generator tag, or a
  // filled search box — the last two also catch POST searches (searx) whose
  // query never shows in the URL. Read locally, never sent anywhere.
  function searchInfo() {
    let query = "", inUrl = false, filled = false;
    try {
      const sp = new URLSearchParams(location.search);
      for (const k of ["q", "query", "search_query", "p", "search", "text", "wd", "k", "keywords"]) {
        const v = (sp.get(k) || "").trim(); if (v) { query = v; inUrl = true; break; }
      }
      for (const i of document.querySelectorAll('input[type="search"], input[name="q"], input[name="query"], form[role="search"] input[type="text"]')) {
        const v = (i.value || "").trim(); if (v) { filled = true; if (!query) query = v; break; }
      }
    } catch (_) {}
    const gen = (document.querySelector('meta[name="generator" i]') || {}).content || "";
    const page = inUrl || filled || /(^|\/)(search|suche|results?)(\/|$)/i.test(location.pathname) || /searx/i.test(gen);
    return { page, query };
  }

  // A breathing pause before the results when the search itself is explicit.
  function checkSearch() {
    const si = searchInfo();
    const lib = (typeof globalThis !== "undefined" ? globalThis : self).TGAdultSignals;
    if (!si.page || !si.query || !lib) return;
    if (lib.explicitStats([si.query]).items > 0) safeSend({ type: "SEARCH_PAUSE", q: si.query.slice(0, 200) });
  }

  // SearXNG (any instance, usually a POST form) keeps its filter in the page,
  // not the address. Strict = 2. Anything less: ask again with 2 over GET; if
  // the instance still answers unfiltered, it is closed like a blocked site.
  function enforceSearxSafe() {
    const gen = (document.querySelector('meta[name="generator" i]') || {}).content || "";
    if (!/searx/i.test(gen)) return;
    const sel = document.querySelector('select[name="safesearch"]') || document.querySelector('input[name="safesearch"]');
    if (!sel) return;
    const val = String(sel.value || "");
    if (val === "2") return;
    const si = searchInfo();
    if (!si.query) return;                         // start page, no results yet
    let tried = false; try { tried = sessionStorage.getItem("tabguard-safe") === si.query; } catch (_) {}
    if (tried) { safeSend({ type: "UNFILTERED_SEARCH" }); return; }
    try { sessionStorage.setItem("tabguard-safe", si.query); } catch (_) {}
    const f = sel.form || document.querySelector("form#search") || document.querySelector('form[action*="search"]');
    const u = new URL((f && f.getAttribute("action")) || "/search", location.href);
    if (f) for (const [k, v] of new FormData(f)) if (typeof v === "string" && v) u.searchParams.set(k, v);
    u.searchParams.set("q", si.query);
    u.searchParams.set("safesearch", "2");
    document.documentElement.style.visibility = "hidden";   // no flash of the unfiltered results
    location.replace(u.toString());
  }

  // Links to known or recognised adult sites: greyed out and inert. Clicking
  // would only end at the content filter anyway; this shows it before.
  const greyDone = new Set();
  function greyLinks() {
    const host = location.hostname.replace(/^www\./, "");
    const hosts = new Set();
    let n = 0;
    for (const a of document.querySelectorAll("a[href]")) {
      if (++n > 3000) break;
      let u; try { u = new URL(a.getAttribute("href"), location.href); } catch (_) { continue; }
      const h = u.hostname.replace(/^www\./, "");
      if (h && h !== host && !greyDone.has(h)) hosts.add(h);
      if (hosts.size >= 150) break;
    }
    if (!hosts.size) return;
    [...hosts].forEach(h => greyDone.add(h));
    safeSend({ type: "ADULT_LINKS", hosts: [...hosts] }, (r) => {
      const bad = new Set((r && r.adult) || []);
      if (!bad.size) return;
      if (!document.getElementById("tabguard-grey-style")) {
        const st = document.createElement("style"); st.id = "tabguard-grey-style";
        st.textContent = "[data-tabguard-adultlink]{opacity:.28 !important;filter:grayscale(1) blur(1px) !important;pointer-events:none !important;cursor:not-allowed !important}";
        (document.head || document.documentElement).appendChild(st);
      }
      greyBad = new Set([...greyBad, ...bad]);
      markGrey();
    });
  }
  let greyBad = new Set();
  function markGrey() {
    if (!greyBad.size) return;
    document.querySelectorAll("a[href]:not([data-tabguard-adultlink])").forEach(a => {
      let u; try { u = new URL(a.getAttribute("href"), location.href); } catch (_) { return; }
      const h = u.hostname.replace(/^www\./, "");
      for (const b of greyBad) if (h === b || h.endsWith("." + b)) { a.setAttribute("data-tabguard-adultlink", ""); a.setAttribute("tabindex", "-1"); a.setAttribute("aria-disabled", "true"); break; }
    });
  }
  let greyPend = false;
  let adultChecks = 0;
  function checkAdult() {
    if (adultChecks >= 3) return;                 // a few looks are enough; lazy grids fill in late
    adultChecks++;
    try { safeSend({ type: "ADULT_SIGNALS", features: adultFeatures() }); } catch (_) {}
  }
  safeSend({ type: "IS_ADULT_ENABLED" }, (r) => {
    if (!r) return;
    // the imported list's search rules, for searches posted as a form
    if (r.imported) { const si = searchInfo(); if (si.page && si.query) safeSend({ type: "SEARCH_QUERY", q: si.query.slice(0, 300) }); }
    if (r.bypass) bypassStart();
    if (!r.enabled) return;
    const lib = (typeof globalThis !== "undefined" ? globalThis : self).TGAdultSignals;
    if (lib && r.terms && r.terms.length) lib.setExtraTerms(r.terms);
    if (r.safeSearch) enforceSearxSafe();
    checkAdult();
    setTimeout(checkAdult, 2500);
    setTimeout(checkAdult, 7000);
    if (r.searchPause) checkSearch();
    if (r.greyLinks) {
      greyLinks();
      try {
        new MutationObserver(() => {
          if (greyPend) return;
          greyPend = true; setTimeout(() => { greyPend = false; greyLinks(); markGrey(); }, 800);
        }).observe(document.documentElement, { childList: true, subtree: true });
      } catch (_) {}
    }
  });

  // ---- guides for getting around blockers (YouTube) ---------------------------
  // With the content filter on: results whose title or snippet is about
  // unblocked games, proxy link drops or beating school filters are covered
  // with a short note; such a video page gets a cover with an explanation; links
  // in descriptions that lead to such sites are switched off.
  let bpOn = false, bpCover = null, bpTr = null, bpLastUrl = "";
  const BP_ITEMS = "ytd-video-renderer,ytd-rich-item-renderer,ytd-compact-video-renderer,ytd-grid-video-renderer,ytd-playlist-renderer,ytd-reel-item-renderer,yt-lockup-view-model,ytm-video-with-context-renderer,ytm-compact-video-renderer";
  function bpLib() { return (typeof globalThis !== "undefined" ? globalThis : self).TGBypass; }
  function bpT(k) { return bpTr ? bpTr(k) : ""; }
  function bpLoadText(cb) {
    if (bpTr) return cb();
    const u = tgURL("assets/i18n.js"); if (!u) return;
    tgImport(u).then(m => { bpTr = (k) => m.t(stageLang || tgLang, k); cb(); }).catch(() => {});
  }
  function bpItemText(el) {
    const parts = [];
    el.querySelectorAll("#video-title,#video-title-link,h3,.yt-lockup-metadata-view-model-wiz__title,.metadata-snippet-text,#description-text,.yt-core-attributed-string").forEach(n => {
      parts.push(n.getAttribute && n.getAttribute("title") || "", n.textContent || "");
    });
    return parts.join(" ").slice(0, 1500);
  }
  function tgCoverGone(c) {
    try { const cs = getComputedStyle(c); return cs.display === "none" || cs.visibility !== "visible" || parseFloat(cs.opacity) < 0.9 || cs.position !== "absolute"; } catch (_) { return false; }
  }
  function bpCoverItem(el) {
    if (el.__tgBp) return;
    el.__tgBp = true;
    if (getComputedStyle(el).position === "static") el.style.position = "relative";
    const c = document.createElement("div");
    c.setAttribute("data-tabguard", "bypass");
    c.style.cssText = "position:absolute!important;inset:0!important;z-index:5!important;display:flex!important;visibility:visible!important;opacity:1!important;align-items:center;justify-content:center;text-align:center;padding:10px;"
      + "background:var(--yt-spec-base-background,#0f0f0f);color:var(--yt-spec-text-secondary,#aaa);font:500 13px/1.4 Roboto,Arial,sans-serif;"
      + "border:1px dashed rgba(128,128,128,.35);border-radius:12px;cursor:default";
    c.textContent = "⃠ " + bpT("bp_hidden");
    c.title = bpT("bp_why");
    ["click", "mousedown", "pointerdown", "mouseover"].forEach(ev => c.addEventListener(ev, e => { e.stopPropagation(); if (ev === "click") e.preventDefault(); }, true));
    el.appendChild(c);
  }
  function bpLinks(root, all) {
    const lib = bpLib(); if (!lib) return 0;
    let n = 0;
    root.querySelectorAll('a[href*="/redirect?"],a[href^="http"]').forEach(a => {
      const href = a.getAttribute("href") || "";
      if (!lib.isBypassLink(href)) return;
      if (!all && /script\.google\.com/.test(decodeURIComponent(href))) { n++; return; }   // Apps Script: only on a bypass video
      n++;
      if (a.__tgBp) return;
      a.__tgBp = true;
      a.removeAttribute("href");
      a.style.textDecoration = "line-through"; a.style.opacity = ".55"; a.style.pointerEvents = "auto"; a.style.cursor = "not-allowed";
      a.title = bpT("bp_link");
      a.addEventListener("click", e => { e.preventDefault(); e.stopPropagation(); }, true);
    });
    return n;
  }
  // Once a video is covered it stays covered: YouTube rebuilds the title and
  // description several times while loading, and a moment without them must
  // not lift the cover (that made it flash). It is only lifted after moving
  // to another video whose own title is there and clean, twice in a row.
  let bpCoveredFor = null, bpCoveredTitle = "", bpClean = 0;
  function bpWatchCheck() {
    const lib = bpLib(); if (!lib) return;
    if (location.pathname !== "/watch") { bpUncover(); bpCoveredFor = null; return; }
    const vid = new URLSearchParams(location.search).get("v") || "";
    const title = ((document.querySelector("ytd-watch-metadata h1, h1.ytd-watch-metadata, #title h1") || {}).textContent || "").trim();
    const descEl = document.querySelector("ytd-watch-metadata #description, #description-inline-expander, ytd-text-inline-expander, #description");
    const desc = descEl ? descEl.textContent || "" : "";
    const links = descEl ? bpLinks(descEl, false) : 0;
    const t = title || document.title.replace(/ - YouTube$/, "");
    const hit = lib.score(t) >= 2 || lib.score(t + " " + desc.slice(0, 4000)) >= 3 || links >= 3;
    if (hit) {
      if (descEl) bpLinks(descEl, true);
      bpCoverPage(); bpCoveredFor = vid; bpCoveredTitle = title; bpClean = 0;
      return;
    }
    if (!bpCover) return;
    if (bpCoveredFor === vid) return;                        // same video: stays covered
    if (!title || title === bpCoveredTitle) return;          // the new video's details aren't there yet
    if (++bpClean < 2) return;
    bpUncover(); bpCoveredFor = null; bpClean = 0;
  }
  function bpCoverPage() {
    document.querySelectorAll("video").forEach(v => { try { v.pause(); } catch (_) {} });
    if (bpCover) return;
    bpCover = document.createElement("div");
    tgCoverStyle(bpCover, 2147483647);
    // underneath, too: no picture, no description, no links — so removing the
    // cover in the inspector leaves nothing to use
    tgUnderStyle("bp", "#movie_player,video{visibility:hidden!important}ytd-watch-metadata #description,#description-inline-expander,ytd-text-inline-expander,#description,#comments{display:none!important}");
    document.documentElement.appendChild(bpCover);
    const r = bpCover.attachShadow({ mode: "open" });
    setHTML(r, `<style>.w{position:fixed;inset:0;display:flex;align-items:center;justify-content:center;
      background:rgba(10,12,18,.95);backdrop-filter:blur(8px);font:16px/1.5 system-ui,sans-serif;color:#e8ebf2}
      .c{text-align:center;max-width:400px;padding:30px}h1{font-size:21px;margin:8px 0}p{color:#9aa3b6;margin:0 0 18px}
      button{font:inherit;font-weight:650;padding:11px 18px;border:0;border-radius:11px;cursor:pointer;background:#1b2130;color:#cdd4e4}</style>
      <div class="w"><div class="c"><div style="font-size:40px">🧭</div><h1 id="t"></h1><p id="x"></p><button id="back"></button></div></div>`);
    r.getElementById("t").textContent = bpT("bp_title");
    r.getElementById("x").textContent = bpT("bp_text");
    r.getElementById("back").textContent = bpT("sf_back");
    r.getElementById("back").addEventListener("click", () => history.length > 1 ? history.back() : (location.href = "/"));
  }
  tgGuard({ want: () => bpCover !== null, el: () => bpCover,
    fix: () => { try { bpCover.remove(); } catch (_) {} bpCover = null; bpCoverPage(); } });
  setInterval(() => { if (bpCover || sfUrlCover) document.querySelectorAll("video").forEach(v => { if (!v.paused) try { v.pause(); } catch (_) {} }); }, 500);
  function bpUncover() { if (bpCover) { bpCover.remove(); bpCover = null; tgUnderStyle("bp", ""); } }
  document.addEventListener("play", (e) => { if (bpCover && e.target instanceof HTMLMediaElement) { try { e.target.pause(); } catch (_) {} } }, true);
  function bpScan() {
    if (!bpOn) return;
    const lib = bpLib(); if (!lib) return;
    // covers removed in the inspector come back
    document.querySelectorAll("[data-tabguard-bpitem]").forEach(el => {
      const c = el.querySelector(':scope > [data-tabguard="bypass"]');
      if (!c || tgCoverGone(c)) { if (c) c.remove(); el.__tgBp = false; bpCoverItem(el); }
    });
    document.querySelectorAll(BP_ITEMS).forEach(el => {
      if (el.__tgBp || el.querySelector('[data-tabguard="bypass"]')) return;
      if (el.closest('[data-tabguard-bpitem]')) return;
      if (lib.score(bpItemText(el)) >= 2) { const top = el.closest("ytd-rich-item-renderer") || el; top.setAttribute("data-tabguard-bpitem", ""); bpCoverItem(top); }
    });
    bpLinks(document, false);
    bpWatchCheck();
  }
  // ---- proxy and unblocker sites ----------------------------------------------
  // Recognised by what they are built like: a page hidden inside another
  // (the real address coded into the frame's path), a tab title pretending to
  // be Classroom or IXL, a browser-style address bar, a Games / Movies / Proxy
  // menu, a web app hidden as an .svg file on a code CDN — plus the words.
  // A found site is closed and remembered (by its project path on shared hosts).
  let bsSent = false, bsDb = false, bsDbAsked = false;
  // a frame that is actually shown (hidden login or tracking frames are tiny)
  function bsShown(f) { try { const r = f.getBoundingClientRect(); return r.width >= 200 && r.height >= 150; } catch (_) { return false; } }
  function bsFeatures() {
    const lib = bpLib(); if (!lib) return null;
    const host = location.hostname, why = [];
    let s = 0;
    if (lib.isProxyUrl(location.href)) { s += 6; why.push("proxyUrl"); }
    for (const f of document.querySelectorAll("iframe[src],frame[src],embed[src],object[data]")) {
      const src = f.getAttribute("src") || f.getAttribute("data") || "";
      let abs = src; try { abs = new URL(src, location.href).href; } catch (_) {}
      let same = false; try { same = new URL(abs).origin === location.origin; } catch (_) {}
      if (lib.isProxyUrl(abs) || (same && lib.isFramedProxy(abs) && bsShown(f))) { s += 6; why.push("proxyFrame"); break; }
    }
    const root = document.documentElement;
    const isSvgDoc = root && root.namespaceURI === "http://www.w3.org/2000/svg";
    if (isSvgDoc && root.querySelector("script, foreignObject")) { s += lib.isBypassLink(location.href) ? 3 : 2; why.push("svgApp"); }
    const meta = (sel) => { const m = document.querySelector(sel); return m ? m.getAttribute("content") || "" : ""; };
    const heads = [...document.querySelectorAll("h1,h2,h3")].slice(0, 12).map(h => h.textContent).join(" ");
    const labels = [...document.querySelectorAll("button,a,[role=button],[aria-label],nav *")].slice(0, 400)
      .map(e => (e.getAttribute && (e.getAttribute("aria-label") || e.getAttribute("data-tab-label") || e.getAttribute("title"))) || (e.children.length ? "" : e.textContent || ""))
      .map(x => String(x).trim().toLowerCase()).filter(x => x && x.length < 30);
    const title = document.title || "";
    const text = [title, meta('meta[name="description"]'), meta('meta[property="og:title"]'), meta('meta[property="og:description"]'), heads, labels.slice(0, 120).join(" ")].join(" \n ");
    const ts = Math.min(4, lib.score(text) + (lib.score(title) >= 2 ? 1 : 0));
    if (ts) { s += ts; why.push("text" + ts); }
    if (lib.titleCloak(title, host)) { s += 2; why.push("cloak"); }
    const barInput = [...document.querySelectorAll("input")].find(i => lib.looksLikeUrlBar(i.getAttribute("placeholder") || ""));
    if (barInput) {
      s += 2; why.push("urlBar");
      // back / forward / reload buttons next to it: a browser inside the page
      let box = barInput; for (let k = 0; k < 4 && box.parentElement; k++) box = box.parentElement;
      const nav = [...box.querySelectorAll("button,[role=button],a")].filter(b => {
        const l = ((b.getAttribute("aria-label") || "") + " " + (b.getAttribute("title") || "")).toLowerCase();
        const ic = [...b.querySelectorAll("i,svg,span")].map(x => (x.getAttribute("class") || "") + " " + (x.getAttribute("data-lucide") || "")).join(" ");
        return /\b(back|forward|refresh|reload)\b/.test(l) || /(chevron|arrow)-(left|right)|rotate-(right|cw)|redo|refresh|reload/.test(ic);
      }).length;
      if (nav >= 2) { s += 2; why.push("navButtons"); }
      // a tab strip with a "new tab" button: a whole browser inside the page
      const newTab = [...document.querySelectorAll("button,[role=button],a,div")].slice(0, 600).some(b => {
        const l = ((b.getAttribute("title") || "") + " " + (b.getAttribute("aria-label") || "") + " " + (b.id || "")).toLowerCase();
        return /\bnew ?tab\b|^newtab$|\bnewtab\b/.test(l.trim());
      });
      if (newTab) { s += 2; why.push("tabStrip"); }
    }
    // Hidden decoys: a whole harmless page kept invisible so filters read that
    // instead, or a fake Google Docs page ready to flash up ("boss key").
    // Only looked for when something else already points that way: reading
    // the styles makes the browser load the page's fonts, and a site's own
    // broken font then shows up under Tab Guard's name.
    let decoy = false, boss = false;
    if (s >= 1) for (const el of [...document.querySelectorAll("body > *")].slice(0, 80)) {
      let hidden = false; try { const cs = getComputedStyle(el); hidden = cs.display === "none" || cs.visibility === "hidden"; } catch (_) {}
      if (!hidden && !el.hidden) continue;
      const txt = (el.textContent || "").replace(/\s+/g, " ");
      if (!decoy && txt.length > 400 && el.querySelector("h1,h2")) decoy = true;
      if (!boss && /untitled (document|spreadsheet|presentation)/i.test(txt) && /\bfile\b.*\bedit\b.*\bview\b.*\binsert\b/i.test(txt)) boss = true;
    }
    if (!boss && s >= 1) { const bz = document.querySelector('[id*="boss" i],[class*="boss" i],[id*="panic" i],[class*="cloak" i]'); if (bz && /untitled|docs|classroom|drive/i.test(bz.textContent || "")) boss = true; }
    if (decoy) { s += 1; why.push("hiddenDecoy"); }
    if (boss) { s += 3; why.push("bossScreen"); }
    const L = new Set(labels);
    const nav = ["games", "movies", "proxy", "apps", "browser", "vms", "tv", "music"].filter(k => L.has(k)).length;
    if (L.has("games") && nav >= 2) { s += 2; why.push("menu"); }
    try {
      const sw = navigator.serviceWorker && navigator.serviceWorker.controller;
      if (sw && /\/(uv|scram|scramjet|sj|bare|wisp|epoxy|proxy)[^/]*\.js|\b(uv\.sw|scramjet)/i.test(sw.scriptURL)) { s += 3; why.push("proxySW"); }
    } catch (_) {}
    // the proxy engine itself: its files, rewritten elements or storage
    if (lib.engineMarks) {
      const e = lib.engineMarks(document, window);
      if (e.engine.length) { s += 6; why.push("engine:" + e.engine[0]); }
      if (e.rewritten) { s += 6; why.push("rewritten"); }
      if (e.store) { s += 6; why.push("engineStore"); }
      if (e.transport.length) { s += 3; why.push("transport:" + e.transport[0]); }
    }
    if (bsDb) { s += 6; why.push("engineDb"); }
    return { score: s, why };
  }
  function bypassSiteCheck() {
    if (bsSent || !bpOn) return;
    const f = bsFeatures(); if (!f) return;
    if (!bsDbAsked) { bsDbAsked = true; const lib = bpLib(); if (lib && lib.engineDatabases) lib.engineDatabases(window).then(y => { if (y) { bsDb = true; bypassSiteCheck(); } }); }
    if (f.score >= 5) { bsSent = true; safeSend({ type: "BYPASS_SITE", url: location.href, why: f.why, score: f.score }); }
  }
  function bypassStart() {
    if (bpOn) return;
    bpOn = true;
    if (/(^|\.)youtube\.com$/.test(location.hostname)) tgUnderStyle("bpitems", '[data-tabguard-bpitem]>:not([data-tabguard="bypass"]){visibility:hidden!important}');
    if (!/(^|\.)youtube\.com$/.test(location.hostname)) {
      bypassSiteCheck();
      [1500, 4000, 9000, 20000].forEach(ms => setTimeout(bypassSiteCheck, ms));
      let pend = false;
      try {
        // the full look runs during the first minute; after that only new
        // frames are checked (a proxy opens its pages in one), which is cheap
        const t0 = Date.now();
        new MutationObserver(() => {
          if (pend || bsSent) return;
          pend = true;
          setTimeout(() => {
            pend = false;
            if (Date.now() - t0 < 60000) return bypassSiteCheck();
            const lib = bpLib();
            if (lib && lib.engineMarks) { const e = lib.engineMarks(document, window); if (e.engine.length || e.rewritten || e.store) return bypassSiteCheck(); }
            for (const f of document.querySelectorAll("iframe[src],frame[src]")) {
              let abs = f.getAttribute("src"); try { abs = new URL(abs, location.href).href; } catch (_) {}
              let same = false; try { same = new URL(abs).origin === location.origin; } catch (_) {}
              if (lib && (lib.isProxyUrl(abs) || (same && lib.isFramedProxy(abs) && bsShown(f)))) { bsSent = true; safeSend({ type: "BYPASS_SITE", url: location.href, why: ["proxyFrame"], score: 6 }); break; }
            }
          }, 1200);
        })
          .observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ["src"] });
      } catch (_) {}
      return;
    }
    bpLoadText(() => {
      bpScan();
      let pend = false;
      try {
        new MutationObserver(() => {
          if (pend) return;
          pend = true; setTimeout(() => { pend = false; bpScan(); }, 600);
        }).observe(document.documentElement, { childList: true, subtree: true });
      } catch (_) {}
      // YouTube changes pages without reloading
      setInterval(() => { if (location.href !== bpLastUrl) { bpLastUrl = location.href; bpClean = 0; bpScan(); setTimeout(bpScan, 900); } }, 700);
    });
  }
})();
