# Task: share learned sites with Touch Grass for Mac (Tab Guard 1.43.0)

Status: done in 1.43.0 (see the end of this file). Was open. Written 27.11.2026 from the Touch Grass for Mac side, which is already done (touchgrass-mac version 60). This file is the whole brief; nothing else is needed to start.

## Why

Touch Grass for Mac 60 has a **network guard**: a small DNS server on the Mac that blocks proxy (unblocker) and adult sites in every app, not only in the browser. It can only see host names. Tab Guard learns exactly such hosts while browsing (unblocker shells it caught, adult hosts it recognised, the user's own blocklist). Today that knowledge stays in the browser, so the same proxy that Tab Guard caught in Brave still loads in an app or a browser without Tab Guard.

Goal: Tab Guard sends what it learned to the Mac, and takes over what the Mac's own page check found. Both stay local; the only channel is the native messaging connection that already exists for "Connect with Touch Grass".

## What exists

- `extension/src/touchGrass.js` connects to the native host `com.touchgrass.mac` (desktop only, only while **Connect with Touch Grass** is on) and sends a heartbeat `{"t":"hb", ...}`. The Mac answers `{"t":"state","v":1,"unlocked":bool,"until":number,"off":bool}`.
- Learned data in Tab Guard (all in `chrome.storage.local` → `tabguardConfig`):
  - `adultBlock.bypassSites`: proxies Tab Guard caught. Entries are hosts, some with a path (shared hosts like S3 or CloudFront).
  - `adultBlock.extraHosts`: adult hosts added beyond the built-in list.
  - `blocklist`: the user's own hard blocklist.
- `src/bypass.js` `TGBypass.KNOWN`: built-in proxy families. The Mac already has these built in; no need to send them.

## The protocol (already implemented on the Mac)

### Tab Guard → Mac

```json
{"t":"learned","proxy":["fern.example"],"adult":["adult.example"],"blocked":["user-blocked.example"],"families":["changing-subdomains.example"]}
```

- Every key optional; arrays of strings.
- The Mac accepts plain hosts and also `https://host/` or `*.host`; it **drops entries with a path** (they can't be blocked by name) and strips `www.`.
- The Mac only adds, never removes on a later message (several browsers each send their own lists). Sending the full lists each time is fine.
- Size: send at most 20,000 entries in total per message (the Mac's store is capped at 20,000).
- No reply to this message.

### Mac → Tab Guard

The `state` reply to a heartbeat gets an extra key **only when the Mac's list changed** since the last reply on this connection (and once right after connecting):

```json
{"t":"state","v":1,"unlocked":false,"until":0,"off":false,"found":{"proxy":["new-proxy.example"],"adult":["new-adult.example"]}}
```

`found` holds what the Mac's own check found (at most 500 hosts, newest first). Ignore unknown keys, as today.

## What to build in Tab Guard

1. **Send** (in `src/touchGrass.js`):
   - After the connection is up, send one `learned` message with `proxy` = hosts from `bypassSites` (skip entries containing `/`), `adult` = `extraHosts`, `blocked` = `blocklist`.
   - Send again when one of these lists changes (listen to `chrome.storage.onChanged` for `tabguardConfig`), debounced to at most once a minute.
   - Only when the matching protection is on: `proxy` only if the bypass block is on (`bypassOn()` in `background.js`), `adult` only if adult blocking is on. `blocked` always.
2. **Receive**:
   - On a `state` message with `found`: add `found.proxy` to `adultBlock.bypassSites` and `found.adult` to `adultBlock.extraHosts`, only if that protection is on, without duplicates, keeping the existing caps (`bypassSites` is capped at 2,000 today: keep the newest).
   - **Respect removals.** If the user removed a site in Tab Guard, it must not come back from the Mac. Keep a small tombstone list (e.g. `tabguardSyncRemoved`, hosts plus date, 90 days) and skip those hosts when merging `found`. Removing stays a loosening and follows the existing rules in `src/loosen.js`.
   - Mark merged entries as coming from Touch Grass if the settings page shows sources; otherwise no UI change is needed.
3. **Settings page:** under **Connect with Touch Grass**, one line in the existing style, e.g. "Shares learned sites with Touch Grass in both directions." Add it to `extension/assets/i18n.js` in all languages present there.
4. **Docs:** a short paragraph in `docs/touch-grass.md` and `docs/touch-grass.de.md` ("What the connection shares"), a `CHANGELOG.md` entry, version **1.43.0** in the manifests.

## Rules that apply (from CONTRIBUTING.md)

- Everything stays local. The native messaging port is the only channel; no network requests.
- Plain JavaScript, no build step. No `innerHTML` with page data.
- The user sees and controls it: the sync only runs while **Connect with Touch Grass** is on, and adds nothing to a protection that is switched off.
- Android has no native messaging: nothing changes there.

## Acceptance

- With Touch Grass for Mac 60 running and the connection on: a proxy host in `bypassSites` appears in Touch Grass → Settings → Network guard → **Learned**, marked "von Tab Guard", within a minute. Check `~/.touchgrass/learned.json` too.
- A host the Mac's page check found (source "netz" in `learned.json`) appears in Tab Guard's bypass list after the next heartbeat.
- Removing that host in Tab Guard keeps it removed after the next heartbeats.
- Entries with a path stay in Tab Guard and are not sent.
- `scripts/build.sh` and `npx addons-linter dist/tab-guard_v*-firefox.zip` pass; tested unpacked in Chrome or Brave and in Firefox or Zen.

## Mac side, for reference

`coach-kg/touchgrass-mac`: `Sources/TouchGrass/NativeHost.swift` (receives `learned`, adds `found`), `Sources/TGCore/Learned.swift` (merge rules, tested in `Tests/TGCoreTests/NetGuardTests.swift`), plan in `docs/ideas/tab-guard-systemweit.md` (part A).

## Done (1.43.0)

- `src/touchGrass.js`: `learnedMessage()` builds the message (newest first under the 20,000 cap, plain hosts only), sent 1.5 s after connecting and then at most once a minute after list changes. `mergeFound()` adds `found` into `bypassSites` (cap 2,000) and `extraHosts` (cap 5,000) only while that protection is on. Removals are remembered in `tabguardSyncRemoved` for 90 days; entries dropped by a cap don't count as removals.
- Settings: one line under **Connect with Touch Grass**, hidden on Android.
- Docs: touch-grass (EN/DE), privacy policy (EN/DE), README, permissions, store kit.
- Tested with a stand-in native host in Chromium (not with the real Mac app).
