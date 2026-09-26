/**
 * Login sessions: the cookies that keep a user signed in, and the middleware
 * that renews them so a login lasts 30 days instead of 1 hour.
 *
 * Background
 * ----------
 * When a user signs in through Cognito, the API receives two tokens:
 *
 *   - ID token      Proves who the user is. It's a JWT (JSON Web Token): three
 *                   base64 parts, header.payload.signature. The payload holds
 *                   "claims" such as the username and `exp` (expiry time, in
 *                   seconds since 1970). Cognito signs it with a private key;
 *                   anyone can *read* the payload, but only Cognito can
 *                   produce a valid signature, so a route that verifies the
 *                   signature (auth.js decodeToken) knows it wasn't forged.
 *                   Every route reads it from the `id_token` cookie. Cognito
 *                   makes it expire after 60 minutes — short, so a leaked
 *                   token is only useful briefly.
 *   - Refresh token Can be exchanged at Cognito for a new ID token, without a
 *                   password, for as long as the Cognito app client allows
 *                   (30 days). Unlike the ID token it's opaque — not a JWT we
 *                   can read — and it's useless on its own: only Cognito
 *                   accepts it, and only together with our client secret.
 *                   Stored in the `refresh_token` cookie and only ever sent
 *                   to Cognito — routes never read it.
 *
 *   This split (short-lived access proof + long-lived renewal token) is the
 *   standard OAuth 2.0 pattern: you stay logged in for weeks, but the token
 *   that travels with every request is only good for an hour.
 *
 * Lifecycle
 * ---------
 *   1. Login     authRouter's callback stores both cookies
 *                (setIdTokenCookie, setRefreshTokenCookie).
 *   2. Requests  refreshSession runs before every route. While the ID token is
 *                valid it does nothing. Once it's missing or about to expire,
 *                it trades the refresh token for a new ID token, so the route
 *                sees a logged-in user and the browser gets the new cookie.
 *   3. Expiry    When Cognito rejects the refresh token (30 days passed, or it
 *                was revoked), refreshSession clears both cookies and the user
 *                is logged out.
 *   4. Logout    authRouter's /logout calls revokeRefreshToken, then
 *                clearSessionCookies.
 *
 * Both cookies are httpOnly (page scripts can't read them), SameSite=Lax, and
 * Secure whenever the backend runs on HTTPS (production).
 */
const axios = require("axios");
const jwt = require("jsonwebtoken");
const log = require("./logger");

const COGNITO_DOMAIN = process.env.COGNITO_DOMAIN || "https://auth.musheye.com";
const COGNITO_CLIENT_ID = process.env.COGNITO_CLIENT_ID || "31i8vt5m567ch5ciedmeskpk67";
const COGNITO_CLIENT_SECRET = process.env.COGNITO_CLIENT_SECRET;
const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:4000";

/** Lifetime of the refresh cookie. Keep in step with the Cognito app client's refresh token validity. */
const REFRESH_TOKEN_DAYS = Number(process.env.REFRESH_TOKEN_DAYS) || 30;

/** Renew this many seconds before the ID token expires, so it can't expire while a request is being handled. */
const EXPIRY_MARGIN_SECONDS = 60;

const ID_COOKIE = "id_token";
const REFRESH_COOKIE = "refresh_token";

/**
 * Options shared by both session cookies. Each flag closes a specific attack:
 *
 *   httpOnly  JavaScript on the page can't read the cookie (document.cookie
 *             doesn't show it). If an attacker ever got script into the page
 *             (XSS), they still couldn't steal the tokens.
 *   secure    The browser only sends the cookie over HTTPS, so it can't be
 *             sniffed on an open Wi-Fi network. Off only for local development
 *             over http://localhost, where the browser would otherwise refuse
 *             to store it.
 *   sameSite  "lax": the cookie isn't sent when another site makes a hidden
 *             request to our API (e.g. a form on evil.com posting to
 *             /wordbook/delete), which blocks cross-site request forgery
 *             (CSRF). It *is* sent when the user follows a normal link to us,
 *             which the Cognito login redirect relies on.
 *   path      "/" sends the cookies with every request to the site, both
 *             locally and behind CloudFront's /api prefix.
 */
const baseCookieOptions = {
    httpOnly: true,
    secure: BACKEND_URL.startsWith("https://"),
    sameSite: "lax",
    path: "/",
};

/**
 * Request headers for Cognito's /oauth2/token and /oauth2/revoke endpoints.
 *
 * Our app is a "confidential client" in OAuth terms: it has a client secret,
 * kept on the server (never shipped to the browser). Cognito requires that
 * secret before it will hand out tokens, which is why a stolen refresh token
 * alone is useless. HTTP Basic auth is the standard way to send it:
 * "Basic " + base64("client_id:client_secret"). Base64 is an encoding, not
 * encryption — the protection comes from HTTPS.
 *
 * @returns {object} axios headers
 */
function clientAuthHeader() {
    const credentials = Buffer.from(`${COGNITO_CLIENT_ID}:${COGNITO_CLIENT_SECRET || ""}`).toString("base64");
    return {
        "content-type": "application/x-www-form-urlencoded",
        authorization: `Basic ${credentials}`,
    };
}

/**
 * Store the ID token in the `id_token` cookie. The cookie expires when the
 * token does, so the browser drops it at that moment — refreshSession then
 * sees it missing and renews it.
 *
 * Called at login (authRouter) and after every refresh (refreshSession).
 *
 * @param {import("express").Response} res
 * @param {string} idToken Cognito ID token (a JWT)
 */
function setIdTokenCookie(res, idToken) {
    const decoded = jwt.decode(idToken);
    const expires = decoded && decoded.exp ? new Date(decoded.exp * 1000) : undefined;
    res.cookie(ID_COOKIE, idToken, { ...baseCookieOptions, expires });
}

/**
 * Store the refresh token in the `refresh_token` cookie for
 * REFRESH_TOKEN_DAYS. This cookie is what keeps the user logged in past the
 * ID token's first hour.
 *
 * Called at login (authRouter), and after a refresh only if Cognito issued a
 * new refresh token (which happens only when refresh token rotation is on).
 *
 * @param {import("express").Response} res
 * @param {string} refreshToken Cognito refresh token (opaque string)
 */
function setRefreshTokenCookie(res, refreshToken) {
    res.cookie(REFRESH_COOKIE, refreshToken, {
        ...baseCookieOptions,
        maxAge: REFRESH_TOKEN_DAYS * 24 * 60 * 60 * 1000,
    });
}

/**
 * Log the user out in the browser by deleting both session cookies.
 *
 * Called at logout, when a refresh fails, and when /current_user finds an
 * invalid ID token.
 *
 * @param {import("express").Response} res
 */
function clearSessionCookies(res) {
    res.clearCookie(ID_COOKIE, baseCookieOptions);
    res.clearCookie(REFRESH_COOKIE, baseCookieOptions);
    // Cookies from before this change were set without an explicit path, which
    // behind CloudFront (/api/auth) defaulted to /api.
    res.clearCookie(ID_COOKIE, { path: "/api" });
}

/**
 * Decide whether the ID token should be renewed: true when it's absent,
 * unreadable, or expires within EXPIRY_MARGIN_SECONDS.
 *
 * This only reads the token's expiry time; it doesn't check the signature.
 * That's deliberate: this decides *when to refresh*, and the routes still
 * verify the token properly before trusting it (auth.js decodeToken).
 *
 * @param {string|undefined} idToken value of the `id_token` cookie
 * @returns {boolean}
 */
function idTokenNeedsRefresh(idToken) {
    if (!idToken) return true;
    const decoded = jwt.decode(idToken);
    if (!decoded || !decoded.exp) return true;
    return decoded.exp - Date.now() / 1000 < EXPIRY_MARGIN_SECONDS;
}

/**
 * Refreshes currently waiting on Cognito, keyed by refresh token. When a page
 * loads just after the ID token expired, several API requests arrive at once;
 * this lets them share one Cognito call instead of each making their own.
 *
 * How it works: the map stores the *promise* of the Cognito response, not the
 * response itself. The first request creates the promise and stores it; the
 * others find it in the map and simply await the same promise. When it
 * settles (success or failure), `.finally` removes it, so the next expiry
 * starts fresh. This "share the in-flight promise" trick is a common way to
 * de-duplicate concurrent work in JavaScript.
 */
const refreshesInFlight = new Map();

/**
 * Ask Cognito for a new ID token in exchange for a refresh token
 * (the OAuth "refresh_token" grant).
 *
 * @param {string} refreshToken
 * @returns {Promise<{id_token: string, access_token: string, refresh_token?: string}>}
 *   Cognito's token response. Rejects if Cognito refuses the refresh token
 *   (expired or revoked) or can't be reached.
 */
function exchangeRefreshToken(refreshToken) {
    if (refreshesInFlight.has(refreshToken)) {
        return refreshesInFlight.get(refreshToken);
    }

    const body = new URLSearchParams({
        grant_type: "refresh_token",
        client_id: COGNITO_CLIENT_ID,
        refresh_token: refreshToken,
    }).toString();

    const request = axios.post(`${COGNITO_DOMAIN}/oauth2/token`, body, { headers: clientAuthHeader() })
        .then((result) => result.data)
        .finally(() => refreshesInFlight.delete(refreshToken));

    refreshesInFlight.set(refreshToken, request);
    return request;
}

/**
 * Routes refreshSession leaves alone: the login callback is about to set brand
 * new tokens, and logout is about to throw them away.
 */
const SKIP_PATHS = new Set(["/auth", "/auth/logout"]);

/**
 * Express middleware that keeps a login alive.
 *
 * Middleware, in Express, is a function (req, res, next) that runs on a
 * request before the route handler. It can read or change `req`, add headers
 * or cookies to `res`, and then calls `next()` to hand the request on down
 * the chain. app.js installs this one with app.use() before all routers, so
 * it runs first on every request and every route benefits without changing
 * any route code.
 *
 * For each request it does one of three things:
 *   - Nothing, if the ID token is still valid or there's no refresh token
 *     (a logged-out visitor).
 *   - Renew: exchange the refresh token for a new ID token, send the new
 *     cookie to the browser, and put the token on req.cookies so the route
 *     handling this same request already sees it.
 *   - Log out: if Cognito rejects the refresh token, clear both cookies.
 *
 * It never fails the request; the route always runs afterwards.
 *
 * @param {import("express").Request} req
 * @param {import("express").Response} res
 * @param {import("express").NextFunction} next
 */
async function refreshSession(req, res, next) {
    const cookies = req.cookies || {};
    const refreshToken = cookies[REFRESH_COOKIE];

    if (SKIP_PATHS.has(req.path) || !refreshToken || !idTokenNeedsRefresh(cookies[ID_COOKIE])) {
        return next();
    }

    try {
        const tokens = await exchangeRefreshToken(refreshToken);
        setIdTokenCookie(res, tokens.id_token);
        req.cookies[ID_COOKIE] = tokens.id_token;
        // Only present if refresh token rotation is turned on for the client.
        if (tokens.refresh_token) {
            setRefreshTokenCookie(res, tokens.refresh_token);
            req.cookies[REFRESH_COOKIE] = tokens.refresh_token;
        }
        log("Refreshed login session");
    } catch (err) {
        // Expired or revoked refresh token (or Cognito unreachable): drop the
        // session so the user is simply logged out.
        const detail = err.response && err.response.data ? JSON.stringify(err.response.data) : err.message;
        log(`Session refresh failed: ${detail}`);
        clearSessionCookies(res);
        delete req.cookies[ID_COOKIE];
        delete req.cookies[REFRESH_COOKIE];
    }

    next();
}

/**
 * Tell Cognito to invalidate a refresh token, so a copy of the cookie (e.g.
 * on another device or stolen) can no longer renew the session.
 *
 * Called by /logout before the cookies are cleared. Requires token revocation
 * to be enabled on the Cognito app client; if it isn't, or Cognito can't be
 * reached, the failure is logged and logout continues — this never throws.
 *
 * @param {string|undefined} refreshToken value of the `refresh_token` cookie
 * @returns {Promise<void>}
 */
async function revokeRefreshToken(refreshToken) {
    if (!refreshToken) return;

    const body = new URLSearchParams({ token: refreshToken, client_id: COGNITO_CLIENT_ID }).toString();
    try {
        await axios.post(`${COGNITO_DOMAIN}/oauth2/revoke`, body, { headers: clientAuthHeader() });
        log("Revoked refresh token");
    } catch (err) {
        const detail = err.response && err.response.data ? JSON.stringify(err.response.data) : err.message;
        log(`Refresh token revocation failed: ${detail}`);
    }
}

module.exports = {
    ID_COOKIE,
    REFRESH_COOKIE,
    refreshSession,
    revokeRefreshToken,
    setIdTokenCookie,
    setRefreshTokenCookie,
    clearSessionCookies,
    idTokenNeedsRefresh,
};
