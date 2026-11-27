# Permissions, and why

Tab Guard asks for as little as it can. Nothing it reads leaves the device.

| Permission | Why |
|---|---|
| `storage` | Your settings, lists (trusted sites, blocklist, redirects, imported list) and counters, in the browser's local extension storage. |
| `tabs` | Reads the address of a tab to decide whether a site is trusted, watched, redirected or blocked, and counts tabs of one site opened in a short time (tab circuit breaker). When a page refuses to be left (“Leave site?”), the tab is replaced by the block screen. |
| `alarms` | A once-a-minute timer that lets the pressure ease off and ends pauses, locks and delayed changes on time. |
| `notifications` | A local notice when a site gets locked or protection resumes after a pause. |
| `nativeMessaging` (optional, experimental) | Not requested at install. Asked for only when the user switches on “Connect with Touch Grass” under Settings → Experimental. Lets Tab Guard tell the Touch Grass app on the same computer that it is running (random profile id, window count, private-window permission, paused or not, version). From 1.43.0 it also exchanges the host names on its block lists (caught proxies, learned adult sites, the user's blocklist) with Touch Grass for Mac 60+, so they are blocked in other apps too; only into protections that are on, removals stay removed. No paths, no history, nothing over the network. Switching it off removes the permission. Code: `extension/src/touchGrass.js`. |
| `http://127.0.0.1/*` (optional, experimental, Firefox for Android only) | Not requested at install. Asked for only when the user switches on “Connect with Touch Grass” in Firefox for Android, which has no native messaging. Lets Tab Guard tell the Touch Grass app on the same phone, at `127.0.0.1:47823`, that it is running (random profile id, private-tab permission, paused or not and until when, version). The address is the phone itself; nothing leaves it. Switching it off removes the permission. Code: `extension/src/touchGrass.js`. |
| Content scripts on `http://*/*` and `https://*/*`, in all frames | Doomscrolling and filter workarounds can happen on any site and inside embedded frames (also ones written by script), so the content scripts run there to notice scrolling, feeds, short videos and adult or proxy pages and to apply the friction (pause, grey, blur, block). There are no `host_permissions`. |

**Remote code:** none. All scripts are in the package; the extension makes no network requests of its own.

**Single purpose (Chrome Web Store):** Tab Guard reduces compulsive browsing by noticing doomscrolling, rapid tab-opening and short-form video and adding local friction, entirely on the user's device.

**Data (Chrome Web Store "Privacy practices"):** web history, user activity and website content are processed on the device only, in the moment, and never stored remotely or sent anywhere. No data is sold, shared or used for anything but the extension's own features.
