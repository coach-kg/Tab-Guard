// sessionEngine.js — tracks "active" minutes per tab and per day.
// Active = the tab is focused/visible AND has produced engagement
// (scroll/keys) recently. Idle time doesn't count, so 20 min of reading
// isn't punished the way 20 min of thumb-scrolling is.

const ACTIVE_GRACE_MS = 20000; // engagement counts as active for 20s after last event

export class SessionEngine {
  constructor() {
    this.tabs = new Map(); // tabId -> { activeMs, lastTick, lastEngage, focused }
    this.daily = { key: null, activeMs: 0 };
  }

  _state(tabId) {
    let s = this.tabs.get(tabId);
    if (!s) { s = { activeMs: 0, lastTick: 0, lastEngage: 0, focused: false }; this.tabs.set(tabId, s); }
    return s;
  }

  _dayKey(now) {
    const d = new Date(now);
    return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
  }

  setFocused(tabId, focused, now = Date.now()) {
    const s = this._state(tabId);
    this._accrue(tabId, now);
    s.focused = !!focused;
    s.lastTick = now;
  }

  engaged(tabId, now = Date.now()) {
    const s = this._state(tabId);
    this._accrue(tabId, now);
    s.lastEngage = now;
    if (!s.lastTick) s.lastTick = now;
  }

  // fold elapsed wall-time into activeMs if the tab was active over that span
  _accrue(tabId, now) {
    const s = this._state(tabId);
    if (!s.lastTick) { s.lastTick = now; return; }
    const elapsed = now - s.lastTick;
    s.lastTick = now;
    if (elapsed <= 0) return;
    const wasActive = s.focused && (now - s.lastEngage) < ACTIVE_GRACE_MS + elapsed;
    if (wasActive) {
      s.activeMs += elapsed;
      const k = this._dayKey(now);
      if (this.daily.key !== k) this.daily = { key: k, activeMs: 0 };
      this.daily.activeMs += elapsed;
    }
  }

  sessionMinutes(tabId, now = Date.now()) {
    this._accrue(tabId, now);
    return (this._state(tabId).activeMs) / 60000;
  }

  dailyMinutes(now = Date.now()) {
    const k = this._dayKey(now);
    if (this.daily.key !== k) this.daily = { key: k, activeMs: 0 };
    return this.daily.activeMs / 60000;
  }

  reset(tabId) { this.tabs.delete(tabId); }
}
