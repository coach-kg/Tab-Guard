// pressureEngine.js — a single browser-wide "compulsion pressure" value.
// It rises on triggering behaviour (media dwell, intense scroll, tab bursts,
// repeated access to watched sites) and decays over time. The current value
// maps to an escalation stage that governs visual friction on ALL watched
// pages: none -> grey -> blur -> block. Do the pattern more often in a short
// window and you climb the ladder; leave it alone and it cools off.

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

export class PressureEngine {
  constructor(cfg) {
    this.value = 0;
    this.last = Date.now();
    this.apply(cfg);
  }

  apply(cfg) {
    const e = (cfg && cfg.escalation) || {};
    this.tauMs = (e.decayMinutes || 25) * 60000;
    this.stages = e.stages || { grey: 20, blur: 50, block: 80 };
    this.maxBlurPx = e.maxBlurPx || 12;
    this.baseRevealMs = (e.baseRevealSeconds || 2) * 1000;
    this.maxRevealMs = (e.maxRevealSeconds || 12) * 1000;
    this.add = { dwell: 8, scroll: 15, tabPause: 12, tabLock: 25, revisit: 4, churn: 6, ...(e.add || {}) };
  }

  _decayTo(now) {
    const dt = Math.max(0, now - this.last);
    this.value = clamp(this.value * Math.exp(-dt / this.tauMs), 0, 100);
    this.last = now;
  }

  bump(kind, now = Date.now()) {
    this._decayTo(now);
    this.value = clamp(this.value + (this.add[kind] || 0), 0, 100);
    return this.value;
  }

  get(now = Date.now()) { this._decayTo(now); return this.value; }

  reset(now = Date.now()) { this.value = 0; this.last = now; }
  halve(now = Date.now()) { this._decayTo(now); this.value = this.value / 2; this.last = now; }

  stage(now = Date.now()) {
    const v = this.get(now);
    if (v >= this.stages.block) return "block";
    if (v >= this.stages.blur) return "blur";
    if (v >= this.stages.grey) return "grey";
    return "none";
  }

  // 0..maxBlurPx, growing from the blur threshold up to block threshold
  blurPx(now = Date.now()) {
    const v = this.get(now);
    if (v < this.stages.blur) return 0;
    const span = Math.max(1, this.stages.block - this.stages.blur);
    return Math.round(clamp((v - this.stages.blur) / span, 0, 1) * this.maxBlurPx);
  }

  // reveal delay grows with pressure across the whole active range
  revealMs(now = Date.now()) {
    const v = this.get(now);
    const span = Math.max(1, this.stages.block - this.stages.grey);
    const t = clamp((v - this.stages.grey) / span, 0, 1);
    return Math.round(this.baseRevealMs + t * (this.maxRevealMs - this.baseRevealMs));
  }

  snapshot() { return { value: this.value, last: this.last }; }
  restore(s) {
    if (!s) return;
    this.value = clamp(Number(s.value) || 0, 0, 100);
    this.last = Number(s.last) || Date.now();
  }
}
