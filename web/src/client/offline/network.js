import { isNativeApp } from '../native/platform';

// Is there a connection, and are offline features on?
//
// Offline features (Download, saved copies, the Offline bar) are for the
// iPhone app. On the website they stay off — unless turned on for testing in
// a browser, from the developer console:
//
//   offlineTest.on()            offline features on, as in the app
//   offlineTest.noConnection()  act as if there's no connection
//   offlineTest.connection()    connection back
//   offlineTest.off()           back to the normal website
//
// The connection comes from the browser: navigator.onLine, and its "online" /
// "offline" events when it changes. (In the iPhone app that's the phone's
// Wi-Fi/cellular state.)
const FEATURES_KEY = 'offline-test';
const NO_CONNECTION_KEY = 'offline-test-no-connection';

const readFlag = (key) => { try { return localStorage.getItem(key) === '1'; } catch (e) { return false; } };
const writeFlag = (key, on) => { try { if (on) localStorage.setItem(key, '1'); else localStorage.removeItem(key); } catch (e) { /* no storage */ } };

/** Are offline features on? (Always in the app; in a browser only for testing.) */
export const offlineEnabled = () => isNativeApp() || readFlag(FEATURES_KEY);

const listeners = new Set();
let online = computeOnline();

function computeOnline() {
    const browserOnline = typeof navigator === 'undefined' || navigator.onLine !== false;
    return browserOnline && !(offlineEnabled() && readFlag(NO_CONNECTION_KEY));
}

function update() {
    const next = computeOnline();
    if (next === online) return;
    online = next;
    listeners.forEach((fn) => fn(online));
}

/** Is there a connection right now? */
export const isOnline = () => online;

/**
 * Call `fn(online)` whenever the connection comes or goes.
 * @returns {() => void} stops listening
 */
export function onConnectionChange(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
}

if (typeof window !== 'undefined') {
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    // The console switches described above (reloading applies "on"/"off").
    window.offlineTest = {
        on() { writeFlag(FEATURES_KEY, true); window.location.reload(); },
        off() { writeFlag(FEATURES_KEY, false); writeFlag(NO_CONNECTION_KEY, false); window.location.reload(); },
        noConnection() { writeFlag(NO_CONNECTION_KEY, true); update(); },
        connection() { writeFlag(NO_CONNECTION_KEY, false); update(); },
    };
}
