// exit.js — the long wait before "pause protection" / "reset pressure".
// The background holds the wait (readyAt); this page only shows it: a loading
// bar, the time left and a rotating line of flavour text. When the bar is
// full, one click does it. "Never mind" drops the wait.
import { t } from "../assets/i18n.js";

const $ = (id) => document.getElementById(id);
const msg = (m) => new Promise(r => chrome.runtime.sendMessage(m, x => { void chrome.runtime.lastError; r(x || {}); }));
const kind = new URLSearchParams(location.search).get("kind") === "reset" ? "reset" : "pause";
const FLAVORS = 12;
let LANG = "auto";

function closeSoon(ms) {
  setTimeout(() => {
    try { chrome.tabs.getCurrent(tab => { if (tab) chrome.tabs.remove(tab.id); else window.close(); }); } catch (_) { window.close(); }
  }, ms);
}

(async () => {
  const cfg = (await chrome.storage.local.get("tabguardConfig")).tabguardConfig || {};
  LANG = cfg.language || "auto";
  const st = await msg({ type: "EXIT_STATUS" });
  const halve = st.resetMode !== "full";
  document.title = "Tab Guard · " + t(LANG, kind === "pause" ? "pauseP" : (halve ? "resetHalve" : "resetPressure")).replace(/…$/, "");
  $("title").textContent = t(LANG, kind === "pause" ? "ex_titlePause" : (halve ? "ex_titleHalve" : "ex_titleReset"));
  $("cancel").textContent = t(LANG, "ex_cancel");
  $("cancel").onclick = async () => { await msg({ type: "EXIT_CANCEL" }); closeSoon(0); };

  const p = st.pending;
  if (!p || p.kind !== kind) {
    // nothing waiting: this page only continues a wait started in the popup
    $("title").textContent = t(LANG, "ex_noWait");
    document.querySelector(".bar").style.display = "none";
    $("cancel").textContent = t(LANG, "ex_close");
    $("cancel").onclick = () => closeSoon(0);
    return;
  }

  // flavour lines in a shuffled order, one every 6 s
  const order = [...Array(FLAVORS).keys()].sort(() => Math.random() - .5);
  let fi = 0;
  const nextFlavor = () => {
    const el = $("flavor");
    el.style.opacity = 0;
    setTimeout(() => { el.textContent = t(LANG, "ex_f" + (order[fi++ % FLAVORS] + 1)); el.style.opacity = 1; }, fi ? 450 : 0);
  };
  nextFlavor();
  const fTimer = setInterval(nextFlavor, 6000);

  const total = p.wait * 1000, start = p.readyAt - total;
  const tick = () => {
    const now = Date.now();
    const frac = Math.min(1, Math.max(0, (now - start) / total));
    $("fill").style.width = (frac * 100).toFixed(1) + "%";
    $("pct").textContent = Math.floor(frac * 100) + " %";
    const left = Math.max(0, Math.ceil((p.readyAt - now) / 1000));
    $("left").textContent = t(LANG, "ex_left", { s: left });
    if (frac >= 1) {
      clearInterval(timer);
      $("left").textContent = t(LANG, "ex_ready");
      const go = $("go");
      go.textContent = t(LANG, kind === "pause" ? "ex_nowPause" : (halve ? "ex_nowHalve" : "ex_nowReset"));
      go.style.display = "";
      go.onclick = async () => {
        go.disabled = true;
        const r = await msg({ type: "EXIT_COMMIT", kind });
        clearInterval(fTimer);
        $("flavor").textContent = r.done ? t(LANG, "ex_doneMsg") : t(LANG, "ex_failed");
        $("cancel").style.display = "none"; go.style.display = "none";
        if (r.done) closeSoon(1500);
      };
    }
  };
  const timer = setInterval(tick, 250);
  tick();
})();
