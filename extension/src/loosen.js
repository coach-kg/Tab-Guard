// loosen.js — loosening protection waits an hour; tightening applies at once.
//
// Used by the settings page (when saving, and when importing a settings file)
// and by the background (which applies a change once its hour is over).
// What counts as loosening:
//   • switching off the content filter or any of its parts
//   • removing entries from the blocklist, the learned adult list, own terms
//   • the emergency exits: more budget, shorter waits, an earlier day start,
//     a gentler reset, switching them off
// Stored on the config as
//   loosenPending: { fields: { "adultBlock.safeSearch": { v, at } },
//                    remove: { "blocklist": { "x.com": at } } }
// A change that was already waiting keeps its time, so saving again does not
// restart the hour; undoing it (switching back on, re-adding) drops it.

export const LOOSEN_DELAY = 60 * 60000;

const off = (a, b) => a !== false && b === false;
const budgetN = (b) => (+b === 0 ? Infinity : +b);
const toMin = (s) => { const m = /^(\d{1,2}):(\d{2})$/.exec(String(s || "")); return m ? +m[1] * 60 + +m[2] : 300; };

// [path, default, isLooser(current, wanted)]
export const FIELDS = [
  ["adultBlock.enabled", false, off],
  ["adultBlock.detect", true, off],
  ["adultBlock.searchPause", true, off],
  ["adultBlock.greyLinks", true, off],
  ["adultBlock.safeSearch", true, off],
  ["adultBlock.bypass", true, off],
  ["exits.enabled", true, off],
  ["exits.budget", 5, (a, b) => budgetN(b) > budgetN(a)],
  ["exits.startSeconds", 5, (a, b) => +b < +a],
  ["exits.maxSeconds", 120, (a, b) => +b < +a],
  ["exits.resetMode", "halve", (a, b) => a !== "full" && b === "full"],
  ["exits.notOnGrey", true, off],
  ["lateNight.end", "05:00", (a, b) => toMin(b) < toMin(a)],   // your day start: earlier = a fresh day sooner
];
export const LISTS = ["blocklist", "adultBlock.extraHosts", "adultBlock.terms", "adultBlock.bypassSites"];
// lists where ADDING loosens protection (sites that may never be blocked, and
// trusted / academic / streaming sites, which skip the friction)
export const ADD_LISTS = ["essentialExtra", "allowlist", "academicSearch", "streamingHosts"];

const get = (o, path) => path.split(".").reduce((x, k) => (x == null ? undefined : x[k]), o);
function set(o, path, v) {
  const ks = path.split("."), last = ks.pop();
  let x = o;
  for (const k of ks) { x[k] = (x[k] && typeof x[k] === "object") ? { ...x[k] } : {}; x = x[k]; }
  x[last] = v;
}
const empty = () => ({ fields: {}, remove: {}, add: {} });
const isEmpty = (p) => !p || (!Object.keys(p.fields || {}).length && !Object.keys(p.remove || {}).length && !Object.keys(p.add || {}).length);

// prev = the stored config, next = what the form (or a settings file) asks for.
// Returns next with every loosening held back and listed in loosenPending.
export function holdLoosening(prev, next, now = Date.now()) {
  prev = applyDue(prev || {}, now).config;
  const old = prev.loosenPending || empty();
  const P = empty();
  // copy the nested objects we may touch, so prev stays untouched
  next = { ...next };
  for (const top of ["adultBlock", "exits", "lateNight"]) if (next[top]) next[top] = { ...next[top] };

  for (const [path, dflt, looser] of FIELDS) {
    const a = get(prev, path) ?? dflt, b = get(next, path);
    if (b === undefined || !looser(a, b)) continue;
    const was = old.fields && old.fields[path];
    P.fields[path] = { v: b, at: was && was.v === b ? was.at : now + LOOSEN_DELAY };
    set(next, path, a);                                   // keep the current, stricter value for now
  }
  for (const path of LISTS) {
    const a = get(prev, path) || [], b = get(next, path);
    if (!Array.isArray(b)) continue;
    const removed = a.filter(x => !b.includes(x));
    if (!removed.length) continue;
    const was = (old.remove && old.remove[path]) || {};
    P.remove[path] = {};
    for (const x of removed) P.remove[path][x] = was[x] || now + LOOSEN_DELAY;
    set(next, path, [...b, ...removed]);                   // still listed until their hour is over
  }
  for (const path of ADD_LISTS) {
    const a = get(prev, path) || [], b = get(next, path);
    if (!Array.isArray(b)) continue;
    const added = b.filter(x => !a.includes(x));
    if (!added.length) continue;
    const was = (old.add && old.add[path]) || {};
    P.add[path] = {};
    for (const x of added) P.add[path][x] = was[x] || now + LOOSEN_DELAY;
    set(next, path, b.filter(x => a.includes(x)));            // removals apply now, additions wait
  }
  next.loosenPending = isEmpty(P) ? null : P;
  return next;
}

// What the settings form should show: the values you chose, pending or not.
export function withPendingShown(c) {
  const p = c && c.loosenPending;
  if (isEmpty(p)) return c;
  const out = { ...c };
  for (const top of ["adultBlock", "exits", "lateNight"]) if (out[top]) out[top] = { ...out[top] };
  for (const [path, w] of Object.entries(p.fields || {})) set(out, path, w.v);
  for (const [path, items] of Object.entries(p.remove || {})) {
    const list = get(out, path) || [];
    set(out, path, list.filter(x => !(x in items)));
  }
  for (const [path, items] of Object.entries(p.add || {})) {
    const list = get(out, path) || [];
    set(out, path, [...list, ...Object.keys(items).filter(x => !list.includes(x))]);
  }
  return out;
}

// Apply what is due. Returns { config, changed }.
export function applyDue(c, now = Date.now()) {
  const p = c && c.loosenPending;
  if (isEmpty(p)) return { config: c, changed: false };
  const out = { ...c };
  for (const top of ["adultBlock", "exits", "lateNight"]) if (out[top]) out[top] = { ...out[top] };
  const rest = empty();
  let changed = false;
  for (const [path, w] of Object.entries(p.fields || {})) {
    if (w.at <= now) { set(out, path, w.v); changed = true; } else rest.fields[path] = w;
  }
  for (const [path, items] of Object.entries(p.remove || {})) {
    const due = Object.keys(items).filter(x => items[x] <= now);
    if (due.length) { set(out, path, (get(out, path) || []).filter(x => !due.includes(x))); changed = true; }
    const left = Object.fromEntries(Object.entries(items).filter(([x]) => !due.includes(x)));
    if (Object.keys(left).length) rest.remove[path] = left;
  }
  for (const [path, items] of Object.entries(p.add || {})) {
    const due = Object.keys(items).filter(x => items[x] <= now);
    if (due.length) { const list = get(out, path) || []; set(out, path, [...list, ...due.filter(x => !list.includes(x))]); changed = true; }
    const left = Object.fromEntries(Object.entries(items).filter(([x]) => !due.includes(x)));
    if (Object.keys(left).length) rest.add[path] = left;
  }
  out.loosenPending = isEmpty(rest) ? null : rest;
  return { config: out, changed };
}

// The earliest time something under these paths takes effect (for the notes
// in the settings), or 0.
export function pendingAt(c, prefixes) {
  const p = c && c.loosenPending;
  if (isEmpty(p)) return 0;
  const hit = (path) => prefixes.some(x => path === x || path.startsWith(x + "."));
  const times = [];
  for (const [path, w] of Object.entries(p.fields || {})) if (hit(path)) times.push(w.at);
  for (const [path, items] of Object.entries(p.remove || {})) if (hit(path)) times.push(...Object.values(items));
  for (const [path, items] of Object.entries(p.add || {})) if (hit(path)) times.push(...Object.values(items));
  return times.length ? Math.min(...times) : 0;
}
