// Turns on the site's service worker (src/sw.js), which lets the site open
// with no internet connection, for My Projects offline.
//
// Only where it's wanted (decided: My Projects is on myremembrancer.com, on
// computers): a built site (not the dev server), on myremembrancer.com (or
// localhost with ?site=remembrancer), not the iPhone app (it has its own
// offline machinery).
//
// Elsewhere, or with localStorage "no-service-worker" = "1" (a switch for
// one computer if it ever misbehaves), any service worker this site had is
// removed, so nothing stays behind.
import { isNativeApp } from '../native/platform';
import { site } from './site';

const OFF_KEY = 'no-service-worker';

const switchedOff = () => { try { return localStorage.getItem(OFF_KEY) === '1'; } catch (e) { return false; } };

/** Called once at start-up (main.jsx). */
export function installServiceWorker() {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
    const wanted = import.meta.env.PROD && !isNativeApp() && site.projects && !switchedOff();
    if (wanted) {
        // After the page has loaded, so it never slows the first visit down.
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('/sw.js').catch((err) => console.log('service worker not installed:', err && err.message));
        });
        return;
    }
    navigator.serviceWorker.getRegistrations()
        .then((all) => all.forEach((registration) => registration.unregister()))
        .catch(() => {});
}
