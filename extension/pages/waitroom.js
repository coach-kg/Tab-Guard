import { t } from "../assets/i18n.js";

// The waiting room: a short, timed wait with one question before a site on
// the waiting-room list opens. The background times the wait; this page only
// shows it and asks to be let through when it is over.
const params = new URLSearchParams(location.search);
const host = params.get("host") || "";
// only http(s) on the listed site itself, so this page can't send you elsewhere
function destination() {
  try {
    const u = new URL(params.get("url") || "");
    const h = u.hostname.replace(/^www\./, ""), want = host.replace(/^www\./, "");
    if (/^https?:$/.test(u.protocol) && (h === want || h.endsWith("." + want))) return u.href;
  } catch (_) {}
  return host ? `https://${host}/` : null;
}
const target = destination();
const $ = (id) => document.getElementById(id);

function send(msg) { return new Promise(r => chrome.runtime.sendMessage(msg, (x) => { void chrome.runtime.lastError; r(x); })); }

async function boot() {
  const info = (await send({ type: "WAITROOM_INFO" })) || { seconds: 20, openMinutes: 15, leftMs: 20000 };
  const L = info.lang || "auto";
  const site = host.replace(/^www\./, "");
  document.title = t(L, "wr_tab", { host: site });
  const title = $("title");
  title.textContent = t(L, "wr_title", { host: "\u0000" });
  // the host in bold, inside the translated sentence
  const [a, b] = title.textContent.split("\u0000");
  const strong = document.createElement("b"); strong.textContent = site;
  title.replaceChildren(document.createTextNode(a || ""), strong, document.createTextNode(b || ""));
  $("sub").textContent = t(L, "wr_sub");
  $("q").textContent = t(L, "wr_q");
  $("why").placeholder = t(L, "wr_ph");
  $("back").textContent = t(L, "wr_back");
  $("note").textContent = t(L, "wr_note", { host: site, m: info.openMinutes });

  const end = Date.now() + (info.leftMs ?? info.seconds * 1000);
  const open = $("open");
  let phase = 0;
  const cues = [t(L, "wr_in"), t(L, "wr_out")];
  const tick = () => {
    const left = Math.max(0, Math.ceil((end - Date.now()) / 1000));
    $("count").textContent = left > 0 ? String(left) : "✓";
    open.textContent = left > 0 ? t(L, "wr_openIn", { s: left }) : t(L, "wr_open");
    open.disabled = left > 0;
    return left;
  };
  const cue = () => { $("cue").textContent = cues[phase % 2]; phase++; };
  cue(); setInterval(cue, 4000);
  tick();
  const iv = setInterval(() => { if (tick() <= 0) clearInterval(iv); }, 250);

  open.addEventListener("click", async () => {
    if (open.disabled || !target) return;
    open.disabled = true;
    const r = await send({ type: "WAITROOM_PASS", url: target, why: $("why").value.slice(0, 140) });
    if (!r || !r.ok) { open.disabled = false; tick(); }
  });
  $("why").addEventListener("keydown", (e) => { if (e.key === "Enter" && !open.disabled) open.click(); });
  // "not now": the tab closes (going back would only land here again)
  $("back").addEventListener("click", () => send({ type: "WAITROOM_LEAVE" }));
  $("why").focus();
}
boot();
