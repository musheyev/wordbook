// AWS Lambda entry point. serverless-http adapts the same Express app to the
// Lambda + API Gateway event/response shape — no route changes required.
// The CDK stack (infra/) points the Lambda handler at "lambda.handler".
const serverlessHttp = require("serverless-http");
const app = require("./app");

// Tell serverless-http which payloads are binary. Without this it treats the
// body as a UTF-8 string with isBase64Encoded=false, which corrupts non-text
// data over API Gateway — the /tts endpoint's audio/mpeg and note images
// (/images, image/*) — so the browser can't decode them. This only matters in
// Lambda; locally (plain Express) binary just works, which is why images showed
// fine in dev but broke in production. JSON/text responses are unaffected.
module.exports.handler = serverlessHttp(app, {
    binary: ["audio/mpeg", "audio/*", "image/*", "application/octet-stream"],
});
