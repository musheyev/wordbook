import { isNativeApp } from '../native/platform';

// Where you were in the iPhone app, so it opens there again.
//
// iOS closes apps that sit in the background for a while; the next time,
// the app starts from the beginning (the address "/"), which used to mean My
// Notebooks. Now every screen you go to is remembered (rememberPlace, called
// by App.js), and on opening, the home address sends you back there instead
// (placeToRestore, in routes.jsx), once. With the saved copies shown first
// (offline/apiCache.js, requestSavedFirst) the screen appears at once.
//
// Only places worth coming back to are remembered: My Notebooks, a notebook
// and its open note, the Inbox, Tags, Quizzes, Bookmarks, the Words search.
// Not More, Privacy, Support, sign-in or admin pages.
//
// Kept in localStorage (the web view's small key-value storage on the
// phone), as "app.lastPlace". Forgotten on log out (offline/downloads.js,
// clearOfflineData). The website doesn't use any of this: a browser tab
// remembers its own address.
const KEY = 'app.lastPlace';
const PLACES = /^\/(account|wordbooks|(?:wordbook|notebook)\/.+|inbox(\/.+)?|tags|quizzes|bookmarks|words|note\/.+)$/;

let restored = false; // placeToRestore has been asked this visit

/**
 * Remember this address if it's a place to come back to (app only).
 * @param {string} pathname e.g. "/wordbook/Spanish/card/3f2a…"
 * @param {string} [search] e.g. "?search=hola"
 */
export function rememberPlace(pathname, search = '') {
    if (!isNativeApp() || !PLACES.test(pathname)) return;
    try { localStorage.setItem(KEY, pathname + search); } catch (e) { /* no storage: start on My Notebooks */ }
}

/**
 * The place to open on, the first time this is asked since the app opened
 * (app only): the last place remembered, or null. Later calls (going Home
 * on purpose) get null, so Home still goes Home.
 * @returns {string|null}
 */
export function placeToRestore() {
    if (restored || !isNativeApp()) return null;
    restored = true;
    try {
        const place = localStorage.getItem(KEY);
        return place && PLACES.test(place.split('?')[0]) ? place : null;
    } catch (e) {
        return null;
    }
}

/** Forget the place (log out). */
export function forgetPlace() {
    try { localStorage.removeItem(KEY); } catch (e) { /* nothing kept */ }
}
