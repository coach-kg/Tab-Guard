// bypass.js — recognises guides and links for getting around blockers:
// "unblocked games for school", proxy link drops, filter-bypass tricks.
// Used on YouTube to hide such results and disable such links.
// Loaded as a classic content script; exposes self.TGBypass.
(function () {
  // Undo the usual spelling tricks: UnbIocked, Unb1ocker, pr0xy, ch-romebook.
  function norm(s) {
    return String(s || "")
      .replace(/[\u200b-\u200f\u2060\ufeff]/g, "")
      .replace(/([a-z])I(?=[a-z])/g, "$1l")            // capital I used as an l
      .toLowerCase()
      .replace(/[0134578@$]/g, (c) => ({ 0: "o", 1: "l", 3: "e", 4: "a", 5: "s", 7: "t", 8: "b", "@": "a", $: "s" })[c])
      .replace(/[^a-z\s:/.-]+/g, " ")
      .replace(/\s+/g, " ");
  }

  const CONTEXT = /\b(school|schools|chromebooks?|chroebooks?|classroom|class|k12|teacher|links?|sites?|websites?|games?|gaming|roblox|discord|instagram|snapchat|tiktok|movies)\b/;
  const FILTERS = /\b(goguardian|securly|lightspeed|blocksi|iboss|linewize|contentkeeper|gaggle|hapara|deledao|fortiguard|umbrella|smoothwall|netsweeper|relay)\b/;
  const VERBS = /\b(bypass|bypassing|unblock|unblocking|get around|turn off|remove|disable|kill|hack|break|escape|delete)\b/;
  const NAMES = /\b(interstellar|melonsoda|melon soda|gn ?math|doge unblocker|holy unblocker|ultraviolet|rammerhead|scramjet|petezah|truffled|selenite|bull ?ee|space links|cherri|nebula proxy|womginx|achroma|zaka|catclass|yuki os|edurocks|voltix|polaris|ghost proxy)\b/;

  // A score: 2 or more means "this is about getting around blockers".
  function score(text) {
    const t = norm(text);
    if (!t) return 0;
    let s = 0;
    if (/\bunbl?ock(ed|er|ers|ing)\b/.test(t) && CONTEXT.test(t)) s += 2;
    else if (/\bunbl?ock(ed|er|ers)\b/.test(t)) s += 1;
    if (/\bprox(y|ies)\b/.test(t) && /\b(school|chromebooks?|links?|unbl?ock\w*|games?)\b/.test(t)) s += 2;
    if (FILTERS.test(t) && VERBS.test(t)) s += 2;
    if (NAMES.test(t) && /\b(links?|proxy|proxies|unbl?ock\w*|school|games?|new)\b/.test(t)) s += 2;
    if (/\b(tab ?cloak|about:blank cloak|cloaked tab|panic key)\b/.test(t)) s += 2;
    if (/\bschool chromebooks?\b/.test(t) && /\b(games?|gaming|roblox|links?|movies)\b/.test(t)) s += 2;
    if (/\bgames? (websites?|sites?|links?) for school\b/.test(t)) s += 1;
    return s;
  }

  // Where link drops point: a web app hidden as an .svg or .html file on a code
  // CDN, Apps Script web apps, throwaway edge hosts and buckets.
  const CDN = /(^|\.)(jsdelivr\.net|jsdelivr\.net\.cn|jsdeliver\.us|jsdmirror\.com|esm\.sh|statically\.io|staticdelivr\.com|githack\.com|unpkg\.com|rawgit\.com|gitcdn\.\w+|raw\.githubusercontent\.com)$/;
  const EDGE = /(^|\.)(workers\.dev|edgeone\.app|filesusr\.com|myoxypages\.com|lunabot\.lol)$/;
  const BUCKET = /(^|\.)(s3[.-][a-z0-9.-]*amazonaws\.com|s3\.amazonaws\.com|cloudfront\.net|storage\.googleapis\.com)$/;
  function isBypassLink(href) {
    let u;
    try { u = new URL(href, "https://www.youtube.com/"); } catch (_) { return false; }
    // YouTube wraps outgoing links: /redirect?q=<target>
    if (/(^|\.)youtube\.com$/.test(u.hostname) && u.pathname === "/redirect") {
      const q = u.searchParams.get("q");
      return q ? isBypassLink(/^https?:/i.test(q) ? q : "https://" + q) : false;
    }
    const h = u.hostname.toLowerCase(), p = u.pathname.toLowerCase();
    const page = /\.(svg|html?)$/.test(p) || /\/(study|work|index)\.html?$/.test(p);
    if (CDN.test(h) && (page || /\/gh\/[^/]+\/[^/]*(class|school|study|learn|edu|math|algebra)/.test(p))) return true;
    if (EDGE.test(h)) return true;
    if (BUCKET.test(h) && page) return true;
    if (h === "script.google.com" && /^\/macros\/s\/[^/]+\/exec/.test(p)) return true;
    return false;
  }

  self.TGBypass = { norm, score, isBypassLink };
})();
