# Wordbook

Monorepo for the "make your wordbook" app.

```
wordbook/
├── web/     React SPA (Vite)              → deployed to S3 + CloudFront
├── api/     Express API (dictionary/wordbook/auth) → deployed to AWS Lambda
└── infra/   AWS CDK (TypeScript)          → provisions everything below
```

## Architecture (what gets deployed)

One CloudFront distribution serves both tiers under a single domain:

- `/*` → **S3** bucket holding the built SPA (`web/dist`), cached at the edge.
- `/api/*` → **API Gateway (HTTP API)** → **Lambda** running the Express app (via `serverless-http`). A CloudFront Function strips the `/api` prefix at the edge so the Express routes match.
- The Lambda reads/writes the **existing DynamoDB tables** (created outside this stack) and verifies **Cognito** JWTs. It calls **Wordnik / Google** for definitions and images.

Because the SPA and API share one CloudFront domain, the httpOnly auth cookie is same-origin, and CloudFront terminates TLS at the edge nearest each user (fast worldwide).

---

## Local development (unchanged)

Two terminals, exactly as before. Node isn't on PATH by default here; use nvm's node.

```bash
export PATH="$HOME/.nvm/versions/node/v24.18.0/bin:$PATH"
```

```bash
cd api && npm install && npm run dev
```

```bash
cd web && npm install && npm run dev
```

The SPA runs on http://localhost:3000 and proxies `/api` to the API on :4000 (Vite dev proxy). CDK is deploy-time only and is never needed for local work.

---

## Prerequisites (one-time)

1. Install the AWS CLI and Node 18+.
2. Configure credentials, then confirm they work:

```bash
aws configure
```

```bash
aws sts get-caller-identity
```

3. Make sure `api/.env` has real values — the **same file you use locally** is what CDK deploys to the Lambda (Cognito, Wordnik, and Google keys). See `api/.env.example`.

4. Bootstrap CDK once per account + region (creates the assets bucket CDK needs). Replace `ACCOUNT_ID`:

```bash
cd infra && npm install && npx cdk bootstrap aws://ACCOUNT_ID/us-east-1
```

(Find `ACCOUNT_ID` with `aws sts get-caller-identity --query Account --output text`.)

---

## Deploy

Build the SPA, install the API's runtime deps (they're packaged into the Lambda), then deploy the stack.

```bash
cd web && npm install && npm run build
```

```bash
cd ../api && npm install
```

```bash
cd ../infra && npm install
```

```bash
npx cdk deploy
```

CDK prints the outputs when it finishes:

- `CloudFrontUrl` — the public app URL (e.g. `https://d123abc.cloudfront.net`)
- `ApiGatewayUrl` — the raw API endpoint (for debugging; the app uses CloudFront)
- `SiteBucketName` — the S3 bucket holding the SPA

Preview changes before applying them anytime:

```bash
npx cdk diff
```

### Redeploying after changes

```bash
cd web && npm run build && cd ../infra && npx cdk deploy
```

- UI change → rebuild `web` (the command above uploads the new `dist` and invalidates the CDN cache).
- API change only → just `npx cdk deploy` (CDK re-bundles the Lambda with esbuild).

---

## Auth (Cognito) — one post-deploy step

The dictionary/wordbook features work as soon as the stack is up. **Login** needs two more things because Cognito must know your public URL:

1. Set your app URL so the API redirects correctly. Add to `api/.env`:

```bash
APP_URL=https://YOUR_CLOUDFRONT_OR_CUSTOM_DOMAIN
```

then redeploy (`cd infra && npx cdk deploy`).

2. In the Cognito app client, add these to the allowed URLs:
   - Callback URL: `https://YOUR_DOMAIN/api/auth`
   - Sign-out URL: `https://YOUR_DOMAIN`

3. The SPA's login links currently hard-code the Cognito redirect for local dev (`web/src/client/components/Header.js` and `routes.jsx`). Point those at `https://YOUR_DOMAIN/api/auth` for the deployed site (or move them to a Vite env var — a small follow-up).

---

## Custom domain (optional)

To serve on `apps.musheye.com` instead of the generated `*.cloudfront.net`:

1. Create/validate an ACM certificate for the domain **in us-east-1** (CloudFront requires us-east-1).
2. Deploy with the domain + cert ARN, and set `APP_URL` to match:

```bash
npx cdk deploy -c domainName=apps.musheye.com -c certArn=arn:aws:acm:us-east-1:ACCOUNT_ID:certificate/xxxx
```

3. Point a Route 53 alias record for `apps.musheye.com` at the CloudFront distribution.

---

## Tear down

Removes the Lambda, API Gateway, S3 bucket (and its objects), and CloudFront distribution. It does **not** touch your DynamoDB tables or Cognito pool (this stack never created them).

```bash
cd infra && npx cdk destroy
```

---

## Notes & tradeoffs

- **Secrets** are injected as Lambda environment variables from `api/.env`, so they appear in the CloudFormation template. Fine for a personal app; for hardening, move them to AWS Secrets Manager / SSM Parameter Store and read them at runtime.
- **EJS views and the API's `public/` assets are not packaged** into the Lambda. The SPA only calls the JSON endpoints (`?json=y`), so this doesn't affect it — but the legacy server-rendered `/dictionary` HTML page won't render on Lambda.
- **DynamoDB tables and the Cognito user pool are pre-existing** and only referenced (IAM grants + JWT verification). The stack won't create or delete them.
