// shortForm.js — the one rule for "is this video short-form?", shared by the
// page script (content.js) and the script that runs inside embedded players
// (frame.js). Plain script; exposes globalThis.TGShortForm.
(function (root) {
  "use strict";
  const PORTRAIT = 1.15;               // height / width from which a video counts as vertical

  // SF = the shortForm settings. Uses the video's own format (videoWidth/
  // videoHeight) and length, never the page layout, so a tall box around a
  // landscape clip doesn't count. Needs the metadata (readyState ≥ 1).
  function classify(v, SF) {
    if (!SF || !(v instanceof HTMLVideoElement)) return null;
    const portrait = v.videoWidth > 0 && v.videoHeight / v.videoWidth >= PORTRAIT;
    const tooShort = SF.minSeconds > 0 && Number.isFinite(v.duration) && v.duration > 0 && v.duration < SF.minSeconds;
    if (SF.portrait && portrait) return "portrait";
    if (tooShort) return "short";
    return null;
  }
  root.TGShortForm = { classify, PORTRAIT };
})(typeof globalThis !== "undefined" ? globalThis : self);
