// touchGrass.js — OPTIONAL, EXPERIMENTAL: link to the Touch Grass apps.
//
// Tab Guard works without this. It stays off until the user turns it on under
// Settings → Experimental, which asks the browser for one optional permission:
//   - on a computer "nativeMessaging", to reach Touch Grass for Mac
//   - on Android the host "http://127.0.0.1/*", to reach Touch Grass for
//     Android on the same phone (Firefox for Android has no native messaging)
// Without that permission nothing here runs.
//
// Why it exists: Touch Grass (separate apps, github.com/coach-kg/touchgrass-mac
// and github.com/coach-kg/TouchGrassBlocker) can require Tab Guard in the
// browser and blocks browsers without it. For that it needs a sign of life:
//   - a random id for this browser profile, made here and kept in local storage
//   - how many windows Tab Guard can see (computer only)
//   - whether Tab Guard may run in private windows
//   - whether protection is paused, until when, and the version number
// No addresses, no titles, no browsing data. Native messaging only reaches a
// program installed on this computer. On Android the beat goes to 127.0.0.1,
// the phone itself; nothing leaves the device.

const HOST = "com.touchgrass.mac";
const ID_KEY = "tabguardTouchGrassId";
/** chrome.storage.session, read by the settings page to show the state. */
export const TG_STATUS_KEY = "tabguardTouchGrass";
/** chrome.storage.local: content scripts pulse only while this is true (Android). */
export const TG_PULSE_KEY = "tabguardTouchGrassPulse";
const BEAT_MS = 4000;
const RETRY_MS = 30000;

// Android: Touch Grass listens on the phone itself.
const ANDROID_URL = "http://127.0.0.1:47823/tabguard/beat";
export const ANDROID_ORIGINS = ["http://127.0.0.1/*"];
const ANDROID_MIN_GAP_MS = 10000;   // at most one beat per 10 s, however many tabs pulse
const ANDROID_TIMEOUT_MS = 3000;

let port = null;
let beatTimer = null;
let retryTimer = null;
let isPaused = () => false;
let pausedUntil = () => 0;
let android = null;                 // null until known
let lastAndroidBeat = 0;
let androidInFlight = false;

async function isAndroid() {
  if (android !== null) return android;
  try { android = (await chrome.runtime.getPlatformInfo()).os === "android"; }
  catch (_) { android = false; }
  return android;
}

async function permitted() {
  try {
    if (await isAndroid()) return await chrome.permissions.contains({ origins: ANDROID_ORIGINS });
    return await chrome.permissions.contains({ permissions: ["nativeMessaging"] });
  } catch (_) { return false; }
}

async function profileId() {
  const got = await chrome.storage.local.get(ID_KEY);
  if (got[ID_KEY]) return got[ID_KEY];
  const id = crypto.randomUUID();
  await chrome.storage.local.set({ [ID_KEY]: id });
  return id;
}

async function windowCount() {
  if (!chrome.windows?.getAll) return 0;   // Firefox for Android has no windows API
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

function setPulse(on) {
  try { chrome.storage.local.set({ [TG_PULSE_KEY]: !!on }); } catch (_) {}
}

// ---- computer: native messaging ---------------------------------------------

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
  if (await isAndroid()) {
    const ok = await permitted();
    setPulse(ok);
    if (!ok) { setStatus("off"); return; }
    androidBeat(true);
    return;
  }
  if (port) return;
  if (!(await permitted())) { setStatus("off"); return; }
  try { port = chrome.runtime.connectNative(HOST); }
  catch (e) { port = null; setStatus("missing", { error: String(e && e.message || e).slice(0, 200) }); retryLater(); return; }
  port.onMessage.addListener((m) => {
    if (m && m.t === "state") setStatus("connected", { macUnlocked: !!m.unlocked });
  });
  port.onDisconnect.addListener(() => {
    // the browser's own reason ("host not found", "access forbidden", "exited")
    const err = chrome.runtime.lastError ? String(chrome.runtime.lastError.message || "") : "";
    port = null;
    clearInterval(beatTimer);
    beatTimer = null;
    setStatus("missing", err ? { error: err.slice(0, 200) } : {});   // Touch Grass not installed, or it closed
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
  setPulse(false);
  setStatus("off");
}

// ---- Android: a small local HTTP call ---------------------------------------
// Firefox for Android puts the background to sleep after a short while, so a
// timer here alone would stop. Instead every visible page pulses every 15 s
// (content.js) and the pulse wakes this up. A page is only visible in the
// browser that is in front, so the beat comes from Firefox while it is in use.

async function androidBeat(force = false) {
  const now = Date.now();
  if (androidInFlight) return;
  if (!force && now - lastAndroidBeat < ANDROID_MIN_GAP_MS) return;
  if (!(await permitted())) { setPulse(false); setStatus("off"); return; }
  lastAndroidBeat = now;
  androidInFlight = true;
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), ANDROID_TIMEOUT_MS);
  try {
    const body = JSON.stringify({
      t: "hb",
      id: await profileId(),
      private: await privateAllowed(),
      paused: !!isPaused(),
      pausedUntil: Number(pausedUntil()) || 0,
      v: chrome.runtime.getManifest().version,
      browser: "Firefox",
    });
    const r = await fetch(ANDROID_URL, {
      method: "POST", body, signal: ctl.signal,
      headers: { "Content-Type": "application/json" },
      cache: "no-store", credentials: "omit",
    });
    if (r.ok) setStatus("connected", { android: true });
    else setStatus("missing", { android: true, error: "HTTP " + r.status });
  } catch (e) {
    setStatus("missing", { android: true });   // Touch Grass not installed, or not running
  } finally {
    clearTimeout(timer);
    androidInFlight = false;
  }
}

/** A visible page pulsed (content.js). Only does anything on Android. */
export async function touchGrassPulse() {
  if (!(await isAndroid())) return;
  androidBeat(false);
}

function matchesAndroid(p) {
  return !!p?.origins?.some((o) => ANDROID_ORIGINS.includes(o));
}

/**
 * Called once from background.js. `paused` reports whether protection is
 * paused, `until` when that pause ends (ms, 0 = no end set).
 */
export function startTouchGrassLink(paused, until) {
  if (typeof paused === "function") isPaused = paused;
  if (typeof until === "function") pausedUntil = until;
  chrome.permissions?.onAdded?.addListener((p) => {
    if (p.permissions?.includes("nativeMessaging") || matchesAndroid(p)) connect();
  });
  chrome.permissions?.onRemoved?.addListener((p) => {
    if (p.permissions?.includes("nativeMessaging") || matchesAndroid(p)) disconnect();
  });
  // A new or closed window changes the count Touch Grass compares against.
  chrome.windows?.onCreated?.addListener(() => { beat(); });
  chrome.windows?.onRemoved?.addListener(() => { beat(); });
  // After the browser restarts the worker, reconnect.
  chrome.alarms.create("tabguard-touchgrass", { periodInMinutes: 1 });
  chrome.alarms.onAlarm.addListener((a) => { if (a.name === "tabguard-touchgrass") connect(); });
  connect();
}
