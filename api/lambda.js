// AWS Lambda entry point. serverless-http adapts the same Express app to the
// Lambda + API Gateway event/response shape — no route changes required.
// The CDK stack (infra/) points the Lambda handler at "lambda.handler".
const serverlessHttp = require("serverless-http");
const app = require("./app");

module.exports.handler = serverlessHttp(app);
