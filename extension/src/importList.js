// importList.js — an imported block list (Cold Turkey's export format and plain
// host lists), kept in its own storage key so the settings object stays small.
//
// Lines, one rule each:
//   example.com                plain host: the host and all its subdomains
//   reddit.com/r/something     host + path prefix
//   *bigass*  *.xxx            wildcard without "/": tested against the host;
//                              *word* is also tested against the whole address
//   */r/name*  *.*/*q=*porn*   wildcard with "/": tested against host+path+query
// Matching is case-insensitive and ignores the scheme and a leading www.
// Lines starting with # or // are comments.

export const IMPORT_KEY = "tabguardImport";
// A replacement or removal waits an hour: { data: {…} | null, at }
export const IMPORT_NEXT_KEY = "tabguardImportNext";

// Both lists at once (while a replacement waits for its hour).
export function mergeImports(a, b) {
  const u = (x, y) => [...new Set([...(x || []), ...(y || [])])];
  if (!a) return b; if (!b) return a;
  return { hosts: u(a.hosts, b.hosts), prefixes: u(a.prefixes, b.prefixes), patterns: u(a.patterns, b.patterns),
    name: [a.name, b.name].filter(Boolean).join(" + ").slice(0, 160), at: Date.now() };
}

export function parseImport(text) {
  const hosts = [], prefixes = [], patterns = [];
  const seen = new Set();
  for (let line of String(text || "").split(/\r?\n/)) {
    line = line.trim().toLowerCase();
    if (!line || line.startsWith("#") || line.startsWith("//")) continue;
    line = line.replace(/^[a-z]+:\/\//, "").replace(/^www\./, "");
    if (seen.has(line)) continue;
    seen.add(line);
    if (line.includes("*")) patterns.push(line);
    else if (line.includes("/")) prefixes.push(line.replace(/\/+$/, ""));
    else hosts.push(line.replace(/:\d+$/, ""));
  }
  return { hosts, prefixes, patterns };
}

const esc = (s) => s.replace(/[.+?^${}()|[\]\\]/g, "\\$&");
const globRe = (list) => list.length ? new RegExp("^(?:" + list.map(p => esc(p).replace(/\*/g, ".*")).join("|") + ")$") : null;

// Build a matcher from a stored import ({hosts, prefixes, patterns}).
export function makeImportMatcher(data) {
  if (!data || (!data.hosts?.length && !data.prefixes?.length && !data.patterns?.length)) return null;
  const hostSet = new Set(data.hosts || []);
  const byHost = new Map();                      // host → [path prefixes]
  for (const p of data.prefixes || []) {
    const i = p.indexOf("/"); const h = p.slice(0, i), path = p.slice(i);
    if (!byHost.has(h)) byHost.set(h, []);
    byHost.get(h).push(path);
  }
  const hostPats = (data.patterns || []).filter(p => !p.includes("/"));
  const urlPats = (data.patterns || []).filter(p => p.includes("/"));
  const reHost = globRe(hostPats);
  const reAny = globRe(hostPats.filter(p => p.startsWith("*") && p.endsWith("*") && p.length > 2));
  const reUrl = globRe(urlPats);

  // host + every parent domain: a.b.example.com → a.b.example.com, b.example.com, example.com
  const suffixes = (h) => { const out = []; const parts = h.split("."); for (let i = 0; i < parts.length - 1; i++) out.push(parts.slice(i).join(".")); return out; };

  return function match(rawUrl) {
    let u; try { u = new URL(rawUrl); } catch (_) { return false; }
    if (!/^https?:$/.test(u.protocol)) return false;
    const host = u.hostname.toLowerCase().replace(/^www\./, "");
    const rest = (u.pathname + u.search).toLowerCase();
    let restDec = rest; try { restDec = decodeURIComponent(rest.replace(/\+/g, " ")); } catch (_) {}
    const sfx = suffixes(host);
    if (sfx.some(h => hostSet.has(h)) || hostSet.has(host)) return true;
    for (const h of sfx) {
      const paths = byHost.get(h);
      if (paths && paths.some(p => rest.startsWith(p) || restDec.startsWith(p))) return true;
    }
    if (reHost && reHost.test(host)) return true;
    const full = host + rest, fullDec = host + restDec;
    if (reAny && (reAny.test(full) || reAny.test(fullDec))) return true;
    if (reUrl && (reUrl.test(full) || reUrl.test(fullDec))) return true;
    return false;
  };
}

// Short summary for the settings page (no entries shown).
export function importStats(data) {
  if (!data) return null;
  const pats = data.patterns || [];
  return {
    hosts: (data.hosts || []).length,
    paths: (data.prefixes || []).length,
    patterns: pats.length,
    searches: pats.filter(p => /[?&*/](q|p|query|search)=/.test(p)).length,
  };
}

// ---- several lists -------------------------------------------------------------
// { lists: [{ id, name, at, data: {hosts, prefixes, patterns}, removeAt? }] }
// Adding a list applies at once. Removing one waits an hour (removeAt); until
// then it still counts. The older single list (IMPORT_KEY, IMPORT_NEXT_KEY)
// is moved over once.
export const LISTS_KEY = "tabguardImports";
export function listsMerged(store) {
  let out = null;
  for (const l of (store && store.lists) || []) out = mergeImports(out, l.data);
  return out;
}
export function dueLists(store, now = Date.now()) {
  const lists = (store && store.lists) || [];
  const keep = lists.filter(l => !(l.removeAt && l.removeAt <= now));
  return keep.length === lists.length ? null : { lists: keep };
}
export async function migrateImports(storage) {
  const g = await storage.get([LISTS_KEY, IMPORT_KEY, IMPORT_NEXT_KEY]);
  if (g[LISTS_KEY] || (!g[IMPORT_KEY] && !g[IMPORT_NEXT_KEY])) return g[LISTS_KEY] || { lists: [] };
  const lists = [];
  const next = g[IMPORT_NEXT_KEY];
  const stamp = (d, extra) => ({ id: Math.random().toString(36).slice(2, 10), name: (d && d.name) || "Import", at: (d && d.at) || Date.now(),
    data: { hosts: (d && d.hosts) || [], prefixes: (d && d.prefixes) || [], patterns: (d && d.patterns) || [] }, ...extra });
  if (next && next.data) {
    // a replacement was waiting: the new list stays, the old one leaves at that time
    lists.push(stamp(next.data));
    if (g[IMPORT_KEY]) lists.push(stamp({ ...g[IMPORT_KEY], name: "(alt)" }, { removeAt: next.at }));
  } else if (g[IMPORT_KEY]) {
    lists.push(stamp(g[IMPORT_KEY], next && !next.data ? { removeAt: next.at } : {}));
  }
  const store = { lists };
  await storage.set({ [LISTS_KEY]: store });
  await storage.remove([IMPORT_KEY, IMPORT_NEXT_KEY]);
  return store;
}
