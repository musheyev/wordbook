---
name: start-wordbook
description: Start both the backend API and the frontend dev server for the makeyourwordbook project (the wordbook monorepo). Use when the user wants to run, launch, or start the wordbook app locally (e.g. "/start-wordbook", "start the wordbook", "run both servers").
---

# Start Wordbook

Starts both halves of the "make your wordbook" app (the **canonical monorepo** at
`/Users/rudy/code/web/wordbook`) so it's fully functional locally:

- **Backend API** — `/Users/rudy/code/web/wordbook/api` — Express, port **4000**
- **Frontend** — `/Users/rudy/code/web/wordbook/web` — Vite React SPA, port **3000** (proxies `/api/*` to the backend)

Both must run for full functionality. The frontend alone will load but its data calls will fail.

> Note: the older standalone folders `makeyourwordbook_react_ssr` (:3000) and
> `dictionary-ejs` (:4000) are deprecated — the monorepo is the source of truth. Use the paths below.

## Steps

Node isn't on PATH by default here, so every command must prepend nvm's node. Run both servers **in the background** (use `run_in_background: true`).

1. Start the backend (in the background):

```bash
export PATH="$HOME/.nvm/versions/node/v24.18.0/bin:$PATH" && cd /Users/rudy/code/web/wordbook/api && npm start
```

2. Start the frontend (in the background):

```bash
export PATH="$HOME/.nvm/versions/node/v24.18.0/bin:$PATH" && cd /Users/rudy/code/web/wordbook/web && npm run dev
```

3. Wait a few seconds, then check the background output of both:
   - Backend should report it's listening on port 4000.
   - Frontend (Vite) should print the `http://localhost:3000` local URL.

4. Report both URLs to the user and confirm both are up. The app is at **http://localhost:3000**.

## Notes

- The backend needs real AWS credentials + Cognito pool + Wordnik/Google API keys in `api/.env` to return live data. Without them the server still starts and responds, but data calls fail.
- The manual **cards** feature needs the `dictionary_cards` DynamoDB table. Create it once with:
  `export PATH="$HOME/.nvm/versions/node/v24.18.0/bin:$PATH" && cd /Users/rudy/code/web/wordbook/api && node create-cards-table.js`
- If the node version `v24.18.0` no longer exists, run `ls ~/.nvm/versions/node/` and use whichever version is installed.
- If a port is already in use, a server for it is likely already running — tell the user rather than killing it.
- Use `npm run dev` in the backend instead of `npm start` if the user wants auto-restart on file changes.
