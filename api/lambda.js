// AWS Lambda entry point. serverless-http adapts the same Express app to the
// Lambda + API Gateway event/response shape — no route changes required.
// The CDK stack (infra/) points the Lambda handler at "lambda.handler".
const serverlessHttp = require("serverless-http");
const app = require("./app");

// Tell serverless-http which responses are binary. Without this it returns the
// body as a UTF-8 string with isBase64Encoded=false, which corrupts non-text
// payloads (the /tts endpoint's audio/mpeg) so the browser can't decode them.
// JSON/text responses are unaffected and still returned as-is.
module.exports.handler = serverlessHttp(app, {
    binary: ["audio/mpeg", "audio/*", "application/octet-stream"],
});
