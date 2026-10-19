// adultList.js — a small curated list of well-known adult/porn domains for the
// optional Jugendschutz (parental) mode. This is intentionally NOT exhaustive:
// the web has far too many such sites to enumerate. It's paired with RTA
// meta-tag detection in the content script (the voluntary label many adult
// sites include), which catches many sites this list doesn't name. Users can
// add more via the blocklist. All local; nothing is fetched or reported.

export const ADULT_HOSTS = [
  "pornhub.com", "xvideos.com", "xnxx.com", "xhamster.com", "redtube.com",
  "youporn.com", "tube8.com", "spankbang.com", "porn.com", "porntrex.com",
  "eporner.com", "hclips.com", "txxx.com", "beeg.com", "tnaflix.com",
  "chaturbate.com", "stripchat.com", "bongacams.com", "livejasmin.com", "cam4.com",
  "myfreecams.com", "onlyfans.com", "fansly.com", "brazzers.com", "nutaku.net",
  "rule34.xxx", "e621.net", "hentaihaven.xxx", "nhentai.net", "fapello.com",
  "motherless.com", "fakings.com", "adultfriendfinder.com",
];

// A host matches if it equals a listed domain or is a subdomain of one.
export function isAdultHost(host, extra = []) {
  const h = String(host || "").trim().toLowerCase().replace(/^www\./, "");
  if (!h) return false;
  const all = ADULT_HOSTS.concat(extra || []);
  return all.some(rule => {
    const r = String(rule || "").trim().toLowerCase().replace(/^www\./, "");
    return r && (h === r || h.endsWith(`.${r}`));
  });
}

// The RTA (Restricted To Adults) label many adult sites voluntarily embed:
//   <meta name="rating" content="RTA-5042-1996-1400-1577-RTA">
// This constant is the exact token to look for in the page's rating meta.
export const RTA_TOKEN = "RTA-5042-1996-1400-1577-RTA";
