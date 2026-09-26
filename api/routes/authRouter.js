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
                res.json({ username: userName || "", isAdmin });
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


module.exports = authRouter;
