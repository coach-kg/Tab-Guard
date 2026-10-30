// adultLock.js — the content filter's own lock.
//
// With the lock on, the content filter can't be switched off. There is only a
// timed break ("Auszeit"), and only after a long wait (21 h by default) plus
// the unlock: a long passphrase to type, a code a trusted person keeps, or
// simply a date before which nothing is possible. When the break is over, the
// filter is back on by itself.
//
// Stored on the config:
//   adultLock: { enabled, method: "passphrase" | "buddy" | "until",
//                salt, hash, length, until, waitHours, keep: [...], createdAt }
// The break request lives in its own key (ADULT_BREAK_KEY):
//   { kind: "break" | "remove", minutes, requestedAt, readyAt, until? }

export const ADULT_BREAK_KEY = "tabguardAdultBreak";
export const ADULT_WAIT_HOURS = 21;

export function lockActive(c, now = Date.now()) {
  const l = c && c.adultLock;
  if (!l || !l.enabled) return false;
  return true;
}
// the date method: before that date nothing can be requested at all
export function lockedUntil(c) {
  const l = c && c.adultLock;
  return l && l.enabled && l.method === "until" ? +l.until || 0 : 0;
}
export function breakRunning(b, now = Date.now()) { return !!(b && b.until && b.until > now); }

// The config the extension works with: while the lock is on, the content
// filter (and every part that was on when the lock was set) stays on, except
// during a running break.
export function enforceAdultLock(c, b, now = Date.now()) {
  if (!lockActive(c, now)) return c;
  const ab = { ...(c.adultBlock || {}) };
  if (breakRunning(b, now)) { ab.enabled = false; return { ...c, adultBlock: ab }; }
  ab.enabled = true;
  for (const k of (c.adultLock.keep || [])) ab[k] = true;
  return { ...c, adultBlock: ab };
}

export async function hashCode(salt, code) {
  const data = new TextEncoder().encode(String(salt) + ":" + String(code));
  const buf = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(buf)].map(x => x.toString(16).padStart(2, "0")).join("");
}
// readable random text: no 0/O, 1/l/I
const ALPHA = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export function randomCode(n) {
  const r = crypto.getRandomValues(new Uint32Array(n));
  return [...r].map(x => ALPHA[x % ALPHA.length]).join("");
}
