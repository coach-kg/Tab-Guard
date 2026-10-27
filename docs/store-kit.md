# Store kit: everything for an upload

Use this with the files in the kit zip: two packages, five screenshots and the icon. Every field below can be copied as it is.

## Files

| File | Where it goes |
|---|---|
| `tab-guard_vX.Y.Z-chrome.zip` | Chrome Web Store, Edge Add-ons, Opera: “Upload new package” |
| `tab-guard_vX.Y.Z-firefox.zip` | addons.mozilla.org: “Upload a new version” (your existing listing; the package carries its add-on id) |
| `screenshots/1-…5-*.png` (1280×800) | Screenshots, in this order |
| `icon.png` (128×128) | Store icon |
| Privacy policy | `https://github.com/coach-kg/Tab-Guard/blob/main/tab-guard-PRIVACY.md` |
| Homepage / support | `https://github.com/coach-kg/Tab-Guard` and `…/issues` |

No source code upload is needed on AMO: nothing is minified, bundled or generated. The package is the source.

## Listing

**Name:** Tab Guard

**Summary, EN (Chrome ≤ 132 characters, AMO ≤ 250):**
Browse on purpose, not on autopilot. Gentle friction against doomscrolling, tab spirals and short videos. Local only, no account.

**Kurzbeschreibung, DE:**
Surf mit Absicht, nicht auf Autopilot. Sanfte Bremsen gegen Doomscrolling, Tab-Spiralen und Kurzvideos. Nur lokal, ohne Konto.

**Description:** the English and German texts in [store-listing.md](store-listing.md).

**Category:** Productivity (Chrome: “Productivity → Workflow & planning”; AMO: “Productivity” and “Privacy & Security”)

**Languages:** English, German, French, Spanish, Romanian (the store name and summary come from `_locales/`).

**License (AMO):** MIT

## Chrome Web Store: “Privacy practices” tab

**Single purpose:**
Tab Guard reduces compulsive browsing: it notices doomscrolling, rapid tab-opening, short-form video and sites that get around filters, and adds local friction, entirely on the user's device.

**Permission justifications:**

- `storage`: Stores the user's own settings, lists (trusted sites, blocklist, redirects, imported list) and counters in the browser's local extension storage. Nothing is sent anywhere.
- `tabs`: Reads a tab's address to decide whether a site is trusted, watched, redirected or blocked, and counts tabs of one site opened in a short time. When a page refuses to be left (“Leave site?”), it replaces that tab with the block screen. No history is stored or sent.
- `alarms`: A once-a-minute timer that lets the pressure ease off and ends pauses, locks and delayed settings changes on time.
- `notifications`: A local notice when a site gets locked or protection resumes after a pause.
- `nativeMessaging` (optional): Not requested at install. Asked for only when the user turns on “Connect with Touch Grass” under Settings → Experimental. Tab Guard then tells the Touch Grass app on the same computer that it is running: a random profile id, the window count, whether it may run in private windows, paused or not, and its version. No browsing data, nothing over the network. Turning it off removes the permission.
- Content scripts on all http(s) pages, in all frames: Distraction can happen on any site and inside embedded frames, so the scripts run there to notice scrolling, feeds, short videos and adult or proxy pages, and to apply the friction (pause, grey, blur, block). The extension has no host permissions and makes no network requests.

**Remote code:** No, I am not using remote code. All scripts are in the package.

**Data usage:** tick nothing under “collected”. Web history, user activity and website content are processed on the device, in the moment, and never stored remotely or sent anywhere.

Certify all three statements: data is not sold, not used for unrelated purposes, and not used for creditworthiness or lending.

## addons.mozilla.org: notes for the reviewer

```
Tab Guard runs entirely on the device: no network requests, no remote code,
no analytics. The code is not minified, bundled or generated; the package is
the source (also at https://github.com/coach-kg/Tab-Guard).

Content scripts run on all http(s) pages and in all frames (match_about_blank,
match_origin_as_fallback), because distraction and filter workarounds happen on
any site and inside frames. They read the page locally and apply visual
friction (grey, blur, covers) or ask the background page to show the block page.

nativeMessaging is an optional permission. It is requested only when the user
turns on "Connect with Touch Grass" (Settings > Experimental). It sends a
heartbeat to a companion app on the same computer (random profile id, window
count, private-window permission, paused flag, version). Code:
src/touchGrass.js.

The one linter warning is a dynamic import() in content/content.js that loads
the extension's own modules through runtime.getURL(), since content scripts
cannot be ES modules.

To test: open any feed (e.g. a news site), scroll for a minute; open the same
site in four tabs within 90 seconds; Settings > Content filter for the adult
and proxy blocking.
```

**Data collection permissions (AMO form):** none. The manifest already declares `data_collection_permissions: none`.

## Before each upload

1. Bump `version` in `manifest.json` and add a CHANGELOG entry.
2. Run `scripts/build.sh` (with your `.gecko-id`, so the Firefox package keeps the id of your existing AMO listing).
3. Lint: `npx addons-linter dist/tab-guard_v*-firefox.zip` → 0 errors, 1 expected warning.
4. Upload both zips. In the release notes, paste the CHANGELOG entry.

## Touch Grass and the store ids

Touch Grass recognises Tab Guard by its extension id. The store copies get their own ids, so after the first store install:

- Chrome / Brave / Edge: copy the id from `chrome://extensions` into `tabguard_ids` in `~/.touchgrass/config.json` (or into Touch Grass's built-in `chromeIds` for everyone).
- Firefox: the id is the one in the package (`browser_specific_settings.gecko.id`); add it to Touch Grass's `firefoxIds`.
