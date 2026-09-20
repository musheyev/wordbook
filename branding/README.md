# Cardbook login branding (Cognito Hosted UI — Option A)

Restyles the **classic** Cognito Hosted UI to match the Cardbook palette.
AWS serves the login page's HTML, so this is limited to colors, the logo, and a
fixed set of controls — no layout/copy changes. For full control we'd move to
Managed Login (Option B) or an in-app login (Option C).

Pool details (from `api/.env` defaults):

- Region: `us-east-1`
- User pool: `us-east-1_zFsf56WQR`
- App client: `31i8vt5m567ch5ciedmeskpk67`

## Apply via AWS Console (easiest)

1. Cognito → your user pool → **App integration**.
2. Under **App client list**, open the app client `31i8vt5m567ch5ciedmeskpk67`
   (or set pool-wide defaults under **Hosted UI**).
3. Find **Hosted UI customization** → **Edit**.
4. (Optional) Upload a logo — PNG/JPEG, ≤ 100 KB, ~132×64 works with the CSS.
5. Paste the contents of [`cognito-hosted-ui.css`](./cognito-hosted-ui.css) into
   the CSS box → **Save changes**.
6. Open the login link from the app and confirm the blue button / inputs match.

## Apply via CLI (alternative)

```bash
aws cognito-idp set-ui-customization \
  --region us-east-1 \
  --user-pool-id us-east-1_zFsf56WQR \
  --client-id 31i8vt5m567ch5ciedmeskpk67 \
  --css "$(cat branding/cognito-hosted-ui.css)"
```

Add a logo in the same call with `--image-file fileb://branding/logo.png`.

To reset to the AWS default, run the same command with `--css ""` (and omit the
image), or clear it in the console.

## Notes / gotchas

- This targets the **classic** Hosted UI. If the app client is switched to
  **Managed login**, this CSS no longer applies (Managed login uses the visual
  branding editor instead).
- `set-ui-customization` validates against an allow-list; the CSS here sticks to
  supported selectors/properties. If you add rules and it rejects them, an
  unsupported selector or property is the cause.
- Changes are near-instant; hard-refresh the hosted page if you don't see them.
