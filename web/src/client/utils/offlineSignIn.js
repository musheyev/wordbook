// Starting the site with no internet connection (My Projects offline,
// myremembrancer.com on a computer).
//
// At start-up the app asks the server who's signed in (actions:
// fetchCurrentUser). With no connection there's no answer, and the page
// would stay on "Loading…". So the last answer is remembered in this browser,
// and used when the server can't be reached at all. As soon as the
// connection is back the app asks again, so a sign-in that ended meanwhile
// still ends.
//
// Only a "who" (the user name, and whether an admin), nothing secret: the
// server still checks the real sign-in on every request. Forgotten on
// sign-out, and when the server says nobody is signed in.
//
// Not in the iPhone app (it keeps its own sign-in, native/auth.js) and not
// on makeyourwordbook.com (no My Projects there).
import { isNativeApp } from '../native/platform';
import { site } from './site';

const KEY = 'signed-in-offline';

const wanted = () => site.projects && !isNativeApp();

/** Keep the server's answer to "who's signed in?" ({ username, isAdmin } or nothing). */
export function rememberSignedIn(data) {
    if (!wanted()) return;
    try {
        const username = data && typeof data === 'object' ? data.username : data;
        if (username) localStorage.setItem(KEY, JSON.stringify({ username, isAdmin: !!(data && data.isAdmin) }));
        else localStorage.removeItem(KEY);
    } catch (e) { /* storage blocked: offline start-up just won't work */ }
}

/** The remembered answer, or null. */
export function signedInOffline() {
    if (!wanted()) return null;
    try {
        const saved = JSON.parse(localStorage.getItem(KEY) || 'null');
        return saved && saved.username ? saved : null;
    } catch (e) {
        return null;
    }
}

/** Forget it (signing out, deleting the account). */
export function forgetSignedIn() {
    try { localStorage.removeItem(KEY); } catch (e) { /* nothing to forget */ }
}
