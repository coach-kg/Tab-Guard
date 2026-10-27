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
  let lastHref = "", framedHref = "";
  // hidden helper frames (logins, tracking) are tiny; a proxy shows a page
  const shown = () => window.innerWidth >= 200 && window.innerHeight >= 150;
  function proxyCheck() {
    try {
      const B = globalThis.TGBypass; if (!B) return;
      if (location.href !== lastHref) {
        lastHref = location.href;
        if (B.isProxyUrl(location.href)) return report();
        let same = false; try { same = window.top.location.origin === location.origin; } catch (_) {}
        framedHref = same && B.isFramedProxy(location.href) ? location.href : "";
      }
      if (framedHref && framedHref === location.href && shown()) report();
    } catch (_) {}
  }
  let reported = false;
  function report() { if (reported) return; reported = true; chrome.runtime.sendMessage({ type: "BYPASS_SITE", strong: true }, () => void chrome.runtime.lastError); }
  // A page shown by a proxy engine carries its marks: rewritten elements that
  // keep the original address (__uv-attr-src, scramjet-attr-href …), the
  // engine's files or its storage — whatever this frame's address looks like.
  let engineLooks = 0;
  function engineCheck() {
    if (reported || engineLooks > 40) return;
    engineLooks++;
    try {
      const B = globalThis.TGBypass; if (!B || !B.engineMarks) return;
      const e = B.engineMarks(document, window);
      if (e.engine.length || e.rewritten || e.store) report();
      if (engineLooks === 1 && B.engineDatabases) B.engineDatabases(window).then(y => { if (y) report(); });
    } catch (_) {}
  }
  // A browser inside the page: an address bar with back / forward / reload
  // in a frame of the same site (the proxy's "browse" page, frames within
  // frames). Hidden helper frames are left alone.
  function browserCheck() {
    if (reported || !shown()) return;
    let same = false; try { same = window.top.location.origin === location.origin; } catch (_) {}
    if (!same) return;
    const B = globalThis.TGBypass; if (!B || !B.looksLikeUrlBar) return;
    const bar = [...document.querySelectorAll("input")].find(i => B.looksLikeUrlBar(i.getAttribute("placeholder") || ""));
    if (!bar) return;
    let box = bar; for (let k = 0; k < 4 && box.parentElement; k++) box = box.parentElement;
    const nav = [...box.querySelectorAll("button,[role=button],a")].filter(b => {
      const l = ((b.getAttribute("aria-label") || "") + " " + (b.getAttribute("title") || "") + " " + (b.id || "")).toLowerCase();
      const ic = [...b.querySelectorAll("i,svg,span")].map(x => (x.getAttribute("class") || "") + " " + (x.getAttribute("data-lucide") || "")).join(" ");
      return /\b(back|forward|refresh|reload|home)\b/.test(l) || /(chevron|arrow)-(left|right)|rotate-(right|cw)|redo|refresh|reload/.test(ic);
    }).length;
    if (nav >= 2) report();
  }

  // Adult pages shown inside a frame (a proxy's window, frames within
  // frames). The same signals as for whole pages; only frames that are
  // actually shown count, so small ads never close a page.
  let adultLooks = 0, adultOn = null;
  function adultCheck() {
    if (adultOn === false || adultLooks >= 4) return;
    const A = globalThis.TGAdultSignals; if (!A) return;
    if (window.innerWidth < 320 || window.innerHeight < 220) return;
    adultLooks++;
    try {
      const host = location.hostname.replace(/^www\./, "");
      const f = {};
      for (const m of document.querySelectorAll('meta[name="rating" i]')) { const c = (m.getAttribute("content") || "").toUpperCase(); if (c.includes("RTA-5042") || c === "ADULT" || c === "XXX") f.rta = true; }
      if (!f.rta) { try { f.rta = document.documentElement.outerHTML.includes("RTA-5042-1996-1400-1577-RTA"); } catch (_) {} }
      const out = new Set(); let n = 0;
      for (const a of document.querySelectorAll("a[href]")) {
        if (++n > 2000) break;
        // a proxied page keeps the real address next to the rewritten one
        const raw = a.getAttribute("scramjet-attr-href") || a.getAttribute("__uv-attr-href") || a.getAttribute("data-dynamic_href") || a.getAttribute("href-hammerhead-stored-value") || a.getAttribute("href");
        let u; try { u = new URL(raw, location.href); } catch (_) { continue; }
        if (!/^https?:$/.test(u.protocol)) continue;
        const h = u.hostname.replace(/^www\./, "");
        if (h !== host && out.size < 80) out.add(h);
      }
      f.hosts = [...out];
      f.tubeCms = !!document.querySelector('#kt_player, script[src*="/player/kt_player"], img[src*="/videos_screenshots/"], img[data-original*="/videos_screenshots/"], a[href*="/get_file/"]');
      f.previews = document.querySelectorAll('[data-preview*=".mp4"], [data-preview*="/get_file/"], [data-mediabook], [data-previewvideo]').length;
      let d = 0, k = 0;
      for (const el of document.querySelectorAll("span, div")) { if (++k > 4000 || d >= 40) break; if (el.childElementCount === 0 && /^\s*\d{1,2}:\d{2}(:\d{2})?\s*$/.test(el.textContent || "")) d++; }
      f.durations = d;
      const texts = [document.title];
      document.querySelectorAll("h1, h2").forEach((h, i) => { if (i < 20) texts.push(h.textContent); });
      let t = 0; for (const el of document.querySelectorAll("img[alt], a[title]")) { if (++t > 300) break; texts.push(el.getAttribute("alt") || el.getAttribute("title")); }
      f.explicit = A.explicitStats(texts);
      const meta = (sel) => { const m = document.querySelector(sel); return m ? m.getAttribute("content") || "" : ""; };
      f.selfDescribed = A.selfDescribedAdult([document.title, meta('meta[name="description"]'), meta('meta[property="og:site_name"]')].join(" \n "));
      chrome.runtime.sendMessage({ type: "ADULT_SIGNALS", features: f, frame: true }, () => void chrome.runtime.lastError);
    } catch (_) {}
  }
  // Embedded players (YouTube, its front ends, other /embed/ pages): a video
  // whose title is a guide for getting around blockers is covered in place,
  // like on YouTube itself. Other embeds play as usual.
  let embedOn = false, embedLooks = 0, embedDone = false;
  function embedCheck() {
    if (!embedOn || embedDone || embedLooks > 40) return;
    if (!/\/embed\//.test(location.pathname) && !document.querySelector("video")) return;
    embedLooks++;
    const B = globalThis.TGBypass; if (!B) return;
    const t = [document.title.replace(/\s*-\s*YouTube$/i, ""), (document.querySelector(".ytp-title-link, .ytp-title-text, meta[property='og:title']") || {}).textContent || "",
      (document.querySelector("meta[property='og:title']") || { getAttribute: () => "" }).getAttribute("content") || ""].join(" ");
    if (B.score(t) < 2) return;
    embedDone = true;
    const st = document.createElement("style");
    st.textContent = "video,.html5-video-player,#player,.video-js{visibility:hidden!important}";
    (document.head || document.documentElement).appendChild(st);
    document.querySelectorAll("video").forEach(v => { try { v.pause(); } catch (_) {} });
    const c = document.createElement("div");
    c.setAttribute("data-tabguard", "bypass");
    c.style.cssText = "position:fixed!important;inset:0!important;z-index:2147483647!important;display:flex!important;align-items:center;justify-content:center;text-align:center;padding:12px;background:#0f0f12;color:#aab;font:500 14px/1.4 system-ui,sans-serif";
    c.textContent = "⃠";
    document.documentElement.appendChild(c);
    chrome.runtime.sendMessage({ type: "I18N", keys: ["bp_hidden"] }, (r) => { void chrome.runtime.lastError; if (r && r.bp_hidden) c.textContent = "⃠ " + r.bp_hidden; });
    setInterval(() => {
      document.querySelectorAll("video").forEach(v => { if (!v.paused) try { v.pause(); } catch (_) {} });
      if (!c.isConnected) document.documentElement.appendChild(c);
      if (!st.isConnected) (document.head || document.documentElement).appendChild(st);
    }, 800);
  }

  chrome.runtime.sendMessage({ type: "IS_ADULT_ENABLED" }, (r) => {
    void chrome.runtime.lastError;
    embedOn = !!(r && r.bypass);
    if (embedOn) { embedCheck(); setInterval(embedCheck, 1500); }
    adultOn = !!(r && r.enabled);
    if (!adultOn) return;
    const A = globalThis.TGAdultSignals;
    if (A && r.terms && r.terms.length) A.setExtraTerms(r.terms);
    adultCheck(); setTimeout(adultCheck, 2500); setTimeout(adultCheck, 7000); setTimeout(adultCheck, 15000);
  });

  // Pages that are swapped in late (the proxy loads another site into this
  // frame, or writes a new page into it): a big change looks again.
  let big = 0, lastBig = 0, extra = 0;
  function watchBig() {
    try {
      new MutationObserver((recs) => {
        for (const r of recs) big += r.addedNodes.length;
        if (big < 120 || Date.now() - lastBig < 3000 || extra > 40) return;
        big = 0; lastBig = Date.now(); extra++;
        engineLooks = Math.min(engineLooks, 30); adultLooks = Math.min(adultLooks, 3);
        setTimeout(() => { engineCheck(); browserCheck(); adultCheck(); }, 1200);
      }).observe(document, { childList: true, subtree: true });
    } catch (_) {}
  }
  watchBig();
  proxyCheck();
  setInterval(() => { proxyCheck(); engineCheck(); browserCheck(); }, 1500);
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
