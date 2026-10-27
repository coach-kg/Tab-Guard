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
  const NAMES = /\b(interstellar|melonsoda|melon soda|gn ?math|doge unblocker|doge|holy unblocker|ultraviolet|rammerhead|scramjet|petezah|truffled|selenite|bull ?ee|space links|space|cherri|nebula|womginx|achroma|zaka|catclass|yuki os|edurocks|voltix|polaris|ghost|kite|tung ?tung|croxy ?proxy|proxyium|blockaway|frogie|froggie|utopia|quasar|lunar|daydream ?x|glint|galaxy|vapor|sheep|shadow|emerald|radon|rainbow|velara|artclass|hypertabs|dynamic|corrosion|alloy|ghostlink|ghost link)\b/;

  // A score: 2 or more means "this is about getting around blockers".
  function score(text) {
    const t = norm(text);
    if (!t) return 0;
    let s = 0;
    if (/\bunbl?ock(ed|er|ers|ing)\b/.test(t) && CONTEXT.test(t)) s += 2;
    else if (/\bunbl?ock(ed|er|ers)\b/.test(t)) s += 1;
    if (/\bprox(y|ies)\b/.test(t) && /\b(school|chromebooks?|links?|unbl?ock\w*|games?)\b/.test(t)) s += 2;
    if (FILTERS.test(t) && VERBS.test(t)) s += 2;
    if (NAMES.test(t) && /\b(links?|proxy|proxies|unbl?ock\w*|chromebooks?|school)\b/.test(t) && /\b(proxy|proxies|unbl?ock\w*|browser)\b/.test(t)) s += 2;
    if (/\b(tab ?cloak|about:blank cloak|cloaked tab|panic key|cloaking|boss key)\b/.test(t)) s += 2;
    if (/\b(free )?web proxy\b|\bproxy (server|site|service|browser)\b|\b(browse|surf)(ing)? (the web )?anonymous(ly)?\b|\bunblock (any )?(websites?|sites)\b/.test(t)) s += 2;
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
    let u; try { u = new URL(href); } catch (_) { return false; }
    // CroxyProxy and its clones: ?__cpo=<Base64 of the real address>
    for (const k of ["__cpo", "__cpi"]) { const v = u.searchParams.get(k); if (v && /^(https?):\/\//i.test(b64(v))) return true; }
    // Rammerhead: a 32-character session id, then the shuffled address
    //   /3f9c…e1/_rhsQx7…   (unshuffled ones are caught by its files, see below)
    if (/^\/[a-z0-9]{32}\/_rhs/i.test(u.pathname)) return true;
    // Alloy: /fetch/<Base64 of the real origin>/…
    const al = u.pathname.match(/^\/(fetch|prefix)\/([A-Za-z0-9+/_-]{8,}={0,2})\//);
    if (al && /^https?:\/\/[^/]+\.[a-z]/i.test(b64(al[2]))) return true;
    const t = embeddedTarget(href);
    if (!t) return false;
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

  // Addresses hidden in a frame's query, plain or Base64:
  //   logo-….svg?w1=d3NzOi8v…&go=aHR0cHM6Ly9zZXguY29t  →  wss://… and https://sex.com
  function b64(v) {
    try { const t = atob(v.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((v.length + 3) % 4)); return /^[\x20-\x7e]+$/.test(t) ? t : ""; } catch (_) { return ""; }
  }
  function paramTargets(href) {
    let u; try { u = new URL(href); } catch (_) { return []; }
    const out = [];
    for (const [, v] of u.searchParams) {
      if (!v || v.length < 8) continue;
      if (/^(https?|wss?):\/\/[^/]+\.[a-z]/i.test(v)) out.push(v);
      else if (/^[A-Za-z0-9+/_-]{8,}={0,2}$/.test(v)) { const d = b64(v); if (/^(https?|wss?):\/\/[^/]+\.[a-z]/i.test(d)) out.push(d); }
    }
    return out;
  }
  // A frame of the same site that is handed another site's address (Base64-coded,
  // or a websocket relay): a proxy tab. Only for same-origin frames — ads and
  // embeds from other sites pass addresses around for harmless reasons.
  // Not counted: addresses of the site itself (a login frame's return address)
  // and plain files (an image or PDF fetched through an image CDN).
  const FILE = /\.(jpe?g|png|gif|webp|avif|svg|ico|bmp|pdf|mp4|webm|mp3|woff2?|css|js)$/i;
  function foreign(target, own) {
    let t; try { t = new URL(target); } catch (_) { return false; }
    const base = (h) => h.toLowerCase().replace(/^www\./, "").split(".").slice(-2).join(".");
    if (base(t.hostname) === base(own.hostname)) return false;
    return !(/^https?:$/.test(t.protocol) && FILE.test(t.pathname));
  }
  function isFramedProxy(href) {
    let u; try { u = new URL(href); } catch (_) { return false; }
    // a full address coded into the path (…/cdn/https%3A%2F%2Fsex.com%2F),
    // whatever the folder is called
    const e = embeddedTarget(href);
    if (e && foreign(e, u)) return true;
    const t = paramTargets(href).filter(x => foreign(x, u));
    if (!t.length) return false;
    const coded = [...u.searchParams.values()].some(v => /^[A-Za-z0-9+/_-]{8,}={0,2}$/.test(v) && /^(https?|wss?):\/\//i.test(b64(v)) && foreign(b64(v), u));
    return coded || t.some(x => /^wss?:/i.test(x));
  }
  // "s3arc7 or u3l", "Search or enter website name", "Enter URL" …
  // Digits and symbols in the placeholder count as wildcards.
  const BAR = ["search or url", "search or enter url", "search or type a url", "search or type url", "search or enter website name",
    "search or enter address", "search or enter a url", "search the web or enter url", "search or enter website", "enter url", "enter a url", "type a url", "search or go to url", "search the web or type a url",
    "enter the url", "enter the address", "enter address", "enter website", "enter a website", "type url", "paste a url", "url or search"];
  function looksLikeUrlBar(ph) {
    const t = String(ph || "").toLowerCase().replace(/\s+/g, " ").trim();
    if (!t || t.length > 60) return false;
    const fit = (a, b) => a.length === b.length && [...a].every((c, i) => c === b[i] || /[0-9@$|!*_]/.test(c));
    for (const p of BAR) for (let i = 0; i + p.length <= t.length; i++) if (fit(t.slice(i, i + p.length), p)) return true;
    return false;
  }

  // ---- proxy engines ----------------------------------------------------------
  // Almost every unblocker is one of three open-source engines (Ultraviolet,
  // Scramjet, Rammerhead) behind its own front page, talking to the web through
  // bare-mux plus a transport (epoxy, libcurl, wisp). Each leaves traces that a
  // normal site does not have, whatever the site is called:
  //  - its runtime files (uv.bundle.js, scramjet.all.js, baremux/worker.js …),
  //  - the original address kept on every rewritten element of a proxied page
  //    (__uv-attr-src, scramjet-attr-href, src-hammerhead-stored-value),
  //  - its storage (localStorage "bare-mux-path", IndexedDB "$scramjet" / "__op").
  const ENGINE_FILES = /\/(uv\.(bundle|client|handler|config|sw)\.js|scramjet\.(all|bundle|sync|worker|client|codecs|controller|shared)\.m?js|scramjet\.wasm(\.wasm)?|baremux\/(index|worker)\.m?js|bare-mux[^/]*\.m?js|rammerhead(\.min)?\.js|worker-hammerhead\.js|dynamic\.(handler|client|worker|config|html)\.js|unblocker-client\.js)([?#]|$)/i;
  const TRANSPORT_FILES = /\/(epoxy\/index\.m?js|epoxy[-_.][^/]*\.(m?js|wasm)|libcurl\/index\.m?js|libcurl(_full)?\.(m?js|wasm)|wisp-client[^/]*\.m?js)([?#]|$)/i;
  const UV_SJ_ATTRS = ["src", "href", "srcset", "action", "data", "poster", "integrity", "script-source-src"]
    .flatMap(a => ["__uv-attr-" + a, "scramjet-attr-" + a, "data-dynamic_" + a]).map(a => "[" + a + "]").join(",");
  const HH_ATTRS = '[src-hammerhead-stored-value],[href-hammerhead-stored-value],[action-hammerhead-stored-value],[class*="hammerhead-shadow-ui"]';
  // TestCafe (the testing tool Rammerhead is built on) runs on the developer's
  // own machine; those pages are left alone.
  const LOCAL = /^(localhost|127(\.\d+){3}|\[::1\]|.*\.localhost|.*\.test)$/i;
  function fileHits(urls) {
    const engine = new Set(), transport = new Set();
    for (const raw of urls) {
      let p = ""; try { p = new URL(raw, "https://x.invalid/").pathname; } catch (_) { continue; }
      let m = p.match(ENGINE_FILES); if (m) engine.add(m[1].toLowerCase());
      m = p.match(TRANSPORT_FILES); if (m) transport.add(m[1].toLowerCase());
    }
    return { engine: [...engine], transport: [...transport] };
  }
  // What a page (or frame) shows of a proxy engine. Synchronous and cheap.
  function engineMarks(doc, win) {
    doc = doc || document; win = win || self;
    const host = (win.location && win.location.hostname) || "";
    const urls = [...doc.querySelectorAll("script[src],link[href]")].map(e => e.getAttribute("src") || e.getAttribute("href"));
    try { for (const r of win.performance.getEntriesByType("resource")) urls.push(r.name); } catch (_) {}
    try { const c = win.navigator.serviceWorker && win.navigator.serviceWorker.controller; if (c) urls.push(c.scriptURL); } catch (_) {}
    const f = fileHits(urls);
    let rewritten = false;
    try { rewritten = !!doc.querySelector(UV_SJ_ATTRS + ",#_alloy_data") || (!LOCAL.test(host) && !!doc.querySelector(HH_ATTRS)); } catch (_) {}
    let store = false;
    try {
      const ls = win.localStorage;
      for (let i = 0; i < ls.length && i < 500; i++) {
        const k = ls.key(i) || "";
        if (k === "bare-mux-path" || k === "bare-mux-remote" || k === "rammerhead_synctimestamp" || k.startsWith("rammerhead|storage-wrapper|")) { store = true; break; }
      }
    } catch (_) {}
    if (LOCAL.test(host)) f.engine = f.engine.filter(x => !/hammerhead/.test(x));
    return { engine: f.engine, transport: f.transport, rewritten, store };
  }
  // The engines' own databases. Asynchronous; resolves to true or false.
  function engineDatabases(win) {
    win = win || self;
    try {
      if (!win.indexedDB || !win.indexedDB.databases) return Promise.resolve(false);
      return win.indexedDB.databases().then(list => list.some(d => d && (d.name === "$scramjet" || d.name === "__op")), () => false);
    } catch (_) { return Promise.resolve(false); }
  }

  self.TGBypass = { norm, score, isBypassLink, embeddedTarget, isProxyUrl, titleCloak, siteKey, paramTargets, isFramedProxy, looksLikeUrlBar, engineMarks, engineDatabases, fileHits };
})();
