// feedFriction.js — the decision logic behind "feed to friction".
//
// Pure functions, no DOM, so they can be unit-tested outside a browser.
// The DOM wiring lives in content/content.js.
//
// Deliberately a PLAIN script, not an ES module: it is declared in the
// manifest as a content script that runs before content.js and hands its
// functions over on `globalThis.TGFeedFriction`. It used to be pulled in with
// a dynamic import() of chrome.runtime.getURL(...), which silently fails as
// `chrome-extension://invalid/...` whenever the content script is orphaned by
// an extension reload — 288 such failures in one session, and the whole
// feature just never started. A declared content script cannot fail that way.
//
// Model: whatever the page has when it settles is "page 1". Everything the
// site appends afterwards is held back until a button in the feed is pressed.
(function (root) {
  "use strict";

  // Score how much an element looks like a real content feed.
  //
  // Measured against live LinkedIn (Oct 2026), where class names are
  // obfuscated and useless: the real feed was role="list" with 44 children,
  // median child height ~311px, width 552px — while video.js players produced
  // *hundreds* of DOM mutations in 212–362px wide boxes. So mutation count is
  // a bad signal and shape is a good one: a feed is a wide column of tall items.
  //
  // c = { key, children, medH, width, added, inMedia, listish }
  function scoreFeedCandidate(c, opts) {
    const viewportWidth = (opts && opts.viewportWidth) || 1280;
    if (!c || c.inMedia) return 0;                        // never a media player's guts
    const kids = c.children || 0, medH = c.medH || 0, w = c.width || 0;
    if (kids < 5) return 0;                               // a feed has several items
    if (medH < 100) return 0;                             // feed items are tall
    if (w < Math.max(360, viewportWidth * 0.3)) return 0; // and sit in a wide column
    const mass = kids * medH + (c.added || 0);            // content mass; appends break ties
    return c.listish ? mass * 1.25 : mass;                // ul/ol/role=list is a real signal
  }

  function pickFeedParent(cands, opts) {
    let best = null, bestScore = 0;
    for (const c of cands || []) {
      const s = scoreFeedCandidate(c, opts);
      if (s > bestScore) { bestScore = s; best = c; }
    }
    return best ? best.key : null;
  }

  // ---- the gate ------------------------------------------------------------
  //
  // No curtain, no coordinates. Every post the site adds after page 1 is either
  // shown or held (hidden). A button sits in the feed right where the held
  // posts begin. Clicking releases the next page; whatever part of that page
  // the site has not loaded yet becomes "credit", so the next arrivals show up
  // directly — until the page is used up and the button comes back.
  //
  // Hidden posts take no space, so the site's own end-of-feed trigger stays
  // reachable and keeps working. Empty slots (sentinels, placeholders) are
  // never hidden: an invisible sentinel never fires, which is how v1.9 cut the
  // feed off.

  // A post appears. Should it be shown?
  //   aboveWall: it was inserted before a post that is already shown
  //   (a "new posts" refresh at the top, an ad filling an early slot).
  function admit(credit, aboveWall) {
    const c = Math.max(0, credit || 0);
    if (aboveWall) return { show: true, credit: c };
    if (c > 0) return { show: true, credit: c - 1 };
    return { show: false, credit: 0 };
  }

  // The button was clicked with `held` posts waiting. How many to release, and
  // how much credit is left for posts the site has not delivered yet?
  // pageSize 0 = release everything waiting, no credit.
  function release(held, pageSize) {
    const h = Math.max(0, held || 0);
    if (!pageSize || pageSize <= 0) return { release: h, credit: 0 };
    const n = Math.min(h, pageSize);
    return { release: n, credit: pageSize - n };
  }

  // The site re-rendered / replaced the list (SPA navigation, filter change):
  // drop the old baseline instead of hiding a fresh feed.
  function shouldRebaseline(prevTotal, total) {
    const p = prevTotal || 0, t = total || 0;
    if (t === 0) return true;
    return t < Math.floor(p * 0.6);
  }

  // Does this host fall under the feature? Trusted (allowlisted) sites are left
  // alone unless the user listed them here explicitly.
  function isActiveHost(host, listedHosts, watched) {
    const h = String(host || "").toLowerCase().replace(/^www\./, "");
    if (!h) return false;
    const listed = (listedHosts || []).some(function (r) {
      const x = String(r || "").toLowerCase().replace(/^www\./, "").trim();
      return x && (h === x || h.endsWith("." + x));
    });
    if (listed) return true;      // explicit opt-in beats the allowlist
    return !!watched;             // otherwise only on watched (non-trusted) sites
  }

  root.TGFeedFriction = {
    scoreFeedCandidate, pickFeedParent, admit, release, shouldRebaseline, isActiveHost,
  };
})(typeof globalThis !== "undefined" ? globalThis : self);
