// essential.js — sites Tab Guard never blocks, slows or greys out: help in a
// crisis, emergency services, poison control, pharmacies and public health.
// No rule can block them: not the blocklist, not the content filter, not an
// imported list, not a lock. The list is shown (read-only) in the settings,
// and you can add your own entries there.
//
// Two parts:
//  • government domains, by their suffix — in every country this covers
//    police, health authorities and ministries without listing each one;
//  • a short hand-checked list of helplines, crisis directories and health
//    services. The international directories (Find A Helpline, IASP,
//    Befrienders) lead to crisis lines in well over a hundred countries.
// Web addresses of public services are facts; this list is compiled here
// from the services' own sites, not copied from anyone's database.

export const ESSENTIAL_SUFFIXES = [
  // United States (federal .gov also covers state sites like ca.gov) and other English-speaking countries
  "gov", "mil", "gov.uk", "nhs.uk", "nhs.scot", "gov.ie", "hse.ie", "gc.ca", "canada.ca", "gov.au", "govt.nz",
  // Europe
  "europa.eu", "bund.de", "gv.at", "admin.ch", "gouv.fr", "gob.es", "gov.it", "gov.ro", "gov.pt", "overheid.nl", "rijksoverheid.nl", "belgium.be",
  // Latin America
  "gob.mx", "gob.ar", "gov.br", "gob.cl", "gov.co", "gob.pe", "gob.ec", "gob.bo", "gub.uy", "gov.py", "gob.ve",
];

export const ESSENTIAL_HOSTS = [
  // crisis directories (worldwide)
  "findahelpline.com", "iasp.info", "befrienders.org", "who.int",
  // Germany, Austria, Switzerland
  "telefonseelsorge.de", "nummergegenkummer.de", "hilfetelefon.de", "116117.de", "weisser-ring.de", "drk.de", "aponet.de",
  "telefonseelsorge.at", "rataufdraht.at", "apotheker.or.at", "143.ch", "147.ch", "toxinfo.ch",
  // United States, United Kingdom
  "988lifeline.org", "crisistextline.org", "thehotline.org", "rainn.org", "poison.org", "redcross.org",
  "samaritans.org", "childline.org.uk", "refuge.org.uk", "mind.org.uk",
  // Spain, Latin America
  "telefonodelaesperanza.org", "cvv.org.br",
  // international aid
  "icrc.org", "ifrc.org", "msf.org",
];

const norm = (h) => String(h || "").toLowerCase().replace(/^www\./, "").replace(/\.$/, "");

// host is essential if it, or a parent domain, is listed, or it ends in one of the suffixes
export function isEssentialHost(host, extra) {
  const h = norm(host);
  if (!h) return false;
  const hit = (d) => { d = norm(d); return d && (h === d || h.endsWith("." + d)); };
  if (ESSENTIAL_SUFFIXES.some(s => h === s || h.endsWith("." + s))) return true;
  if (ESSENTIAL_HOSTS.some(hit)) return true;
  return Array.isArray(extra) && extra.some(hit);
}
