// adultSignals.js — recognises adult sites from what the page says about
// itself, so the content filter also catches sites that are on no list and
// carry no RTA label.
//
// Pure scoring, no DOM: content.js reads the page and passes plain numbers in;
// the background adds what it knows about the page's outbound links. Plain
// script (not a module), declared as a content script, exposed on
// globalThis.TGAdultSignals.
//
// Every signal is structural or explicit. Nothing looks at images. Each one
// alone is either decisive by design (the 2257 compliance page, the RTA label)
// or too weak to block on its own, so only a combination reaches the threshold.
(function (root) {
  "use strict";

  const THRESHOLD = 6;

  // Unambiguous terms only. Words that also appear in health, sex education,
  // news or everyday language ("sex", "nude", "naked", "anal" as in analysis,
  // "orgasm", "threesome", "hardcore" as a music genre…) are deliberately left
  // out: a false block on a health page is worse than a miss.
  const TERMS = [
    "porn", "porno", "pornos", "xxx", "milf", "hentai", "creampie", "blowjob",
    "cumshot", "gangbang", "deepthroat", "pussy", "dildo", "bukkake", "handjob",
    "stepmom", "stepsister", "stepdaughter", "camgirl", "onlyfans", "brazzers",
    "ficken", "gefickt", "sexfilm",
  ];
  const escRe = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  let TERM_RE = new RegExp("\\b(" + TERMS.join("|") + ")\\b", "gi");
  // The user's own terms (settings › content filter) join the built-in ones.
  function setExtraTerms(list) {
    const extra = (Array.isArray(list) ? list : []).map(x => String(x || "").trim().toLowerCase()).filter(x => x.length >= 2).slice(0, 500);
    TERM_RE = new RegExp("(?:^|[^\\p{L}\\p{N}])(" + [...TERMS, ...extra].map(escRe).join("|") + ")(?=$|[^\\p{L}\\p{N}])", "giu");
  }

  // Explicit terms found in a list of short texts (thumbnail titles, alt text,
  // headings). Returns how many texts carried one, and how many distinct terms.
  function explicitStats(texts) {
    let items = 0;
    const distinct = new Set();
    for (const t of texts || []) {
      const s = String(t || "").toLowerCase();
      const m = [...s.matchAll(TERM_RE)].map(x => x[1]);
      if (m.length) { items++; m.forEach(x => distinct.add(x)); }
    }
    return { items, terms: distinct.size };
  }

  // Does the site describe itself as adult (title, description, site name)?
  function selfDescribedAdult(text) {
    return /\b(porn|porno|xxx|adult tube|sex tube|nsfw tube)\b/i.test(String(text || ""));
  }

  // f = {
  //   rta:            RTA label / adult rating meta present
  //   has2257:        a link to the site's own 18 U.S.C. 2257 compliance page
  //   tubeCms:        fingerprints of a tube video CMS (kt_player, videos_screenshots …)
  //   previews:       thumbnails with an .mp4 hover preview
  //   durations:      "12:34"-style duration badges
  //   explicit:       { items, terms } from explicitStats()
  //   selfDescribed:  selfDescribedAdult() on title + description + site name
  //   adultOutbound:  links to known adult hosts (counted by the background)
  //   searchPage:     a search results page — only the site's own signals count
  // }
  function score(f) {
    f = f || {};
    let s = 0;
    const why = [];
    const add = (n, w) => { s += n; why.push(w); };
    if (f.rta) add(10, "rta-label");
    // US law requires sexually explicit sites to publish record-keeping
    // compliance; an own page for it is a very strong sign. Not decisive
    // alone, though: together with any second signal (a video grid, a tube
    // system, explicit titles) it is.
    if (f.has2257) add(5, "2257-page");
    if (f.tubeCms) add(2, "tube-cms");
    // On a search results page only what belongs to the site itself counts
    // (above); the results are other sites' titles and links.
    if (f.searchPage) return { score: s, adult: s >= THRESHOLD, why: why.concat("search-page") };
    if ((f.previews || 0) >= 6 && (f.durations || 0) >= 6) add(1, "tube-layout");
    const ex = f.explicit || { items: 0, terms: 0 };
    if (ex.items >= 12) add(5, "explicit-titles");
    else if (ex.items >= 5 || ex.terms >= 4) add(4, "explicit-titles");
    if (f.selfDescribed) add(3, "self-described");
    if ((f.adultOutbound || 0) >= 2) add(4, "adult-links");
    else if ((f.adultOutbound || 0) === 1) add(2, "adult-link");
    return { score: s, adult: s >= THRESHOLD, why };
  }

  root.TGAdultSignals = { score, explicitStats, selfDescribedAdult, setExtraTerms, THRESHOLD, TERMS };
})(typeof globalThis !== "undefined" ? globalThis : self);
