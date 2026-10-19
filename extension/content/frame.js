// frame.js — the short-form filter inside embedded players (iframes: an
// embedded TikTok, Instagram reel, a video widget). The page script runs only
// in the top frame; this small script runs in every frame but does nothing
// in the top one. Same rule (TGShortForm.classify), same actions.
(function () {
  "use strict";
  if (window.top === window) return;
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
})();
