// lock.js — shared passcode helpers for the options page and popup.
// Loaded via <script src>, exposes window.TGLock. The passcode is never
// stored; only a salted SHA-256 hash is kept, so it can't be read back out of
// storage. Reinstalling the extension clears everything (the honest reset).

window.TGLock = {
  KEY: "tabguardConfig",

  async _digest(str) {
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(str));
    return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");
  },

  randomHex(bytes = 16) {
    const a = new Uint8Array(bytes); crypto.getRandomValues(a);
    return [...a].map(b => b.toString(16).padStart(2, "0")).join("");
  },

  // Unambiguous alphabet (no O/0, I/l/1) so a hand-copied code is readable.
  generatePasscode(len = 12) {
    const abc = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
    const a = new Uint8Array(len); crypto.getRandomValues(a);
    let s = ""; for (const x of a) s += abc[x % abc.length];
    return s;
  },

  async hash(passcode, salt) { return this._digest(`${salt}:${passcode}`); },

  async loadConfig() { return ((await chrome.storage.local.get(this.KEY))[this.KEY]) || {}; },
  async saveConfig(cfg) { await chrome.storage.local.set({ [this.KEY]: cfg }); },
  async getLock() { return (await this.loadConfig()).lock || { enabled: false }; },

  async verify(passcode) {
    const lock = await this.getLock();
    if (!lock.enabled || !lock.hash || !lock.salt) return true;
    return (await this.hash(passcode, lock.salt)) === lock.hash;
  },

  // Block paste / drop / autofill so the passcode must be typed by hand.
  hardenInput(el) {
    const stop = (e) => { e.preventDefault(); return false; };
    el.addEventListener("paste", stop);
    el.addEventListener("drop", stop);
    el.setAttribute("autocomplete", "off");
    el.setAttribute("autocorrect", "off");
    el.setAttribute("autocapitalize", "off");
    el.setAttribute("spellcheck", "false");
  },
};
