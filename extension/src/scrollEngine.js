// scrollEngine.js — turns raw scroll samples into a smoothed 0–100 intensity
// score per tab. Own implementation: real px/s velocity, exponential
// smoothing so a single flick can't jump straight to "intense", and time
// decay while the user is idle.

const RESPONSE_TAU_MS = 1400;   // how fast the score chases the target
const IDLE_DECAY_TAU_MS = 3500; // how fast it falls back when idle
const DEFAULT_SAMPLE_MS = 500;

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// Piecewise map: physical scroll rate (px/s) -> 0..100 target.
function targetForVelocity(px) {
  const v = Math.max(0, px || 0);
  if (v <= 150)  return (v / 150) * 10;
  if (v <= 450)  return 10 + ((v - 150) / 300) * 20;
  if (v <= 900)  return 30 + ((v - 450) / 450) * 25;
  if (v <= 1600) return 55 + ((v - 900) / 700) * 20;
  if (v <= 3000) return 75 + ((v - 1600) / 1400) * 17;
  return Math.min(100, 92 + ((v - 3000) / 3000) * 8);
}

export class ScrollEngine {
  constructor() { this.tabs = new Map(); }

  _state(tabId) {
    let s = this.tabs.get(tabId);
    if (!s) { s = { score: 0, last: 0, velocity: 0 }; this.tabs.set(tabId, s); }
    return s;
  }

  // sample: { pixels, durationMs, timestamp }
  update(tabId, { pixels = 0, durationMs, timestamp = Date.now() } = {}) {
    const s = this._state(tabId);
    const gap = s.last > 0 ? Math.max(0, timestamp - s.last) : DEFAULT_SAMPLE_MS;
    let dur = Number(durationMs);
    if (!Number.isFinite(dur) || dur <= 0) dur = gap || DEFAULT_SAMPLE_MS;
    dur = clamp(dur, 100, 2000);

    const velocity = Math.max(0, pixels) * 1000 / dur;
    const target = targetForVelocity(velocity);

    // decay for the idle portion of the gap not covered by this sample
    const idleMs = Math.max(0, gap - dur);
    const decayed = s.score * Math.exp(-idleMs / IDLE_DECAY_TAU_MS);

    const alpha = 1 - Math.exp(-dur / RESPONSE_TAU_MS);
    s.score = clamp(decayed + alpha * (target - decayed), 0, 100);
    s.velocity = velocity;
    s.last = timestamp;
    return s.score;
  }

  // decay-only read (call when no new sample arrived)
  peek(tabId, now = Date.now()) {
    const s = this.tabs.get(tabId);
    if (!s) return 0;
    const idleMs = Math.max(0, now - s.last);
    return clamp(s.score * Math.exp(-idleMs / IDLE_DECAY_TAU_MS), 0, 100);
  }

  band(score) {
    if (score < 35) return "steady";
    if (score < 70) return "elevated";
    return "intense";
  }

  reset(tabId) { this.tabs.delete(tabId); }
}
