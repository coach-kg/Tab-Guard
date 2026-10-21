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

  // ---- proxies and unblocker sites ------------------------------------------
  // A web proxy hides the real address inside its own:
  //   …/~/sj/6qgk/w70b/https%3A%2F%2Fduckduckgo.com%2F%3Fq%3D…   (Scramjet)
  //   …/uv/service/hvtrs8%2F-duckduckgo.com…                     (Ultraviolet, xor-coded)
  //   …/service/https://example.com/…, /scram/…, /proxy/…
  const MARKER = /\/(~|uv|sj|scram|scramjet|service|proxy|prox|browse|surf)\//i;
  const NOT_PROXY = /(^|\.)(web\.archive\.org|archive\.(ph|today|is|org)|translate\.goog)$/;
  function uvDecode(s) {
    let d = s; try { d = decodeURIComponent(s); } catch (_) {}
    return d.split("").map((c, i) => (i % 2 ? String.fromCharCode(c.charCodeAt(0) ^ 2) : c)).join("");
  }
  function asUrl(s) { try { const u = new URL(s); return /^https?:$/.test(u.protocol) && u.hostname.includes(".") ? u.href : null; } catch (_) { return null; } }
  // The address a proxy is showing, or null.
  function embeddedTarget(href) {
    let u; try { u = new URL(href); } catch (_) { return null; }
    if (NOT_PROXY.test(u.hostname)) return null;
    const path = u.pathname;
    let i = path.search(/\/hvtrs8(%2F|\/)/i);
    if (i >= 0) return asUrl(uvDecode(path.slice(i + 1) + u.search));
    i = path.search(/\/https?%3A%2F%2F/i);
    if (i >= 0) { const seg = path.slice(i + 1).split("/")[0]; try { return asUrl(decodeURIComponent(seg)); } catch (_) { return null; } }
    i = path.search(/\/https?:\/\//i);
    if (i >= 0) return asUrl(path.slice(i + 1) + u.search);
    return null;
  }
  // A proxy's own page: an embedded address behind a typical proxy folder
  // (or Ultraviolet's coding, which is unmistakable).
  function isProxyUrl(href) {
    const t = embeddedTarget(href);
    if (!t) return false;
    let u; try { u = new URL(href); } catch (_) { return false; }
    return /\/hvtrs8/i.test(u.pathname) || MARKER.test(u.pathname);
  }
  // Pages pretending to be a school tool in the tab title.
  const CLOAK = /^(home\s*[-|–]\s*)?(google\s+)?(classroom|docs|drive|my drive|ixl|clever|canvas|schoology|khan academy|quizlet|google|google docs|google drive|desmos)(\s*[-|–]\s*(home|google))?$/i;
  const CLOAK_HOSTS = /(^|\.)(google\.com|ixl\.com|clever\.com|instructure\.com|schoology\.com|khanacademy\.org|quizlet\.com|desmos\.com)$/;
  function titleCloak(title, host) {
    return CLOAK.test(String(title || "").trim()) && !CLOAK_HOSTS.test(String(host || "").toLowerCase());
  }
  // What to remember for a found site. On shared hosts (code CDNs, Google
  // Sites, buckets, Apps Script) that is the path of that one project, never
  // the whole host.
  function siteKey(href) {
    let u; try { u = new URL(href); } catch (_) { return null; }
    const h = u.hostname.toLowerCase().replace(/^www\./, "");
    const seg = u.pathname.toLowerCase().split("/").filter(Boolean).map(x => x.replace(/@[^/]*$/, ""));
    const take = (n) => (seg.length ? h + "/" + seg.slice(0, n).join("/") : h);
    if (/(^|\.)jsdelivr\.net(\.cn)?$|(^|\.)jsdeliver\.us$|(^|\.)jsdmirror\.com$|(^|\.)statically\.io$|(^|\.)staticdelivr\.com$/.test(h)) return take(seg[0] === "gh" ? 3 : 2);
    if (/(^|\.)esm\.sh$/.test(h)) return take(seg[0] === "gh" ? 3 : 1);
    if (/(^|\.)unpkg\.com$/.test(h)) return take(1);
    if (/(^|\.)githack\.com$|^raw\.githubusercontent\.com$|^gitcdn\./.test(h)) return take(2);
    if (h === "sites.google.com") return take(2);
    if (h === "storage.googleapis.com" || h === "s3.amazonaws.com") return take(1);
    if (h === "script.google.com") return take(3);
    if (h === "github.io" || h === "pages.dev") return h;
    return h;
  }

  self.TGBypass = { norm, score, isBypassLink, embeddedTarget, isProxyUrl, titleCloak, siteKey };
})();
