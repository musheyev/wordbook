/**
 * Authentication routes (mounted at /auth): sign in, who's signed in, sign out.
 *
 * The app doesn't handle passwords itself. Sign-in happens on Cognito's
 * hosted login page, using the OAuth 2.0 "authorization code" flow:
 *
 *   1. Browser  -> GET /auth/login
 *      We redirect the browser to Cognito's login page (LOGIN_URL), saying
 *      who we are (client_id) and where to come back to (redirect_uri).
 *   2. User signs in on Cognito's page (password, sign-up, forgot password…).
 *   3. Cognito  -> redirects the browser to GET /auth?code=XYZ
 *      The `code` is a one-time, short-lived ticket — not a token yet.
 *   4. Server   -> POST Cognito /oauth2/token with the code + our client
 *      secret. Only our server knows the secret, so only it can turn the code
 *      into tokens; someone who intercepts the code in the URL can't.
 *   5. Cognito returns an ID token and a refresh token. We store them in
 *      httpOnly cookies (see session.js) and redirect to the app.
 *
 * From then on the browser sends the cookies with every API request.
 * session.js's refreshSession middleware renews the ID token as it expires,
 * and GET /auth/logout ends the session.
 */
const express = require("express");
const axios = require('axios');
const log = require("../logger");
const decodeToken = require("../auth").decodeToken;
const session = require("../session");
const account = require("../account");

const COGNITO_DOMAIN = process.env.COGNITO_DOMAIN || "https://auth.musheye.com";
const COGNITO_CLIENT_ID = process.env.COGNITO_CLIENT_ID || "31i8vt5m567ch5ciedmeskpk67";
const COGNITO_CLIENT_SECRET = process.env.COGNITO_CLIENT_SECRET;
const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:4000";
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:3000";
// Where Cognito sends the browser after sign-in (step 3). Must exactly match a
// "callback URL" registered on the Cognito app client, or Cognito refuses.
const REDIRECT_URI = `${BACKEND_URL}/auth`;

// Cognito's hosted login page (step 1). `response_type=code` asks for the
// authorization code flow; `scope` lists what the tokens may be used for
// (`openid` is what makes Cognito include an ID token).
const LOGIN_URL =
    `${COGNITO_DOMAIN}/login?client_id=${COGNITO_CLIENT_ID}` +
    "&response_type=code&scope=aws.cognito.signin.user.admin+email+openid+profile" +
    `&redirect_uri=${REDIRECT_URI}`;

// The iPhone app's sign-in comes back to the app itself, through its own
// address scheme (registered in the app's Info.plist). Also a callback URL on
// the Cognito app client.
const APP_REDIRECT_URI = process.env.APP_REDIRECT_URI || "remembrancer://auth";

let authRouter = express.Router();

/**
 * GET /auth/login — step 1: send the browser to Cognito's login page.
 */
authRouter.get("/login", function (req, res) {
    log("Recieved request on " + req.path);
    res.redirect(301, LOGIN_URL);
});

/**
 * GET /auth?code=… — steps 3 to 5: the login callback.
 *
 * Cognito redirects here after a successful sign-in. We exchange the one-time
 * code for tokens, verify the ID token's signature (decodeToken) so we never
 * store a forged token, save both tokens as cookies, and send the browser on
 * to the app. On any failure the user lands back on the app, logged out.
 *
 * Further reading: https://aws.amazon.com/premiumsupport/knowledge-center/decode-verify-cognito-json-token/
 */
authRouter.get("", function (req, res) {

    log("/auth got " + JSON.stringify(req.query));
    let authCode = req.query.code;

    // Signing in again to confirm deleting the account (POST /delete-account):
    // don't sign in here; hand the one-time code to the page, which sends it
    // with the deletion. The `state` the page chose comes back with it.
    const state = typeof req.query.state === "string" ? req.query.state : "";
    if (state.startsWith("delete-")) {
        const params = new URLSearchParams({ state, ...(authCode ? { delete_code: authCode } : {}) });
        return res.redirect(302, `${FRONTEND_URL}/account?${params}`);
    }

    const data = new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: COGNITO_CLIENT_ID,
        client_secret: COGNITO_CLIENT_SECRET,
        scope: 'email+openid+phone+profile',
        redirect_uri: REDIRECT_URI,
        code: authCode,
    }).toString();

    const config = {
        headers: { 'content-type': 'application/x-www-form-urlencoded' }
    };

    axios.post(`${COGNITO_DOMAIN}/oauth2/token`, data, config)
        .then((result) => {

            const token = result.data.id_token;
            const refreshToken = result.data.refresh_token;

            decodeToken(token)
                .then(decodedToken => {

                    const expireTime = new Date(decodedToken.exp * 1000);
                    console.log(`Expiration Time = ${expireTime}`);

                    // ID token for the routes; refresh token so the session
                    // renews itself when the ID token expires (see session.js).
                    session.setIdTokenCookie(res, token);
                    if (refreshToken) {
                        session.setRefreshTokenCookie(res, refreshToken);
                    }
                    // 302 = "temporary" redirect. A 301 ("permanent") would
                    // let the browser cache it and skip this route next time.
                    res.redirect(302, FRONTEND_URL);
                })
                .catch((err) => {
                    if (err.response != null && err.response.data != null) {
                        console.log(err.response.data, null, 2);
                    }
                    else {
                        console.log(err, null, 2);
                    };
                    res.redirect(500, FRONTEND_URL);
                });

        })
        .catch(err => {
            log('Failed AWS Token End Point request');

            if (err.response != null && err.response.data != null) {
                console.log(err.response.data, null, 2);
            }
            else {
                console.log(err, null, 2);
            };
            res.redirect(500, FRONTEND_URL);

        })

});

/**
 * GET /auth/current_user — who is signed in?
 *
 * The frontend calls this when it starts (App.js fetchCurrentUser). Because
 * the cookies are httpOnly, page JavaScript can't look at them itself — it has
 * to ask the server. Responds with { username, isAdmin }, or an empty username
 * when logged out. If the ID token has expired, refreshSession has already
 * renewed it before this handler runs.
 */
authRouter.get("/current_user", function (req, res) {
    log("Received request on /current_user");

    if (Object.keys(req.cookies).length != 0) {

        const { id_token: token } = req.cookies;

        decodeToken(token)
            .then(decodedToken => {

                const { "cognito:username": userName } = decodedToken;
                // Admin = member of the "admins" Cognito group (claim rides in
                // the token after the user re-logs in once added to the group).
                const groups = decodedToken["cognito:groups"] || [];
                const isAdmin = Array.isArray(groups) && groups.includes("admins");
                // An account waiting out its deletion grace period says when
                // (account.js): the screen then asks to keep it or not.
                return account.deletionDueAt(userName)
                    .catch(() => null)
                    .then((deletionDueAt) => res.json({ username: userName || "", isAdmin, deletionDueAt }));
            })
            .catch((err) => {
                if (err.response != null && err.response.data != null) {
                    console.log(err.response.data, null, 2);
                }
                else {
                    console.log(err, null, 2);
                };

                session.clearSessionCookies(res);
                res.json({ username: "", isAdmin: false });
            });


    }
    else {
        res.json({ username: "", isAdmin: false });
    }

});

/**
 * GET /auth/logout — end the session.
 *
 * Deleting cookies only logs out *this* browser. So we first ask Cognito to
 * revoke the refresh token, which makes every copy of it worthless, then
 * clear both cookies.
 *
 * Finally it calls Cognito's /logout endpoint. Note that this request comes
 * from our server, so it can't clear the login cookie Cognito's hosted page
 * keeps in the *browser*: if that cookie is still valid, the next sign-in may
 * skip the password prompt. Clearing it would mean redirecting the browser
 * itself to Cognito's /logout.
 */
authRouter.get("/logout", async function (req, res) {
    log("Received request on /logout");

    // Revoke first so a copied refresh cookie stops working, then drop both.
    await session.revokeRefreshToken(req.cookies[session.REFRESH_COOKIE]);
    session.clearSessionCookies(res);

    const awsCognitoLogoutEndPoint =
        `${COGNITO_DOMAIN}/logout?client_id=${COGNITO_CLIENT_ID}&logout_uri=${FRONTEND_URL}`;

    axios.get(awsCognitoLogoutEndPoint)
        .then(awsResponse => {
            log(`Cognito Logout End Point Request Returned ${awsResponse.status} ${awsResponse.statusText}`);
            res.send("");
        })
        .catch(error => {
            log(`Cognito Logout End Point Request Returned ${error}`);
            res.send("");
        });

});


/**
 * POST /auth/delete-account { username, code, code_verifier?, via } — ask for
 * the signed-in user's account to be deleted in 7 days (account.js
 * scheduleDeletion: marked, and signed out on every device), then sign out
 * here. A nightly job deletes it when the day comes; signing in before then
 * offers to keep it (POST /auth/keep-account).
 *
 * Deleting needs a fresh sign-in, with the password, just before: being
 * signed in isn't enough, since someone else might be holding an unlocked
 * phone or using a computer left signed in. So the screen first has the user
 * sign in again, which produces a one-time `code`:
 *   via "app"  the iPhone app's private sign-in sheet (with its PKCE
 *              code_verifier), redirect remembrancer://auth
 *   via "web"  Cognito's "sign out, then sign in" page, back through GET /auth
 *              (which hands the code to the page instead of signing in)
 * The code is traded for tokens here, and only if that sign-in is the same
 * account as the signed-in one (and `username`) is anything deleted.
 *
 * Answers { deletion_due_at }; 401 not signed in, 400 missing or mismatched
 * details, 403 signed in again as someone else, 500 if it failed (calling
 * again is safe, and keeps the first date).
 */
authRouter.post("/delete-account", async function (req, res) {
    let userName;
    try {
        const decoded = await decodeToken(req.cookies && req.cookies[session.ID_COOKIE]);
        userName = decoded["cognito:username"];
    } catch (err) {
        return res.status(401).json({ error: "Please log in again." });
    }
    const { username, code, code_verifier: codeVerifier, via } = req.body || {};
    if (!userName || username !== userName) {
        return res.status(400).json({ error: "That isn't the signed-in account." });
    }
    if (!code) {
        return res.status(400).json({ error: "Please sign in again to confirm it's you." });
    }

    // The fresh sign-in: who was it?
    let confirmed;
    try {
        const fresh = await exchangeCode(code, via === "app" ? APP_REDIRECT_URI : REDIRECT_URI, codeVerifier);
        confirmed = fresh.decoded["cognito:username"];
        // Its own session isn't needed: end it.
        if (fresh.refreshToken) await session.revokeRefreshToken(fresh.refreshToken);
    } catch (err) {
        return tokenError(res, err, "Signing in again to delete the account");
    }
    if (confirmed !== userName) {
        log(`Account deletion refused for ${userName}: signed in again as ${confirmed}`);
        return res.status(403).json({ error: "You signed in as a different account, so nothing was deleted." });
    }

    try {
        const dueAt = await account.scheduleDeletion(userName);
        await session.revokeRefreshToken(req.cookies[session.REFRESH_COOKIE]);
        session.clearSessionCookies(res);
        res.json({ deletion_due_at: dueAt });
    } catch (err) {
        log(`Scheduling account deletion failed for ${userName}: ${err.name}: ${err.message}`);
        res.status(500).json({ error: "Your account couldn't be scheduled for deletion. Please try again." });
    }
});

/**
 * POST /auth/keep-account — the signed-in user, whose account is waiting to
 * be deleted, keeps it (account.js cancelDeletion). Signing in is the proof:
 * the grace period signed them out everywhere, so they've just signed in.
 */
authRouter.post("/keep-account", async function (req, res) {
    let userName;
    try {
        userName = (await decodeToken(req.cookies && req.cookies[session.ID_COOKIE]))["cognito:username"];
    } catch (err) {
        return res.status(401).json({ error: "Please log in again." });
    }
    try {
        await account.cancelDeletion(userName);
        res.json({ kept: true });
    } catch (err) {
        log(`Keeping account failed for ${userName}: ${err.name}`);
        res.status(500).json({ error: "Couldn't keep your account. Please try again." });
    }
});

/*
 * The iPhone app's sign-in (/auth/app/*).
 *
 * Same Cognito login page, same code-for-tokens exchange with our client
 * secret, but the app keeps the tokens itself (in the iPhone's Keychain)
 * instead of in cookies, and sends the ID token with each request
 * (session.js appTokenHeader):
 *
 *   1. The app opens Cognito's login page with redirect_uri APP_REDIRECT_URI
 *      and a PKCE code_challenge: a hash of a random secret (the
 *      code_verifier) that only the app knows.
 *   2. After sign-in Cognito opens remembrancer://auth?code=… — the app.
 *   3. The app POSTs the code and its code_verifier to /auth/app/token. Cognito
 *      only accepts the code with the verifier matching the challenge, so
 *      another app that grabbed the remembrancer:// address can't use it.
 *   4. The app renews the ID token with /auth/app/refresh, and /auth/app/logout
 *      revokes the refresh token on sign-out.
 *
 * Errors answer 401 with { error }, so the app can tell "signed out" apart from
 * "no connection".
 */
const tokenError = (res, err, what) => {
    const detail = err.response && err.response.data ? JSON.stringify(err.response.data) : err.message;
    log(`${what} failed: ${detail}`);
    res.status(401).json({ error: `${what} failed` });
};

/**
 * Trade a sign-in's one-time code for tokens at Cognito (with our client
 * secret), and verify the ID token so a forged one is never trusted.
 *
 * @param {string} code
 * @param {string} redirectUri the redirect_uri the sign-in used
 * @param {string} [codeVerifier] its PKCE verifier (the iPhone app's)
 * @returns {Promise<{idToken: string, refreshToken?: string, decoded: object}>}
 */
async function exchangeCode(code, redirectUri, codeVerifier) {
    const data = new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: COGNITO_CLIENT_ID,
        client_secret: COGNITO_CLIENT_SECRET,
        redirect_uri: redirectUri,
        code,
        ...(codeVerifier ? { code_verifier: codeVerifier } : {}),
    }).toString();
    const result = await axios.post(`${COGNITO_DOMAIN}/oauth2/token`, data,
        { headers: { 'content-type': 'application/x-www-form-urlencoded' } });
    const { id_token: idToken, refresh_token: refreshToken } = result.data;
    const decoded = await decodeToken(idToken);
    return { idToken, refreshToken, decoded };
}

/** POST /auth/app/token { code, code_verifier } -> { id_token, refresh_token } */
authRouter.post("/app/token", async function (req, res) {
    const { code, code_verifier: codeVerifier } = req.body || {};
    if (!code) return res.status(400).json({ error: "Missing code" });
    try {
        const { idToken, refreshToken } = await exchangeCode(code, APP_REDIRECT_URI, codeVerifier);
        res.json({ id_token: idToken, refresh_token: refreshToken });
    } catch (err) {
        tokenError(res, err, "App sign-in");
    }
});

/** POST /auth/app/refresh { refresh_token } -> { id_token, refresh_token? } */
authRouter.post("/app/refresh", async function (req, res) {
    const { refresh_token: refreshToken } = req.body || {};
    if (!refreshToken) return res.status(400).json({ error: "Missing refresh_token" });
    try {
        const tokens = await session.exchangeRefreshToken(refreshToken);
        // A new refresh token only when rotation is on for the app client.
        res.json({ id_token: tokens.id_token, ...(tokens.refresh_token ? { refresh_token: tokens.refresh_token } : {}) });
    } catch (err) {
        tokenError(res, err, "App token refresh");
    }
});

/** POST /auth/app/logout { refresh_token } — the app then forgets its tokens. */
authRouter.post("/app/logout", async function (req, res) {
    await session.revokeRefreshToken((req.body || {}).refresh_token);
    res.json({});
});

module.exports = authRouter;
