// frame.js — the short-form filter inside embedded players (iframes: an
// embedded TikTok, Instagram reel, a video widget). The page script runs only
// in the top frame; this small script runs in every frame but does nothing
// in the top one. Same rule (TGShortForm.classify), same actions.
(function () {
  "use strict";
  if (window.top === window) return;
  // A page shown through a web proxy (the real address is coded into this
  // frame's own): the whole tab is an unblocker site. The background decides
  // (content filter on, not a trusted site) and closes it.
  let lastHref = "";
  function proxyCheck() {
    if (location.href === lastHref) return;
    lastHref = location.href;
    try {
      const B = globalThis.TGBypass;
      let same = false; try { same = window.top.location.origin === location.origin; } catch (_) {}
      if (B && (B.isProxyUrl(location.href) || (same && B.isFramedProxy(location.href)))) chrome.runtime.sendMessage({ type: "BYPASS_SITE" }, () => void chrome.runtime.lastError);
    } catch (_) {}
  }
  proxyCheck();
  setInterval(proxyCheck, 1500);
  let SF = null;
  const touched = new Set();
  const lib = () => globalThis.TGShortForm;

  function act(v) {
    if (v.__tgSF || v.__tgRevealed) return;
    v.__tgSF = true; touched.add(v);
    try { v.pause(); } catch (_) {}
    v.autoplay = false;
    const action = SF.action || "blur";
    if (action === "remove" || action === "collapse") { v.style.setProperty("visibility", "hidden", "important"); return; }
    v.style.setProperty("filter", action === "greyscale" ? "grayscale(1) contrast(.9)" : "grayscale(1) blur(12px)", "important");
    v.style.setProperty("cursor", "pointer", "important");
    const reveal = (ev) => {
      ev.preventDefault(); ev.stopPropagation();
      v.__tgRevealed = true;
      v.style.setProperty("filter", "none", "important");
      v.removeEventListener("click", reveal, true);
    };
    v.addEventListener("click", reveal, true);
  }
  function check(v) {
    if (!SF || !SF.enabled || !lib()) return;
    if (lib().classify(v, SF)) act(v);
  }
  function scan() {
    if (!SF || !SF.enabled) return;
    document.querySelectorAll("video").forEach(v => { if (v.readyState >= 1 && (SF.prePlay !== false || !v.paused)) check(v); });
  }
  function undo() {
    touched.forEach(v => { try { v.style.removeProperty("filter"); v.style.removeProperty("visibility"); v.style.removeProperty("cursor"); v.__tgSF = false; } catch (_) {} });
    touched.clear();
  }
  function apply(conf) {
    conf = conf || {};
    SF = conf.enabled === false ? null : (conf.shortForm || null);
    if (!SF || !SF.enabled) return undo();
    scan();
  }
  document.addEventListener("play", (e) => check(e.target), true);
  document.addEventListener("loadedmetadata", (e) => { if (SF && SF.prePlay !== false) check(e.target); }, true);
  let pend = false;
  try {
    new MutationObserver(() => {
      if (pend || !SF || !SF.enabled) return;
      pend = true; setTimeout(() => { pend = false; scan(); }, 400);
    }).observe(document.documentElement, { childList: true, subtree: true });
  } catch (_) {}
  try {
    chrome.storage.local.get("tabguardConfig", g => apply(g.tabguardConfig));
    chrome.storage.onChanged.addListener((c, a) => { if (a === "local" && c.tabguardConfig) apply(c.tabguardConfig.newValue); });
  } catch (_) {}

  // ---- escalation ladder and calm view inside frames --------------------------
  // The top page shows the block screen and the reveal button; inside a frame
  // only the pictures change, the same way as on the page around it. Without
  // this, a page shown inside a frame (a web proxy, a video widget) kept its
  // colours while the rest went grey.
  const MEDIA = 'img,video,canvas,picture,[style*="background-image"],[style*="url("]';
  const CALM_MEDIA = 'img,video,picture,[style*="background-image"]';
  let stage = "none", blurPx = 0, calm = { mode: "normal", except: [] };
  function topHost() {
    try { return window.top.location.hostname.replace(/^www\./, ""); } catch (_) {}
    try { const a = location.ancestorOrigins; if (a && a.length) return new URL(a[a.length - 1]).hostname.replace(/^www\./, ""); } catch (_) {}
    return location.hostname.replace(/^www\./, "");
  }
  function css() {
    const grey = stage === "grey", blur = stage === "blur" || stage === "block";
    const h = topHost();
    const cm = (!calm || (calm.except || []).some(d => h === d || h.endsWith("." + d))) ? "normal" : (calm.mode || "normal");
    if (grey || blur) {
      const px = blur ? Math.max(blurPx || 0, stage === "block" ? 8 : 3) : (cm === "blur" ? 12 : 0);
      return `${MEDIA}{filter:grayscale(1)${px ? ` blur(${px}px)` : ""}!important;transition:filter .4s}`;
    }
    if (cm === "grey") return `${CALM_MEDIA}{filter:grayscale(1)!important;transition:filter .3s}`;
    if (cm === "blur") return `${CALM_MEDIA}{filter:blur(12px) grayscale(.35)!important;transition:filter .15s}`
      + `img:hover,video:hover,picture:hover img,a:hover img,a:hover video,:is(div,span,figure,button):hover>:is(img,video,picture){filter:none!important;transition:filter .25s .6s!important}`;
    return "";
  }
  const STYLE_ID = "__tabguard_frame__";
  function render() {
    const c = css();
    let el = document.getElementById(STYLE_ID);
    if (!c) { if (el) el.remove(); return; }
    if (!el) { el = document.createElement("style"); el.id = STYLE_ID; }
    if (el.textContent !== c) el.textContent = c;
    const parent = document.head || document.documentElement;
    if (!el.isConnected || el.nextElementSibling) parent.appendChild(el);   // last, and back if removed
  }
  try {
    chrome.runtime.onMessage.addListener((msg) => {
      if (msg && msg.type === "APPLY_STAGE") { stage = msg.stage || "none"; blurPx = msg.blurPx || 0; render(); }
    });
    chrome.runtime.sendMessage({ type: "GET_STATUS" }, (st) => {
      void chrome.runtime.lastError;
      if (st && st.watched && st.stage) { stage = st.stage; render(); }
    });
    chrome.storage.local.get("tabguardView", g => { calm = (g && g.tabguardView) || calm; render(); });
    chrome.storage.onChanged.addListener((c, a) => { if (a === "local" && c.tabguardView) { calm = c.tabguardView.newValue || { mode: "normal" }; render(); } });
  } catch (_) {}
  setInterval(render, 1000);
})();
