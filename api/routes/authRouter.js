const express = require("express");
const axios = require('axios');
const log = require("../logger");
const decodeToken = require("../auth").decodeToken;

const COGNITO_DOMAIN = process.env.COGNITO_DOMAIN || "https://auth.musheye.com";
const COGNITO_CLIENT_ID = process.env.COGNITO_CLIENT_ID || "31i8vt5m567ch5ciedmeskpk67";
const COGNITO_CLIENT_SECRET = process.env.COGNITO_CLIENT_SECRET;
const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:4000";
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:3000";
const REDIRECT_URI = `${BACKEND_URL}/auth`;

const LOGIN_URL =
    `${COGNITO_DOMAIN}/login?client_id=${COGNITO_CLIENT_ID}` +
    "&response_type=code&scope=aws.cognito.signin.user.admin+email+openid+profile" +
    `&redirect_uri=${REDIRECT_URI}`;

let authRouter = express.Router();

authRouter.get("/login", function (req, res) {
    log("Recieved request on " + req.path);
    res.redirect(301, LOGIN_URL);
});

authRouter.get("", function (req, res) {

    //READ: https://aws.amazon.com/premiumsupport/knowledge-center/decode-verify-cognito-json-token/

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

            decodeToken(token)
                .then(decodedToken => {

                    const expireTime = new Date(decodedToken.exp * 1000);
                    console.log(`Expiration Time = ${expireTime}`);

                    //NOTE: cookie options at http://expressjs.com/en/api.html#res.cookie
                    res.cookie('id_token', token, { httpOnly: true, expires: expireTime });
                    res.redirect(301, FRONTEND_URL);
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

authRouter.get("/current_user", function (req, res) {
    log("Received request on /current_user");

    if (Object.keys(req.cookies).length != 0) {

        const { id_token: token } = req.cookies;

        decodeToken(token)
            .then(decodedToken => {

                const { "cognito:username": userName } = decodedToken;
                res.send(userName);
            })
            .catch((err) => {
                if (err.response != null && err.response.data != null) {
                    console.log(err.response.data, null, 2);
                }
                else {
                    console.log(err, null, 2);
                };

                res.clearCookie("id_token");
                res.send("");
            });


    }
    else {
        res.send("");
    }

});

authRouter.get("/logout", function (req, res) {
    log("Received request on /logout");

    if (Object.keys(req.cookies).length != 0) {
        res.clearCookie("id_token");
    }

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
