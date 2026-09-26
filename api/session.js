// Login session cookies and silent refresh.
//
// Cognito issues a short-lived ID token (60 minutes) and a long-lived refresh
// token (30 days, set on the Cognito app client). The ID token is what every
// route reads (cookie `id_token`); the refresh token (cookie `refresh_token`)
// is only ever sent to Cognito, to get a new ID token when the old one expires.
//
// `refreshSession` runs before every route: if the ID token is missing or about
// to expire and a refresh token is present, it swaps the refresh token for a
// new ID token, sets the cookie, and puts the new token on req.cookies so the
// route that follows sees a valid login. The user never notices.
const axios = require("axios");
const jwt = require("jsonwebtoken");
const log = require("./logger");

const COGNITO_DOMAIN = process.env.COGNITO_DOMAIN || "https://auth.musheye.com";
const COGNITO_CLIENT_ID = process.env.COGNITO_CLIENT_ID || "31i8vt5m567ch5ciedmeskpk67";
const COGNITO_CLIENT_SECRET = process.env.COGNITO_CLIENT_SECRET;
const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:4000";

// Keep in step with the Cognito app client's refresh token validity.
const REFRESH_TOKEN_DAYS = Number(process.env.REFRESH_TOKEN_DAYS) || 30;
// Refresh a little before expiry so a request never arrives with a token that
// expires mid-flight.
const EXPIRY_MARGIN_SECONDS = 60;

const ID_COOKIE = "id_token";
const REFRESH_COOKIE = "refresh_token";

// Secure (HTTPS-only) everywhere except local http development.
const baseCookieOptions = {
    httpOnly: true,
    secure: BACKEND_URL.startsWith("https://"),
    sameSite: "lax",
    path: "/",
};

// Cognito's token/revoke endpoints authenticate the app client with HTTP Basic.
function clientAuthHeader() {
    const credentials = Buffer.from(`${COGNITO_CLIENT_ID}:${COGNITO_CLIENT_SECRET || ""}`).toString("base64");
    return {
        "content-type": "application/x-www-form-urlencoded",
        authorization: `Basic ${credentials}`,
    };
}

function setIdTokenCookie(res, idToken) {
    const decoded = jwt.decode(idToken);
    const expires = decoded && decoded.exp ? new Date(decoded.exp * 1000) : undefined;
    res.cookie(ID_COOKIE, idToken, { ...baseCookieOptions, expires });
}

function setRefreshTokenCookie(res, refreshToken) {
    res.cookie(REFRESH_COOKIE, refreshToken, {
        ...baseCookieOptions,
        maxAge: REFRESH_TOKEN_DAYS * 24 * 60 * 60 * 1000,
    });
}

function clearSessionCookies(res) {
    res.clearCookie(ID_COOKIE, baseCookieOptions);
    res.clearCookie(REFRESH_COOKIE, baseCookieOptions);
    // Cookies from before this change were set without an explicit path, which
    // behind CloudFront (/api/auth) defaulted to /api.
    res.clearCookie(ID_COOKIE, { path: "/api" });
}

// True when the ID token is absent, unreadable, or expires within the margin.
// Signature checks are left to the routes (auth.decodeToken); this only
// decides whether to refresh.
function idTokenNeedsRefresh(idToken) {
    if (!idToken) return true;
    const decoded = jwt.decode(idToken);
    if (!decoded || !decoded.exp) return true;
    return decoded.exp - Date.now() / 1000 < EXPIRY_MARGIN_SECONDS;
}

// Several requests can arrive together right after the token expires; share
// one Cognito call per refresh token instead of making one each.
const refreshesInFlight = new Map();

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

// Login callback sets fresh tokens and logout discards them: no point
// refreshing on the way in.
const SKIP_PATHS = new Set(["/auth", "/auth/logout"]);

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

// Revoke a refresh token at Cognito so copies of it stop working. Needs token
// revocation enabled on the app client; failures are logged, not thrown, so
// logout always completes.
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
