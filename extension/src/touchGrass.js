// touchGrass.js — OPTIONAL, EXPERIMENTAL: link to the Touch Grass Mac app.
//
// Tab Guard works without this. It stays off until the user turns it on under
// Settings → Experimental, which asks the browser for the optional
// "nativeMessaging" permission. Without that permission nothing here runs.
//
// Why it exists: Touch Grass (a separate app, github.com/coach-kg/touchgrass-mac)
// can require that every browser on the Mac runs Tab Guard, and closes the
// browsers that do not. For that it needs a sign of life. Every few seconds
// this sends it:
//   - a random id for this browser profile, made here and kept in local storage
//   - how many windows Tab Guard can see
//   - whether Tab Guard may run in private windows
//   - whether protection is paused, and the version number
// No addresses, no titles, no browsing data. Native messaging only reaches a
// program installed on this computer; nothing goes over the network.

const HOST = "com.touchgrass.mac";
const ID_KEY = "tabguardTouchGrassId";
/** chrome.storage.session, read by the settings page to show the state. */
export const TG_STATUS_KEY = "tabguardTouchGrass";
const BEAT_MS = 4000;
const RETRY_MS = 30000;

let port = null;
let beatTimer = null;
let retryTimer = null;
let isPaused = () => false;

async function permitted() {
  try { return await chrome.permissions.contains({ permissions: ["nativeMessaging"] }); }
  catch (_) { return false; }
}

async function profileId() {
  const got = await chrome.storage.local.get(ID_KEY);
  if (got[ID_KEY]) return got[ID_KEY];
  const id = crypto.randomUUID();
  await chrome.storage.local.set({ [ID_KEY]: id });
  return id;
}

async function windowCount() {
  try { return (await chrome.windows.getAll({ windowTypes: ["normal", "popup", "app", "devtools"] })).length; }
  catch (_) {
    try { return (await chrome.windows.getAll()).length; } catch (_) { return 0; }
  }
}

async function privateAllowed() {
  try { return !!(await chrome.extension.isAllowedIncognitoAccess()); } catch (_) { return false; }
}

function setStatus(state, extra = {}) {
  try { chrome.storage.session.set({ [TG_STATUS_KEY]: { state, ...extra, at: Date.now() } }); } catch (_) {}
}

async function beat() {
  if (!port) return;
  try {
    port.postMessage({
      t: "hb",
      id: await profileId(),
      windows: await windowCount(),
      private: await privateAllowed(),
      paused: !!isPaused(),
      v: chrome.runtime.getManifest().version,
    });
  } catch (_) { /* the port closed between checks; onDisconnect handles it */ }
}

function retryLater() {
  clearTimeout(retryTimer);
  retryTimer = setTimeout(connect, RETRY_MS);
}

async function connect() {
  clearTimeout(retryTimer);
  if (port) return;
  if (!(await permitted())) { setStatus("off"); return; }
  try { port = chrome.runtime.connectNative(HOST); }
  catch (_) { port = null; setStatus("missing"); retryLater(); return; }
  port.onMessage.addListener((m) => {
    if (m && m.t === "state") setStatus("connected", { macUnlocked: !!m.unlocked });
  });
  port.onDisconnect.addListener(() => {
    void chrome.runtime.lastError;   // read it, or Chrome reports it as unchecked
    port = null;
    clearInterval(beatTimer);
    beatTimer = null;
    setStatus("missing");            // Touch Grass not installed, or it closed
    retryLater();
  });
  beat();
  beatTimer = setInterval(beat, BEAT_MS);
}

function disconnect() {
  clearInterval(beatTimer);
  clearTimeout(retryTimer);
  beatTimer = null;
  if (port) { try { port.disconnect(); } catch (_) {} }
  port = null;
  setStatus("off");
}

/** Called once from background.js. `paused` reports whether protection is paused. */
export function startTouchGrassLink(paused) {
  if (typeof paused === "function") isPaused = paused;
  chrome.permissions?.onAdded?.addListener((p) => {
    if (p.permissions?.includes("nativeMessaging")) connect();
  });
  chrome.permissions?.onRemoved?.addListener((p) => {
    if (p.permissions?.includes("nativeMessaging")) disconnect();
  });
  // A new or closed window changes the count Touch Grass compares against.
  chrome.windows?.onCreated?.addListener(() => { beat(); });
  chrome.windows?.onRemoved?.addListener(() => { beat(); });
  // After the browser restarts the worker, reconnect.
  chrome.alarms.create("tabguard-touchgrass", { periodInMinutes: 1 });
  chrome.alarms.onAlarm.addListener((a) => { if (a.name === "tabguard-touchgrass") connect(); });
  connect();
}
