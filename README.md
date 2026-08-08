# Wave Sprint — Enablement Leaderboard (mock)

A React + Vite app for the GSI AI practice enablement leaderboard prototype.
Currently running on synthetic data — see the adapter functions in
`src/App.jsx` for where real Skilljar/Credly API calls would plug in.

## Run locally

```bash
npm install
npm run dev
```

Opens at http://localhost:5173

## Build for production

```bash
npm run build
```

Outputs static files to `dist/`.

## Deploy to GitHub + Cloudflare Pages

1. **Create a new GitHub repo** (e.g. `enablement-leaderboard`) and push this
   folder to it:

   ```bash
   git init
   git add .
   git commit -m "Initial commit: enablement leaderboard prototype"
   git branch -M main
   git remote add origin https://github.com/YOUR_USERNAME/enablement-leaderboard.git
   git push -u origin main
   ```

2. **In the Cloudflare dashboard:** Workers & Pages → Create → Pages →
   Connect to Git → select this repo.

3. **Build settings** (Cloudflare should auto-detect Vite, but confirm):
   - Framework preset: `Vite`
   - Build command: `npm run build`
   - Build output directory: `dist`

4. **Deploy.** Cloudflare will build and give you a `*.pages.dev` URL.
   Every future push to `main` auto-redeploys — no extra steps needed.

5. **Optional:** attach a custom domain/subdomain under the Pages project's
   "Custom domains" tab, same as your other two Cloudflare sites.

## Where mock data lives

`src/App.jsx` — look for the block marked `MOCK DATA ADAPTER LAYER` near the
top of the file. `fetchSkilljarProgress()` and `fetchCredlyBadges()` are the
two functions to replace with real API calls; everything downstream
(boards, exec dashboard, status logic) consumes their unified output shape
and won't need to change.
