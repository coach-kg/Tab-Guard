// allowlist.js — "known site" test. Core of the design: trusted sites are
// left alone; everything else is "unknown" and gets watched. Unknown alone
// does nothing — unknown + compulsion signals is what triggers.

export function normalizeHost(value) {
  const h = String(value || "").trim().toLowerCase().replace(/^www\./, "");
  return h || null;
}

export function hostFromUrl(url) {
  try { return normalizeHost(new URL(url).hostname); } catch { return null; }
}

// host matches a rule if equal or a subdomain of it (github.com covers
// gist.github.com). Rules are stored without www.
export function isAllowlisted(host, allowlist) {
  const h = normalizeHost(host);
  if (!h || !Array.isArray(allowlist)) return false;
  return allowlist.some(rawRule => {
    const rule = normalizeHost(rawRule);
    return rule && (h === rule || h.endsWith(`.${rule}`));
  });
}

// For large lists (thousands of entries): build a Set once, then test a host
// by walking its domain suffixes — O(number of labels) per lookup instead of
// O(list length). Returns { has(host) }.
export function makeHostMatcher(list) {
  const set = new Set();
  for (const raw of (Array.isArray(list) ? list : [])) {
    const r = normalizeHost(raw);
    if (r) set.add(r);
  }
  return {
    size: set.size,
    has(host) {
      let h = normalizeHost(host);
      if (!h) return false;
      // check host, then strip one leftmost label at a time: a.b.c → b.c → c
      while (h) {
        if (set.has(h)) return true;
        const dot = h.indexOf(".");
        if (dot < 0) break;
        h = h.slice(dot + 1);
      }
      return false;
    },
  };
}

// URLs we never touch regardless of allowlist (browser internals, the
// extension's own pages, blank tabs).
export function isSystemUrl(url) {
  if (!url) return true;
  return /^(chrome|brave|edge|about|chrome-extension|moz-extension|devtools|view-source):/i.test(url)
    || url === "about:blank" || url.startsWith("chrome://newtab");
}
