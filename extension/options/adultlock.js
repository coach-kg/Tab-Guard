import { t } from "../assets/i18n.js";
import { hashCode, randomCode, ADULT_BREAK_KEY, ADULT_WAIT_HOURS } from "../src/adultLock.js";

// The content filter's lock, in the settings: set it up with a few tiles,
// then ask for a break (never a plain "off"), wait, unlock, say what for.
const KEY = "tabguardConfig";
const $ = (id) => document.getElementById(id);
const send = (m) => new Promise(r => chrome.runtime.sendMessage(m, x => { void chrome.runtime.lastError; r(x || {}); }));
let LANG = "auto";
let setup = { method: "passphrase", length: 80, days: 30, date: "" };
let shownCode = "";          // a trusted person's code, shown once right after setting up

function el(tag, attrs = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") e.className = v; else if (k === "text") e.textContent = v;
    else if (k.startsWith("on")) e.addEventListener(k.slice(2), v); else e.setAttribute(k, v);
  }
  for (const k of kids) if (k != null) e.append(k);
  return e;
}
const fmt = (ms, withDay) => new Date(ms).toLocaleString(LANG === "auto" ? undefined : LANG,
  withDay ? { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" } : { hour: "2-digit", minute: "2-digit" });
const fmtDate = (ms) => new Date(ms).toLocaleDateString(LANG === "auto" ? undefined : LANG, { day: "numeric", month: "long", year: "numeric" });

function tile(icon, title, sub, on, onclick) {
  return el("button", { type: "button", class: "al-tile" + (on ? " on" : ""), "aria-pressed": String(!!on), onclick },
    el("span", { class: "al-ic", text: icon }), el("span", { class: "al-tt", text: title }), sub ? el("span", { class: "al-st", text: sub }) : null);
}
function chips(values, cur, label, onpick) {
  return el("div", { class: "al-chips" }, ...values.map(v => el("button", { type: "button", class: "al-chip" + (v === cur ? " on" : ""), "aria-pressed": String(v === cur), text: label(v), onclick: () => onpick(v) })));
}

async function render(force) {
  const box = $("alBox"); if (!box) return;
  // don't wipe what is being typed (a passphrase, the answer to "what for?")
  if (!force && box.contains(document.activeElement) && /^(INPUT|TEXTAREA)$/.test(document.activeElement.tagName)) return;
  const cfg = (await chrome.storage.local.get(KEY))[KEY] || {};
  LANG = cfg.language || "auto";
  const st = await send({ type: "ADULT_LOCK_STATUS" });
  const lock = st.lock && st.lock.enabled ? st.lock : null;
  const req = st.request || null;
  const now = Date.now();
  const adult = $("adult");
  if (adult) {
    const running = req && req.until && req.until > now;
    if (lock) { adult.checked = !running; adult.disabled = true; adult.closest(".field")?.classList.add("al-locked"); }
    else { adult.disabled = false; adult.closest(".field")?.classList.remove("al-locked"); }
    adult.dispatchEvent(new Event("tg-state"));
  }
  const head = el("div", { class: "al-head" }, el("span", { class: "al-big", text: "🔐" }),
    el("div", {}, el("div", { class: "al-h", text: t(LANG, "al_title") }), el("div", { class: "al-sub", text: t(LANG, lock ? "al_onSub" : "al_offSub") })));
  const parts = [head];

  if (!lock) {
    // ---- set it up -------------------------------------------------------
    if (box.dataset.open !== "1") {
      parts.push(el("button", { type: "button", class: "mini-btn al-go", text: "🔐 " + t(LANG, "al_setup"), onclick: () => { box.dataset.open = "1"; render(); } }));
    } else {
      parts.push(el("p", { class: "al-q", text: t(LANG, "al_how") }));
      parts.push(el("div", { class: "al-tiles" },
        tile("🔤", t(LANG, "al_mPass"), t(LANG, "al_mPassSub"), setup.method === "passphrase", () => { setup.method = "passphrase"; render(); }),
        tile("🤝", t(LANG, "al_mBuddy"), t(LANG, "al_mBuddySub"), setup.method === "buddy", () => { setup.method = "buddy"; render(); }),
        tile("📅", t(LANG, "al_mDate"), t(LANG, "al_mDateSub"), setup.method === "date", () => { setup.method = "date"; render(); }),
        tile("⏳", t(LANG, "al_mDays"), t(LANG, "al_mDaysSub"), setup.method === "days", () => { setup.method = "days"; render(); })));
      if (setup.method === "passphrase") {
        parts.push(el("p", { class: "al-q", text: t(LANG, "al_len") }));
        parts.push(chips([40, 80, 120, 200], setup.length, v => t(LANG, "al_chars", { n: v }), v => { setup.length = v; render(); }));
      } else if (setup.method === "days") {
        parts.push(el("p", { class: "al-q", text: t(LANG, "al_daysQ") }));
        parts.push(chips([7, 30, 90, 365], setup.days, v => t(LANG, "al_daysN", { n: v }), v => { setup.days = v; render(); }));
      } else if (setup.method === "date") {
        const min = new Date(now + 86400000).toISOString().slice(0, 10);
        const inp = el("input", { type: "date", id: "alDate", min, value: setup.date || min });
        inp.addEventListener("change", () => { setup.date = inp.value; });
        parts.push(el("p", { class: "al-q", text: t(LANG, "al_dateQ") }), inp);
      }
      parts.push(el("p", { class: "al-note", text: "⏳ " + t(LANG, setup.method === "date" || setup.method === "days" ? "al_noteUntil" : "al_noteWait", { h: ADULT_WAIT_HOURS }) }));
      if (setup.method === "buddy") parts.push(el("p", { class: "al-note al-warn", text: "⚠️ " + t(LANG, "al_lostNote") }));
      parts.push(el("div", { class: "al-row" },
        el("button", { type: "button", class: "al-primary", text: "🔐 " + t(LANG, "al_activate"), onclick: activate }),
        el("button", { type: "button", class: "mini-btn", text: t(LANG, "pg_cancel"), onclick: () => { box.dataset.open = ""; render(); } })));
    }
  } else if (shownCode) {
    // ---- the trusted person's code, once -----------------------------------
    parts.push(el("p", { class: "al-q", text: "🤝 " + t(LANG, "al_giveCode") }));
    parts.push(el("div", { class: "reveal-code mono al-code", text: shownCode }));
    parts.push(el("p", { class: "al-note al-warn", text: "⚠️ " + t(LANG, "al_lostNote") }));
    parts.push(el("button", { type: "button", class: "al-primary", text: "✓ " + t(LANG, "al_gaveCode"), onclick: () => { shownCode = ""; render(); } }));
  } else {
    // ---- locked: status, break requests -----------------------------------
    const how = lock.method === "passphrase" ? "🔤 " + t(LANG, "al_byPass", { n: lock.length })
      : lock.method === "buddy" ? "🤝 " + t(LANG, "al_byBuddy")
      : "📅 " + t(LANG, "al_byDate", { d: fmtDate(lock.until) });
    parts.push(el("div", { class: "al-status", text: how }));
    if (req && req.until && req.until > now) {
      parts.push(el("div", { class: "al-state run" }, el("span", { class: "al-ic", text: "🌙" }), el("span", { text: t(LANG, "al_running", { t: fmt(req.until) }) })));
      parts.push(el("button", { type: "button", class: "mini-btn", text: t(LANG, "al_endNow"), onclick: async () => { await send({ type: "ADULT_BREAK_CANCEL" }); render(); } }));
    } else if (req && req.readyAt > now) {
      parts.push(el("div", { class: "al-state" }, el("span", { class: "al-ic", text: "⏳" }),
        el("span", { text: t(LANG, req.kind === "remove" ? "al_removeFrom" : "al_breakFrom", { m: req.minutes, t: fmt(req.readyAt, true) }) })));
      parts.push(el("button", { type: "button", class: "mini-btn", text: t(LANG, "al_withdraw"), onclick: async () => { await send({ type: "ADULT_BREAK_CANCEL" }); render(); } }));
    } else if (req) {
      // ready: unlock + "what for?" + are you sure
      const text = lock.method === "passphrase" ? (await send({ type: "ADULT_LOCK_CODE" })).text : "";
      parts.push(el("div", { class: "al-state ready" }, el("span", { class: "al-ic", text: "🔓" }), el("span", { text: t(LANG, req.kind === "remove" ? "al_readyRemove" : "al_ready", { m: req.minutes }) })));
      let codeIn = null;
      if (lock.method === "passphrase") {
        parts.push(el("p", { class: "al-q", text: t(LANG, "al_typePass") }), el("div", { class: "reveal-code mono al-code", text: text }));
        codeIn = el("input", { type: "text", class: "al-in mono", autocomplete: "off", spellcheck: "false" });
        codeIn.addEventListener("paste", e => e.preventDefault()); codeIn.addEventListener("drop", e => e.preventDefault());
        parts.push(codeIn);
      } else if (lock.method === "buddy") {
        parts.push(el("p", { class: "al-q", text: "🤝 " + t(LANG, "al_askBuddy") }));
        codeIn = el("input", { type: "text", class: "al-in mono", autocomplete: "off", spellcheck: "false" });
        parts.push(codeIn);
      }
      const why = el("textarea", { class: "al-why", rows: "2", placeholder: t(LANG, "al_whyPh") });
      parts.push(el("p", { class: "al-q", text: t(LANG, "al_why") }), why);
      const err = el("p", { class: "al-err" });
      parts.push(err, el("div", { class: "al-row" },
        el("button", { type: "button", class: "al-primary", text: t(LANG, req.kind === "remove" ? "al_sureRemove" : "al_sure"), onclick: async () => {
          const r = await send({ type: "ADULT_BREAK_START", code: codeIn ? codeIn.value : "", why: why.value });
          if (!r.ok) { err.textContent = t(LANG, r.error === "code" ? "al_errCode" : r.error === "why" ? "al_errWhy" : "al_errWait"); return; }
          render();
        } }),
        el("button", { type: "button", class: "mini-btn", text: t(LANG, "al_notNow"), onclick: async () => { await send({ type: "ADULT_BREAK_CANCEL" }); render(); } })));
    } else if (lock.method !== "passphrase" && lock.method !== "buddy" && now < (+lock.until || 0)) {
      parts.push(el("div", { class: "al-state" }, el("span", { class: "al-ic", text: "📅" }), el("span", { text: t(LANG, "al_untilNote", { d: fmtDate(lock.until) }) })));
    } else {
      let mins = +(box.dataset.mins || 60);
      parts.push(el("p", { class: "al-q", text: "🌙 " + t(LANG, "al_breakQ") }));
      parts.push(chips([30, 60, 120], mins, v => v < 60 ? t(LANG, "al_min", { n: v }) : t(LANG, "al_h", { n: v / 60 }), v => { box.dataset.mins = String(v); render(); }));
      const wait = lock.method === "passphrase" || lock.method === "buddy" ? ADULT_WAIT_HOURS : 0;
      parts.push(el("p", { class: "al-note", text: wait ? "⏳ " + t(LANG, "al_waitNote", { h: wait }) : "" }));
      parts.push(el("div", { class: "al-row" },
        el("button", { type: "button", class: "al-primary", text: "🌙 " + t(LANG, "al_request"), onclick: async () => { await send({ type: "ADULT_BREAK_REQUEST", kind: "break", minutes: mins }); render(); } }),
        el("button", { type: "button", class: "al-link", text: t(LANG, "al_removeLock"), onclick: async () => { await send({ type: "ADULT_BREAK_REQUEST", kind: "remove", minutes: 60 }); render(); } })));
    }
  }
  box.replaceChildren(...parts);
}

async function activate() {
  const cfg = (await chrome.storage.local.get(KEY))[KEY] || {};
  const salt = randomCode(16);
  const lock = { enabled: true, method: setup.method === "days" ? "until" : setup.method === "date" ? "until" : setup.method, salt, waitHours: ADULT_WAIT_HOURS, createdAt: Date.now() };
  if (setup.method === "passphrase") {
    lock.text = randomCode(setup.length); lock.length = setup.length; lock.hash = await hashCode(salt, lock.text);
  } else if (setup.method === "buddy") {
    const code = randomCode(12); lock.hash = await hashCode(salt, code); shownCode = code;
  } else if (setup.method === "days") {
    lock.until = Date.now() + setup.days * 86400000;
  } else {
    const d = ($("alDate") && $("alDate").value) || setup.date; const ms = d ? new Date(d + "T00:00").getTime() : 0;
    if (!ms || ms <= Date.now()) return;
    lock.until = ms;
  }
  // what is on now stays on while the lock holds
  const ab = { ...(cfg.adultBlock || {}), enabled: true };
  lock.keep = ["detect", "searchPause", "greyLinks", "safeSearch", "bypass"].filter(k => ab[k] !== false);
  await chrome.storage.local.set({ [KEY]: { ...cfg, adultBlock: ab, adultLock: lock } });
  $("alBox").dataset.open = "";
  render();
}

chrome.storage.onChanged.addListener((ch, area) => { if (area === "local" && (ch[ADULT_BREAK_KEY] || ch[KEY])) render(); });
setInterval(() => render(), 30000);
render(true);
