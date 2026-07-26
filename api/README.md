# api — Wordbook API

Express API (dictionary, wordbook, auth) backed by DynamoDB + Cognito + Wordnik/Google.

- **Run locally:** `npm install && npm run dev` (listens on :4000). Config comes from `.env` (see `.env.example`).
- **Entry points:** `app.js` (the Express app), `server.js` (local `listen`), `lambda.js` (`serverless-http` handler for AWS Lambda).
- **Deployment:** handled by the CDK stack in [`../infra`](../infra). See the repo root [README](../README.md) for full deploy steps. The old EC2 / `scp` process is retired.
