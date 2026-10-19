# Changelog

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
