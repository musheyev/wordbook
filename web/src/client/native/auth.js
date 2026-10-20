import { isNativeApp, siteUrl } from './platform';
import { COGNITO_DOMAIN, CLIENT_ID, SCOPE } from '../utils/cognito';

// Signing in inside the iPhone app (the website uses cookies instead; see
// api/routes/authRouter.js, "The iPhone app's sign-in").
//
//   Log in / Sign up   opens Cognito's login page in Apple's sign-in sheet
//                      (the app's own WebAuth plugin, mobile/ios/App/App/
//                      WebAuthPlugin.swift), which hands back
//                      remembrancer://auth?code=… when it's done. It's private:
//                      it keeps no cookies, so after Log out the next Log in
//                      asks for the password. The code and its PKCE verifier go
//                      to /api/auth/app/token for tokens. (If the plugin is
//                      missing, an ordinary in-app browser sheet is used, and
//                      the answer arrives through the app's address instead.)
//   Tokens             kept in the iPhone's Keychain (secure storage), so the
//                      app stays signed in across launches, for as long as the
//                      refresh token lasts (30 days).
//   Every request      carries the ID token in X-Id-Token (installNativeAuth
//                      for axios, apiFetch for fetch); it's renewed a minute
//                      before it expires.
//   Log out            revokes the refresh token and forgets both.
//
// Everything here does nothing on the website: the Capacitor plugins are
// loaded only inside the app.
export const APP_REDIRECT_URI = 'remembrancer://auth';
const TOKEN_HEADER = 'X-Id-Token';
const ID_KEY = 'id_token';
const REFRESH_KEY = 'refresh_token';
const PENDING_KEY = 'pending-sign-in'; // { state, verifier } while the login sheet is open

let plugins = null;
const loadPlugins = () => {
    if (!plugins) {
        plugins = Promise.all([
            import('@capacitor/app'),
            import('@capacitor/browser'),
            import('@aparajita/capacitor-secure-storage'),
        ]).then(async ([{ App }, { Browser }, { SecureStorage, KeychainAccess }]) => {
            // Readable once the phone has been unlocked after a restart, so
            // read-aloud can still fetch audio with the screen locked.
            await SecureStorage.setDefaultKeychainAccess(KeychainAccess.afterFirstUnlock);
            return { App, Browser, SecureStorage };
        });
    }
    return plugins;
};

let pending = null; // { state, verifier } of the sign-in in progress
let tokens = null; // { id, refresh } once read from the Keychain
const loadTokens = async () => {
    if (!tokens) {
        const { SecureStorage } = await loadPlugins();
        tokens = {
            id: await SecureStorage.getItem(ID_KEY),
            refresh: await SecureStorage.getItem(REFRESH_KEY),
        };
    }
    return tokens;
};
const saveTokens = async (id, refresh) => {
    const { SecureStorage } = await loadPlugins();
    tokens = { id: id || null, refresh: refresh || null };
    for (const [key, value] of [[ID_KEY, tokens.id], [REFRESH_KEY, tokens.refresh]]) {
        if (value) await SecureStorage.setItem(key, value);
        else await SecureStorage.removeItem(key);
    }
};

// Seconds until a JWT expires (its payload's `exp`); 0 if unreadable.
const secondsLeft = (jwt) => {
    try {
        const payload = JSON.parse(atob(jwt.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
        return payload.exp - Date.now() / 1000;
    } catch (e) {
        return 0;
    }
};

const postJson = async (path, body) => {
    const res = await fetch(siteUrl(path), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
    });
    return { ok: res.ok, status: res.status, data: await res.json().catch(() => ({})) };
};

// Requests arriving together while the token is being renewed share one renewal.
let renewing = null;
const renew = () => {
    if (!renewing) {
        renewing = (async () => {
            try {
                const res = await postJson('/api/auth/app/refresh', { refresh_token: tokens.refresh });
                if (res.ok) await saveTokens(res.data.id_token, res.data.refresh_token || tokens.refresh);
                else if (res.status === 401) await saveTokens(null, null); // expired or revoked: signed out
            } catch (e) {
                // No connection: keep what we have (offline reading still works).
            }
        })().finally(() => { renewing = null; });
    }
    return renewing;
};

// The ID token to send with a request, renewed first if it's (nearly)
// expired; null when signed out, and always null on the website.
export async function appIdToken() {
    if (!isNativeApp()) return null;
    const t = await loadTokens();
    if (t.refresh && (!t.id || secondsLeft(t.id) < 60)) await renew();
    return tokens.id;
}

// fetch() for our API (paths like '/api/tts'): the full address and the
// token in the app, plain fetch on the website.
export async function apiFetch(path, init = {}) {
    const token = await appIdToken();
    if (!token) return fetch(siteUrl(path), init);
    const headers = new Headers(init.headers || {});
    headers.set(TOKEN_HEADER, token);
    return fetch(siteUrl(path), { ...init, headers });
}

// A random URL-safe string, and its SHA-256 (PKCE's S256 challenge).
const randomString = () => {
    const bytes = crypto.getRandomValues(new Uint8Array(32));
    return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const sha256 = async (text) => {
    const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
    return btoa(String.fromCharCode(...hash)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

// Open Cognito's login ('login') or sign-up ('signup') page in the in-app
// browser sheet. Its answer arrives at onAppUrl.
export async function nativeSignIn(action = 'login') {
    const { Browser } = await loadPlugins();
    const state = randomString();
    const verifier = randomString();
    try { localStorage.setItem(PENDING_KEY, JSON.stringify({ state, verifier })); } catch (e) { /* kept below */ }
    pending = { state, verifier };
    // redirect_uri raw, like the website's links (utils/cognito.js).
    const url = `${COGNITO_DOMAIN}/${action}?client_id=${CLIENT_ID}&response_type=code&scope=${SCOPE}`
        + `&redirect_uri=${APP_REDIRECT_URI}&state=${state}`
        + `&code_challenge=${await sha256(verifier)}&code_challenge_method=S256`;
    try {
        const { registerPlugin } = await import('@capacitor/core');
        const WebAuth = registerPlugin('WebAuth');
        const result = await WebAuth.signIn({ url, callbackScheme: APP_REDIRECT_URI.split(':')[0], ephemeral: true });
        await onAppUrl(result.url);
    } catch (err) {
        if (err && err.code === 'CANCELLED') { pending = null; return; } // closed without signing in
        if (err && err.code === 'UNIMPLEMENTED') { await Browser.open({ url }); return; } // older app build
        window.alert('Signing in didn’t work. Please try again.');
    }
}

// remembrancer://auth?code=…&state=… : finish signing in.
async function onAppUrl(url) {
    if (!url || !url.startsWith(APP_REDIRECT_URI)) return;
    const { Browser } = await loadPlugins();
    Browser.close().catch(() => {});
    const params = new URL(url).searchParams;
    let expected = pending;
    try { expected = expected || JSON.parse(localStorage.getItem(PENDING_KEY)); } catch (e) { /* none */ }
    pending = null;
    try { localStorage.removeItem(PENDING_KEY); } catch (e) { /* fine */ }
    const code = params.get('code');
    if (!code || !expected || params.get('state') !== expected.state) return; // cancelled, or not ours
    const res = await postJson('/api/auth/app/token', { code, code_verifier: expected.verifier });
    if (!res.ok) {
        window.alert('Signing in didn’t work. Please try again.');
        return;
    }
    await saveTokens(res.data.id_token, res.data.refresh_token);
    window.location.reload(); // start over, signed in
}

// Log out: revoke the refresh token (if we can reach the server) and forget
// both tokens.
export async function nativeSignOut() {
    const t = await loadTokens();
    if (t.refresh) await postJson('/api/auth/app/logout', { refresh_token: t.refresh }).catch(() => {});
    await saveTokens(null, null);
}

// Called once at start-up (main.jsx). In the app: every API request carries
// the token, the website's Log in / Sign up links open the login sheet, and
// the app listens for the login's answer. On the website: nothing.
export function installNativeAuth(api) {
    if (!isNativeApp()) return;
    api.interceptors.request.use(async (config) => {
        const token = await appIdToken();
        if (token) config.headers.set(TOKEN_HEADER, token);
        return config;
    });
    document.addEventListener('click', (e) => {
        const link = e.target.closest && e.target.closest(`a[href^="${COGNITO_DOMAIN}/"]`);
        if (!link) return;
        e.preventDefault();
        nativeSignIn(link.href.includes('/signup') ? 'signup' : 'login');
    }, true);
    loadPlugins().then(async ({ App }) => {
        App.addListener('appUrlOpen', (e) => onAppUrl(e.url));
        // The login's answer can also be what (re)started the app.
        const launch = await App.getLaunchUrl();
        if (launch) onAppUrl(launch.url);
    });
}
