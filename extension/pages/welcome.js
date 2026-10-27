import { t, apply } from "../assets/i18n.js";
import { holdLoosening } from "../src/loosen.js";

// First-run introduction, four steps. Opened once after installing, and again
// from the settings. The first time, the choices apply at once; later, they
// go through the same one-hour rule as the settings page.
const KEY = "tabguardConfig";
const $ = (id) => document.getElementById(id);
const norm = (s) => String(s || "").trim().toLowerCase().replace(/^[a-z]+:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "");
const STREAM_SUGGEST = ["netflix.com", "disneyplus.com", "primevideo.com", "arte.tv", "mediathek.ard.de", "zdf.de", "mubi.com", "criterionchannel.com", "spotify.com"];
const WAIT_SUGGEST = ["youtube.com", "instagram.com", "tiktok.com", "reddit.com", "x.com", "facebook.com", "twitch.tv", "9gag.com"];

let LANG = "auto", step = 0, stored = {};
const sel = { trusted: new Set(), streaming: new Set(), wait: new Set() };
const shown = { trusted: [], streaming: [], wait: [] };

function chips(id) {
  const box = $(id); box.replaceChildren();
  for (const h of shown[id]) {
    const b = document.createElement("button"); b.type = "button"; b.className = "chip"; b.textContent = h;
    b.setAttribute("aria-pressed", String(sel[id].has(h)));
    b.addEventListener("click", () => { sel[id].has(h) ? sel[id].delete(h) : sel[id].add(h); b.setAttribute("aria-pressed", String(sel[id].has(h))); });
    box.appendChild(b);
  }
}
function addFrom(inputId, id) {
  const v = norm($(inputId).value); if (!v || !v.includes(".")) return;
  if (!shown[id].includes(v)) shown[id].push(v);
  sel[id].add(v); $(inputId).value = ""; chips(id);
}

function go(n) {
  step = Math.max(0, Math.min(3, n));
  document.querySelectorAll(".step").forEach(s => s.classList.toggle("on", +s.dataset.step === step));
  document.querySelectorAll("#dots i").forEach((d, i) => d.classList.toggle("on", i <= step));
  $("back").hidden = step === 0;
  $("next").textContent = t(LANG, step === 3 ? "w_done" : step === 0 ? "w_start" : "w_next");
  window.scrollTo({ top: 0 });
}

async function finish() {
  const prev = (await chrome.storage.local.get(KEY))[KEY] || {};
  const wr = { enabled: true, seconds: 20, openMinutes: 15, ...(prev.waitRoom || {}) };
  let next = {
    ...prev,
    allowlist: [...sel.trusted],
    streamingHosts: [...sel.streaming],
    adultBlock: { ...(prev.adultBlock || {}), enabled: $("adult").checked },
    waitRoom: { ...wr, hosts: [...sel.wait], seconds: +$("waitSec").value || 20 },
    onboarded: true,
  };
  // after the first time, loosening (trusting more, switching the filter off …) waits an hour
  if (prev.onboarded) next = holdLoosening(prev, next);
  await chrome.storage.local.set({ [KEY]: next });
  location.href = "../options/options.html";
}

async function boot() {
  stored = (await chrome.storage.local.get(KEY))[KEY] || {};
  LANG = stored.language || "auto";
  apply(document, LANG);
  const allow = stored.allowlist || ["mail.google.com", "calendar.google.com", "docs.google.com", "drive.google.com", "github.com", "gitlab.com", "stackoverflow.com", "claude.ai", "chatgpt.com", "notion.so", "linear.app", "figma.com", "wikipedia.org", "localhost"];
  const stream = stored.streamingHosts || ["netflix.com", "disneyplus.com", "primevideo.com", "arte.tv", "mediathek.ard.de", "zdf.de", "mubi.com", "criterionchannel.com"];
  const wait = (stored.waitRoom && stored.waitRoom.hosts) || [];
  shown.trusted = [...allow]; allow.forEach(h => sel.trusted.add(h));
  shown.streaming = [...new Set([...stream, ...STREAM_SUGGEST])]; stream.forEach(h => sel.streaming.add(h));
  shown.wait = [...new Set([...wait, ...WAIT_SUGGEST])]; wait.forEach(h => sel.wait.add(h));
  $("adult").checked = !!(stored.adultBlock && stored.adultBlock.enabled);
  if (stored.waitRoom && stored.waitRoom.seconds) $("waitSec").value = String(stored.waitRoom.seconds);
  if (stored.onboarded) $("laterNote").style.display = "";
  chips("trusted"); chips("streaming"); chips("wait");
  $("trustedBtn").addEventListener("click", () => addFrom("trustedAdd", "trusted"));
  $("waitBtn").addEventListener("click", () => addFrom("waitAdd", "wait"));
  $("trustedAdd").addEventListener("keydown", e => { if (e.key === "Enter") addFrom("trustedAdd", "trusted"); });
  $("waitAdd").addEventListener("keydown", e => { if (e.key === "Enter") addFrom("waitAdd", "wait"); });
  $("back").addEventListener("click", () => go(step - 1));
  $("next").addEventListener("click", () => (step === 3 ? finish() : go(step + 1)));
  $("lockLink").addEventListener("click", async (e) => { e.preventDefault(); await finish(); location.href = "../options/options.html#s_o_h_lock"; });
  go(0);
}
boot();
