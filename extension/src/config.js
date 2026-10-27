// config.js — default settings + load/save helpers. Everything lives in
// chrome.storage.local. Nothing leaves the machine.

export const DEFAULT_CONFIG = {
  enabled: true,

  // UI language: "auto" follows the browser, or "en"/"de"/"fr"/"es"/"ro".
  language: "auto",

  // Sites you trust. Unknown (not-listed) sites are the ones that get watched.
  allowlist: [
    "mail.google.com", "calendar.google.com", "docs.google.com", "drive.google.com",
    "github.com", "gitlab.com", "stackoverflow.com",
    "claude.ai", "chatgpt.com",
    "notion.so", "linear.app", "figma.com",
    "wikipedia.org", "localhost",
  ],

  // Hard blocklist: these hosts are blocked outright (no escalation path).
  // Easy to add (popup button / auto-quarantine); removal needs the passcode.
  blocklist: [],
  autoBlockOnLock: false,   // auto-add a domain to the blocklist when it gets locked

  // Adult content (Jugendschutz): block known adult domains + any page carrying
  // the voluntary RTA label. Turning this OFF is gated by the settings lock.
  // searchPause: breathing pause when a search contains explicit terms;
  // greyLinks: links to known/recognised adult sites are greyed and inert.
  adultBlock: { enabled: false, detect: true, searchPause: true, greyLinks: true, safeSearch: true, bypass: true, terms: [], extraHosts: [] },

  // Sites where the escalation blur should cover the WHOLE page (text too) and
  // make text unselectable / uncopyable — not just the images. Everything else
  // gets the default media-only treatment.
  fullBlurHosts: [],
  fullBlurAll: false,        // apply whole-page blur to ALL watched sites by default
  fullBlurDisableLinks: false, // also disable links while a page is whole-page blurred

  // Streaming sites you watch on purpose — trusted, and exempt from media-dwell
  // so a playing film isn't greyscaled. (YouTube is deliberately NOT here.)
  streamingHosts: [
    "netflix.com", "disneyplus.com", "primevideo.com", "arte.tv",
    "mediathek.ard.de", "zdf.de", "mubi.com", "criterionchannel.com",
  ],

  // Redirects: send a watched host to a calmer alternative.
  // e.g. { from: "reddit.com", to: "safereddit.com" }
  redirects: [],

  // The intention intervention (from DoomScroll Guardian): a "what are you here
  // for?" prompt. You can turn it off or reword the question, and offer better
  // sources to jump to instead.
  intention: {
    enabled: true,
    question: "", // empty → use the localized default ("What are you here for?")
    // "Better sources" are OFF by default and only appear deeper into a
    // session, so they don't invite fresh novelty-seeking right away.
    sourcesEnabled: false,
    sourcesAfterMinutes: 10,
    betterSources: [
      { label: "ARTE Mediathek", url: "https://www.arte.tv/de/" },
      { label: "Project Gutenberg", url: "https://www.gutenberg.org/" },
    ],
  },

  // Academic / research sources treated as trusted search — general engines
  // (plain google.com, bing, duckduckgo…) stay watched.
  // University library proxies (EZproxy etc.) rewrite journal hosts into
  // e.g. content-select-com.ezproxy.hs-augsburg.de; count them as academic.
  academicProxies: true,
  academicSearch: [
    "scholar.google.com", "link.springer.com", "springer.com", "sciencedirect.com",
    "jstor.org", "arxiv.org", "pubmed.ncbi.nlm.nih.gov", "semanticscholar.org",
    "base-search.net", "doaj.org", "worldcat.org", "researchgate.net",
    "nature.com", "acm.org", "ieee.org",
  ],

  // Tab-spawning circuit breaker
  window1: { count: 4, seconds: 90 },   // -> full-screen pause
  window2: { count: 7, seconds: 300 },  // -> close new tabs + lock domain
  lockMinutes: 30,
  ignoredBeforeCooldown: 2,             // ignore N interventions -> new tabs redirect to cooldown

  // Scroll / compulsion intervention (only on watched, i.e. unknown, sites)
  intenseScore: 70,          // 0..100 scroll-intensity band that counts as "intense"
  watchAfterMinutes: 1.5,    // active minutes on an unknown site before scroll can trigger
  breathSeconds: 8,          // length of the breathe ring on the intention screen

  // Visual friction on watched sites during intense scroll
  greyscale: true,           // desaturate media
  freezeAnimated: true,      // pause gifs/videos

  // Escalation ladder applied to ALL watched pages (incl. images):
  //   none -> grey -> blur -> block, driven by a decaying "pressure" value.
  escalation: {
    enabled: true,
    decayMinutes: 25,                       // how fast pressure cools off
    stages: { grey: 20, blur: 50, block: 80 },
    maxBlurPx: 12,                          // blur strength at the top of the range
    allowReveal: true,                      // show the "reveal" button (off = no peeking)
    baseRevealSeconds: 2,                   // "reveal" delay at low pressure
    maxRevealSeconds: 12,                   // …grows to this at high pressure
    add: { dwell: 8, scroll: 15, tabPause: 12, tabLock: 25, revisit: 4, churn: 6 },
  },

  // Feed pagination ("good friction"): cap infinite feeds to a page, and reveal
  // the next page only via a button with a short countdown — so you can't
  // scroll forever without a deliberate pause.
  pagination: {
    enabled: false,
    pageSize: 10,          // items shown per "page"
    delaySeconds: 5,       // countdown on the button before the next page reveals (0 = instant)
    hosts: [],             // empty = all watched sites; otherwise only these
  },

  // Short-form filter: hide vertical and/or very short videos (Shorts, Reels,
  // TikTok-style clips). Two independent tests (portrait + duration), three
  // levels (URL block → feed-card filter → playback interception).
  // Hover previews: the small muted clips thumbnails play when you point at
  // them, plus animated GIFs. Stopped on watched sites; "everywhere" also on
  // trusted ones. Part of the friction, so it rests during a pause.
  previews: { enabled: true, everywhere: false, freezeGifs: true, hoverSwap: true },
  shortForm: {
    enabled: false,
    action: "blur",         // blur | greyscale | remove | collapse | pause
    minSeconds: 20,         // treat videos shorter than this as short-form (0 = off)
    portrait: true,         // treat vertical videos as short-form
    blockShortsUrls: true,  // block /shorts/ and /reels/ pages outright
    prePlay: true,          // judge videos by their format as soon as it is known, before they play
    swipeFeeds: false,      // experimental: recognise swipe feeds by layout and cover the page
  },

  // Media-dwell: lingering on a playing gif/webm/loop counts toward pressure.
  mediaDwell: { enabled: true, idleSeconds: 2.5, tickSeconds: 3 },

  // Search-churn: many distinct watched page loads in a short window.
  searchChurn: { enabled: true, count: 6, seconds: 60 },

  // Late-night hard mode: interventions come sooner and pauses are longer
  lateNight: { enabled: true, start: "23:00", end: "05:00" },

  // Waiting room: these sites open only after a short wait with one question,
  // then stay free for a while. Also during a pause.
  waitRoom: { enabled: true, hosts: [], seconds: 20, openMinutes: 15 },

  // Friction lock: seconds you must wait / hold before disabling an intervention
  disableFrictionSeconds: 30,

  // Auto-resume: pausing protection is temporary — it turns itself back on
  // after this many minutes so a "quick break" can't quietly stay off forever.
  autoResumeMinutes: 30,
  pausedUntil: 0, // runtime: when a pause expires (0 = not paused)

  // Emergency exits: "pause protection" and "reset pressure" in the popup.
  // Each use today waits longer than the one before (5 s, 10 s, 15 s … up to
  // maxSeconds). Up to 20 s the wait is a countdown on the button; longer
  // waits run as a loading bar on its own page. A daily budget caps how
  // often; 0 = no cap. Reset either halves the pressure or clears it.
  exits: { enabled: true, budget: 5, startSeconds: 5, maxSeconds: 120, resetMode: "halve", notOnGrey: true },
  // Loosened settings wait here for an hour before they apply (see loosen.js)
  loosenPending: null,
  // Your own additions to the sites that are never blocked (see essential.js)
  essentialExtra: [],

  // Settings lock: a type-to-unlock hurdle. A random string is SHOWN and you
  // must retype it exactly (no paste) before you can change settings, with a
  // limited number of change-unlocks. Friction, not a vault — reinstalling the
  // extension always resets it.
  lock: {
    enabled: false,
    length: 12,          // length of the shown challenge string
    maxUnlocks: 10,      // how many changes are allowed before it freezes
    unlocksUsed: 0,
    resetDaily: true,    // reset the change counter each day
    unlockDay: null,     // internal: which day the counter belongs to
    // --- artifact: secret-passcode variant (disabled) ---------------------
    // Instead of showing the code, keep a memorized secret and store only its
    // salted hash. To use that model, set mode:"secret" and restore the
    // hash/salt fields + the reveal-once flow in options.js.
    // mode: "secret", hash: null, salt: null,
    mode: "shown",
  },
};

const KEY = "tabguardConfig";

export async function loadConfig() {
  const got = await chrome.storage.local.get(KEY);
  return { ...DEFAULT_CONFIG, ...(got[KEY] || {}) };
}

export async function saveConfig(patch) {
  const cur = await loadConfig();
  const next = { ...cur, ...patch };
  await chrome.storage.local.set({ [KEY]: next });
  return next;
}

export function inLateNight(cfg, now = new Date()) {
  const ln = cfg.lateNight || {};
  if (!ln.enabled || !ln.start || !ln.end) return false;
  const toM = s => { const [h, m] = String(s).split(":").map(Number); return h * 60 + m; };
  const a = toM(ln.start), b = toM(ln.end), t = now.getHours() * 60 + now.getMinutes();
  return a < b ? (t >= a && t < b) : (t >= a || t < b);
}
