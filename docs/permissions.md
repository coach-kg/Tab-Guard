# Permissions, and why

Tab Guard asks for as little as it can. Nothing it reads leaves the device.

| Permission | Why |
|---|---|
| `storage` | Your settings, lists (trusted sites, blocklist, redirects, imported list) and counters, in the browser's local extension storage. |
| `tabs` | Reads the address of a tab to decide whether a site is trusted, watched, redirected or blocked, and counts tabs of one site opened in a short time (tab circuit breaker). |
| `alarms` | A once-a-minute timer that lets the pressure ease off and ends pauses, locks and delayed changes on time. |
| `notifications` | A local notice when a site gets locked or protection resumes after a pause. |
| Content scripts on `http://*/*` and `https://*/*` | Doomscrolling can happen on any site, so the content scripts run everywhere to notice scrolling, feeds and short videos and to apply the friction (pause, grey, blur, block). There are no `host_permissions`. |

**Remote code:** none. All scripts are in the package; the extension makes no network requests of its own.

**Single purpose (Chrome Web Store):** Tab Guard reduces compulsive browsing by noticing doomscrolling, rapid tab-opening and short-form video and adding local friction, entirely on the user's device.

**Data (Chrome Web Store "Privacy practices"):** web history, user activity and website content are processed on the device only, in the moment, and never stored remotely or sent anywhere. No data is sold, shared or used for anything but the extension's own features.
