const jwt = require("jsonwebtoken");
const jwksClient = require("jwks-rsa");

const COGNITO_REGION = process.env.COGNITO_REGION || "us-east-1";
const COGNITO_USER_POOL_ID = process.env.COGNITO_USER_POOL_ID || "us-east-1_zFsf56WQR";

const jwksUrl = `https://cognito-idp.${COGNITO_REGION}.amazonaws.com/${COGNITO_USER_POOL_ID}/.well-known/jwks.json`;

const client = jwksClient({
    cache: true,
    cacheMaxEntries: 5,
    cacheMaxAge: 36000000, // 10 hours in ms
    jwksUri: jwksUrl,
});

async function decodeToken(token) {
    // Find the signing key whose kid matches the token header, verify RS256.
    const unverified = jwt.decode(token, { complete: true });

    if (!unverified || !unverified.header) {
        throw new Error("Invalid token");
    }

    const { kid } = unverified.header;
    const signingKey = await client.getSigningKey(kid);
    const publicKey = signingKey.getPublicKey();

    return jwt.verify(token, publicKey, { algorithms: ["RS256"] });
}

async function getCurentUserFromToken(token) {
    const decodedIdToken = await decodeToken(token);
    return decodedIdToken["cognito:username"];
}

module.exports = {
    decodeToken,
    getCurentUserFromToken,
};
