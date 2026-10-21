# Changelog

## 1.34.0
- **Experimental, optional: Touch Grass link.** Hidden under Settings → Experimental. Lets the Touch Grass Mac app see that Tab Guard is running, so it can require Tab Guard in every browser. Asks for the optional `nativeMessaging` permission only when switched on; nothing is sent over the network.
- The manifest carries a `key` so a copy loaded with “Load unpacked” always has the same id. The store packages leave it out.

## 1.33.2
- Proxy detection also catches disguised proxies: target addresses hidden Base64-coded in a same-site frame (e.g. `go=aHR0cHM6…`), websocket relays, address bars spelled with digits ("s3arc7 or u3l"), and back/forward/reload buttons next to such a bar.

## 1.33.1
- YouTube: a covered video no longer flashes while the page loads. The cover stays for that video and is only lifted after moving on to a video whose own details are clean.

## 1.33.0
- **Proxy and unblocker sites** (with the content filter on) are recognised and closed: pages that show other sites through a proxy (the real address coded into a frame or the page itself, e.g. Scramjet, Ultraviolet), unblocked-games sites, start pages that pretend to be Classroom or IXL, browser-style address bars, Games/Movies/Proxy menus, and web apps hidden in .svg files on code CDNs. Found sites are remembered; on shared hosts only that one project. The list is in the settings.
- **Harder to remove in the inspector:** covers, block screens and filters come back within a second when deleted or hidden. Underneath a cover the video and its description are hidden too. Covers lifted on purpose (emergency access, a reveal) stay lifted.

## 1.32.0
- **Calm view** in the popup: Normal · Grey · Blurred, for all sites, with "always normal on this site". Hovering a picture for a moment shows it. It is separate from the escalation ladder and applies at once.
- **Guides for getting around blockers** (with the content filter on): on YouTube, results about unblocked games, proxy link drops or beating school filters are covered with a short note, such a video page gets a cover with an explanation, and description links to unblocker sites are switched off. Can be turned off in the settings (the change waits an hour, like other loosening).

## 1.31.2
- Emergency access on a page that was blocked by the escalation ladder now lifts the block screen at once. Before, the page needed a manual reload.

## 1.31.1
- Safer page building: no `innerHTML` any more. Text that comes from a web page is always inserted as plain text.
- The extension's own modules (translations, the pause overlay) load through one function.

## 1.29 – 1.31.0
- **Never blocked:** helplines, health and government sites are never blocked, slowed or greyed out. You can add your own entries.
- **Emergency access:** once a day, 20 minutes for one blocked site. It ends early when the time turns into scrolling memes.
- **Exits with a price:** pausing and resetting wait a little longer each time (5 s, 10 s, 15 s …) within a daily budget. Your day starts at a time you choose (default 05:00).
- **Loosening waits an hour:** switching protection off, more budget, shorter waits or removing blocked entries take effect one hour after saving. Tightening applies at once.
- **Block list import**, e.g. from Cold Turkey. Replacing or removing an import also waits an hour.
- **SafeSearch** is enforced on Google, Bing, DuckDuckGo, Brave Search, Yahoo and SearXNG; searches that can't be filtered are blocked.
- **Short-form filter** also works inside embedded players, catches videos before they play, and has an experimental swipe-feed detection.
- **Intention prompt:** one clear word is enough, no Enter needed; a green check confirms it.
- **Popup:** calmer, shows whether the feed brake is active and outlines the feed on the page on hover.
- **Settings** work on small screens.
- New privacy policy (English and German).

## 1.28.1
- No more `host_permissions`. Content scripts still run on all sites; nothing is requested beyond that.

## Earlier
Feed to friction, tab circuit breaker, breathing pause with intention, escalation ladder, video preview stopper, short-form filter, content filter, blocklist and redirects, settings lock, five languages.
