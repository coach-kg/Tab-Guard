// tabBreaker.js — the tab-spawning circuit breaker. Groups tab creations by
// domain, keeps sliding-window counts, and reports which threshold (if any)
// a new tab crossed. Also owns per-domain locks and the "ignored
// interventions" escalation counter.

export class TabBreaker {
  constructor() {
    this.events = new Map();   // host -> [timestamps]
    this.locks = new Map();    // host -> lockUntil (ms)
    this.ignored = new Map();  // host -> count of ignored interventions
  }

  _prune(host, now, maxWindowMs) {
    const arr = this.events.get(host) || [];
    const kept = arr.filter(t => now - t <= maxWindowMs);
    this.events.set(host, kept);
    return kept;
  }

  // Record a tab opening on host. cfg has window1/window2 defs + lockMinutes.
  // Returns { action: "none"|"pause"|"lock", count1, count2 }.
  record(host, cfg, now = Date.now()) {
    if (!host) return { action: "none" };
    const w1 = cfg.window1, w2 = cfg.window2;
    const maxWindow = Math.max(w1.seconds, w2.seconds) * 1000;
    const arr = this._prune(host, now, maxWindow);
    arr.push(now);
    this.events.set(host, arr);

    const count1 = arr.filter(t => now - t <= w1.seconds * 1000).length;
    const count2 = arr.filter(t => now - t <= w2.seconds * 1000).length;

    if (count2 >= w2.count) {
      this.lock(host, cfg.lockMinutes, now);
      return { action: "lock", count1, count2 };
    }
    if (count1 >= w1.count) return { action: "pause", count1, count2 };
    return { action: "none", count1, count2 };
  }

  lock(host, minutes, now = Date.now()) {
    if (!host) return;
    this.locks.set(host, now + Math.max(1, minutes) * 60000);
  }

  isLocked(host, now = Date.now()) {
    const until = this.locks.get(host) || 0;
    if (until <= now) { if (until) this.locks.delete(host); return false; }
    return true;
  }

  lockRemainingMs(host, now = Date.now()) {
    return Math.max(0, (this.locks.get(host) || 0) - now);
  }

  unlock(host) { this.locks.delete(host); }

  // escalation: two ignored interventions on a host -> new tabs get cooldown
  noteIgnored(host) {
    const n = (this.ignored.get(host) || 0) + 1;
    this.ignored.set(host, n);
    return n;
  }
  ignoredCount(host) { return this.ignored.get(host) || 0; }
  clearIgnored(host) { this.ignored.delete(host); }

  // serialize locks + ignored so they survive the service worker sleeping
  snapshot() {
    return {
      locks: Object.fromEntries(this.locks),
      ignored: Object.fromEntries(this.ignored),
    };
  }
  restore(snap, now = Date.now()) {
    if (!snap) return;
    for (const [h, until] of Object.entries(snap.locks || {})) {
      if (Number(until) > now) this.locks.set(h, Number(until));
    }
    for (const [h, n] of Object.entries(snap.ignored || {})) {
      this.ignored.set(h, Number(n) || 0);
    }
  }
}
