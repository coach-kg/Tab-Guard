# Changelog

## 1.38.0
- **Block a site for a while.** “Block this site” in the popup now asks for how long: 1 hour, until tomorrow's day start (05:00 by default), or for good (the blocklist). Open tabs of the site switch to the block screen right away. A temporary block also holds during a pause, can't be lifted early and has no emergency access; when it runs out, the block screen shows the way on.

## 1.37.4
- Stimulus dimmer: a live preview shows normal, grey, half and full blur at the strength you set.
- Dragging the thresholds in the chart no longer selects text.
- A page that keeps asking “Leave site?” is closed with a second try if the first one didn't take.

## 1.37.3
- Pressure chart: each step of the example is numbered on the curve and explained below (minute, what happened, points). It says plainly that a pause or lock itself also raises the pressure. Drag the dashed lines in the chart to move where grey, blur and block begin.
- Settings inputs fit the dark theme: dropdowns with an accent chevron and proper spacing, time fields with an accent clock and a dark picker, number fields with small accent steppers.
- Settings lock: the field you type in uses the same font, size and spacing as the code shown above it, so the two are easy to compare.

## 1.37.2
- **Stimulus dimmer, explained:** an example chart drawn with your settings (how scrolling, tab pauses and lingering raise the pressure, where grey, blur and block begin, how it cools off), the points each behaviour adds, and the half-life. New setting: how strongly behaviour counts (gentle · normal · strict); gentler waits an hour.
- Waiting room: “free for 15 minutes” now says what it means: no new wait for 15 minutes.
- Introduction: language switch in the top bar; language menus show flags.
- Number fields no longer hide their value behind spinner arrows.
- Side list in the settings: the current section is marked with a thin straight line, no rounded box.

## 1.37.1
- Store texts name no other products any more (the Chrome Web Store had flagged the list of search engines as keyword spam).
- New store screenshots in English and German, from the current version: intention, detection, calmer pages, waiting room, rules and privacy.
- Calm view in the popup: “Calm view · everywhere” and “Leave this site out”, so it's clear the switch is an exception for the open site.
- No more “Uncaught (in promise)” in the console on pages with sandboxed frames: the proxy database check never rejects and only runs in frames of the same site.
- Waiting room: no spell-check underline in the question field.

## 1.37.0
- **Waiting room for sites.** Sites on this list open only after a short wait (20 s by default) on a calm page with one question: what for? Then they stay free for a while (15 min). The wait is timed in the background, so it can't be skipped in the inspector. Applies during a pause too; removing a site or shortening the wait takes effect after an hour.
- **Introduction** after installing, in four steps: what Tab Guard does, trusted sites and streaming services, content filter and waiting room, settings lock. It can be opened again from the settings; then loosening choices wait an hour as usual.
- **Several imported lists.** Add as many Cold Turkey or hosts files as you like; each one is listed with its counts and can be removed on its own (after an hour) or kept after all. The lists live in Tab Guard: deleting the file on your computer changes nothing.
- **Settings, new layout and names.** Five groups (Basics · Blocking & filters · Interrupting autopilot · Calmer media · Safeguards & backup), each section a card with a readable heading. Clearer names in all languages, e.g. Tab brake, Feed brake, Stimulus dimmer, Strict night mode, Short-video filter, Full-site blur. The side list always marks the section you're on, also at the end of the page, and scrolls along. Works on phones.
- Lists have one small sort button in the corner that switches between as entered, A–Z and Z–A. Sorting only changes the view.
- Notes like “loosening takes effect after an hour” appear right where the change was made.
- Footer: “Made with ♥ in 🇩🇪”.
- Fix (from 1.36.0): saving the settings for the first time no longer holds the built-in trusted sites back for an hour.

## 1.36.1
- **“Leave site?” can't keep a blocked page open.** If a page holds its tab with that question and you answer “stay”, the tab is replaced by the block screen anyway.
- Block screen: clearer texts (“Proxy-Seite gesperrt” / “Proxy site blocked”), the nudge in bold with one of two questions (“Was war das?” / “Wofür war das?”), and the hint on how to unblock only where it applies, and correct about the code and the one-hour wait.
- Settings while locked: “Just look” shows everything read-only; exporting still works.
- Line breaks: headings balanced, text set so the last line isn't a lone word. Icons sit on the first line of the heading next to them.
- One more front-end name (Ghostlink).
- docs/store-kit.md: every field for the Chrome Web Store and addons.mozilla.org.

## 1.36.0
- **Frames within frames.** Content filter and proxy checks now also run in frames written by script (`about:blank`, `document.write`) and in frames inside frames. An adult page shown inside a site's own frame closes the site as a proxy (no emergency access). A browser inside a frame (address bar with back / forward / reload) is recognised too.
- **Iframe shells**: sites whose menu only swaps local pages in one big frame (`data-src="play.html"`, `"uu.html"` …), especially under a school-tool title such as "Student Practice Center", are recognised.
- **Guides outside YouTube**: YouTube front ends and mirrors (Invidious, Piped …), other video sites and blog posts that are mostly a list of unblocker addresses are covered like guide videos on YouTube; single guide entries in result lists are covered. Embedded YouTube players whose title is such a guide are covered in place; other embeds play.
- More engines recognised by their traces: Dynamic (`data-dynamic_*`, `dynamic.*.js`), node-unblocker (`unblocker-client.js`), Alloy (`/fetch/<Base64 origin>/`). More front-end names; names only count together with proxy / unblock words (no more hiding "Interstellar" trailers).
- **Late recognition**: when a page or a frame is largely rebuilt later (another site loaded into it), it is checked again. Engine databases are asked several times, not only once.
- **Trusted lists no longer open proxies.** A remembered proxy stays closed even if its site is on the trusted list; on trusted sites the unmistakable signs (engine, proxied address, page shown through a frame) still count. Adding sites to the trusted, academic or streaming lists now waits an hour, like every other loosening.
- Settings: lists can be shown A–Z, Z–A or in the order entered. Sorting only changes the view; the saved order stays the order you entered things in.

## 1.35.1
- The hidden-decoy check reads page styles only when another sign already points to a proxy site. On normal sites a site's own broken font (e.g. "Failed to decode downloaded font") no longer shows up in the extension's error list.

## 1.35.0
- **Proxy engines are recognised by their own traces**, whatever the site is called: the runtime files of Ultraviolet, Scramjet, Rammerhead and bare-mux, the original addresses that these engines keep on every element of a page they show (`__uv-attr-*`, `scramjet-attr-*`, `*-hammerhead-stored-value`), their storage (`bare-mux-path`, the `$scramjet` and `__op` databases) and Rammerhead's session addresses. Transports alone (epoxy, libcurl.js), which also have harmless uses, only add to the score.
- Fewer false alarms: a frame of the same site only counts when it is actually shown and is handed another site's address that is not a plain image or file. Hidden login and helper frames are left alone, as is TestCafe on localhost.

## 1.34.3
- Escalation ladder and calm view now also reach pictures and videos inside embedded frames, e.g. the page a web proxy shows inside its own window. Removing the filter in the inspector brings it back.
- Proxy detection: more proxy front ends are recognised (e.g. Kite, CroxyProxy with `__cpo` addresses, frames that load `…/cdn/https%3A…`), plus address bars like "Search the web or type a URL" and common proxy wording.

## 1.34.2
- Touch Grass link: the settings show the browser's own reason when the connection fails (e.g. "Specified native messaging host not found").

## 1.34.1
- No fixed `key` in the manifest any more: an unpacked copy keeps the extension id it already has, so updating from the folder works without reinstalling. Touch Grass learns the id through `tabguard_ids` in its config.

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
