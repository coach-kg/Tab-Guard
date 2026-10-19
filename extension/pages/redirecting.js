import { t } from "../assets/i18n.js";

const p = new URLSearchParams(location.search);
const from = p.get("from") || "";
const to = p.get("to") || "";

(async () => {
  const cfg = (await chrome.storage.local.get("tabguardConfig")).tabguardConfig || {};
  const LANG = cfg.language || "auto";
  document.getElementById("title").textContent = t(LANG, "rd_title");
  let toHost = to; try { toHost = new URL(to).hostname.replace(/^www\./, ""); } catch (_) {}
  // the sentence with the target host in bold, built as text nodes
  const arrow = document.getElementById("arrow");
  t(LANG, "rd_arrow", { from, to: "\u0000" }).split("\u0000").forEach((part, i) => {
    if (i) { const b = document.createElement("b"); b.textContent = toHost; arrow.append(b); }
    arrow.append(part);
  });

  // fill the ring, then go
  const prog = document.getElementById("prog");
  requestAnimationFrame(() => { prog.style.transition = "stroke-dashoffset .8s ease"; prog.style.strokeDashoffset = "0"; });
  if (to) setTimeout(() => location.replace(to), 900);
})();
