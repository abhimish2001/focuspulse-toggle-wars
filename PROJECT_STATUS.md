# FocusPulse — Project Status & Remaining Tasks

**Hackathon:** Toggle Wars: The Flagsmith Experimentation Hackathon (Track 01: *Test Something Real*)  
**Last Verified Commit:** `2f533e4`

---

## 1. What Has Been Created & Configured

### A. Application Codebase (Next.js 14 App Router + TypeScript + Tailwind CSS)

| File | Purpose |
| :--- | :--- |
| [`app/page.tsx`](app/page.tsx) | Main FocusPulse Pomodoro UI rendering **Variant A (`minimal`)** and **Variant B (`gamified`)** behind `focus_experience_variant`. Includes zero-flicker skeleton loader, 60s Demo Mode toggle, persistent anonymous identity footer + switcher, synchronous click/StrictMode deduplication, `pagehide`/`beforeunload` `sendBeacon` abandonment tracking, and Flagsmith `session_completed` conversion tracking. |
| [`app/results/page.tsx`](app/results/page.tsx) | Public live analytics dashboard polling `/api/stats` every 5s. Shows side-by-side variant cards, relative lift, `<10s` noise filter toggle, `All Sessions / Production Only (25m)` toggle, CSV/JSON export links, 15 most recent events stream, and `Simulate 20 Users` / `Reset Data` controls. |
| [`app/layout.tsx`](app/layout.tsx) & [`app/globals.css`](app/globals.css) | Dark-mode root layout, metadata, Tailwind CSS directives, and custom scrollbar styling. |
| [`app/api/events/route.ts`](app/api/events/route.ts) | `POST /api/events` endpoint handling JSON and `navigator.sendBeacon` payloads, validating event/variant names, and preserving `event_id` for SQLite deduplication. |
| [`app/api/stats/route.ts`](app/api/stats/route.ts) | `GET /api/stats` (aggregates, `?filterNoise=true\|false`, `?includeDemo=true\|false`, `?format=csv\|json`) and `POST /api/stats` (`simulate` / `reset` actions). |
| [`lib/flagsmith.ts`](lib/flagsmith.ts) | `@flagsmith/flagsmith` (`^12.6.0`) client wrapper with persistent `fp_user_id` (`localStorage` + cookie), `initFlagsmithClient`, `trackFlagsmithConversion`, `getFlagSource`, and graceful fallback to `"minimal"` if `NEXT_PUBLIC_FLAGSMITH_ENV_KEY` is missing/invalid. |
| [`lib/db.ts`](lib/db.ts) | Zero-config SQLite layer using Node 24 built-in `node:sqlite` (`focuspulse.db`). Handles idempotent `INSERT OR IGNORE`, UTC ISO timestamps, JSON metadata noise filtering (`elapsed_seconds < 10`), demo-mode filtering, and CSV/JSON raw export queries. |

### B. Configuration & Documentation Files

| File | Purpose |
| :--- | :--- |
| [`package.json`](package.json) & [`package-lock.json`](package-lock.json) | Dependencies (`next`, `react`, `react-dom`, `@flagsmith/flagsmith`, `lucide-react`, `canvas-confetti`, `tailwindcss`, `typescript` `5.4.5`) and `dev` / `build` / `start` scripts. |
| [`tsconfig.json`](tsconfig.json), [`next.config.js`](next.config.js), [`tailwind.config.js`](tailwind.config.js), [`postcss.config.js`](postcss.config.js) | TypeScript, Next.js (`serverComponentsExternalPackages: ['node:sqlite']`), and Tailwind setup. |
| [`.env.example`](.env.example) | Safe environment variable template (`NEXT_PUBLIC_FLAGSMITH_ENV_KEY`, `DATABASE_PATH`) committed to Git with no real secrets. |
| [`.env.local`](.env.local) | Local environment file (gitignored) containing `NEXT_PUBLIC_FLAGSMITH_ENV_KEY` for the Flagsmith Development environment and `DATABASE_PATH=./focuspulse.db`. *(Note: `.env` also exists locally from earlier setup and is gitignored.)* |
| [`.gitignore`](.gitignore) | Excludes `node_modules/`, `.next/`, `*.db`, `.env`, `.env.local`, `.flagsmith`, and `*.log`. |
| [`flagsmith.json`](flagsmith.json) | Binds Flagsmith CLI to Project `55855` and Environment `esMZQYfcANsHcmozTaXb6F`. |
| [`Dockerfile`](Dockerfile) & [`.dockerignore`](.dockerignore) | Multi-stage `node:22-slim` production Docker build exposing port `3000` (`NODE_ENV=production`) with clean `.dockerignore` for Railway/Render deployment. |
| [`README.md`](README.md) | Pre-written Toggle Wars Track 01 submission README with hypothesis, Mermaid architecture diagram, Flagsmith IDs, event schema, Railway/Render persistent volume deployment guide, and live results snapshot template. |

### C. Flagsmith Cloud Resources (Verified Running)

- **Project:** `My first project` (ID: `55855`)
- **Environment:** `Development` (`esMZQYfcANsHcmozTaXb6F`, Flagsmith managed warehouse connected)
- **Multivariate Feature Flag:** `focus_experience_variant` (ID: `303219`)
  - Default / Control value: `minimal` (50% allocation)
  - Variant `gamified` (ID: `36655`, key: `gamified`, 50% allocation)
- **Experiment Metric:** `session_completed` (ID: `413`, aggregation: `occurrence`, direction: `up`)
- **Active Experiment:** `FocusPulse Timer Experience` (ID: `451`, status: `running`)  
  Dashboard URL: `https://app.flagsmith.com/project/55855/environment/esMZQYfcANsHcmozTaXb6F/experiments/451`

### D. Automated Checks Already Completed

- `npx tsc --noEmit` and `npm run build` passed with exit code `0`.
- Flagsmith Cloud SDK checks passed:
  - Sticky identity across 5 repeated evaluations (`sticky_check_user_1` consistently returned `gamified`).
  - 50/50 split across 8 distinct test identities (`minimal: 7`, `gamified: 1`, both `inExperiment: true`).
  - Invalid API key fallback resolved cleanly to `minimal`.
- Live `next start` API & DB checks passed (`/` and `/results` HTTP `200`, event deduplication, `15s` abandonment completion-rate drop, `<10s` noise filtering, `includeDemo=false` isolation, CSV/JSON exports), and `focuspulse.db` was reset clean afterward.

---

## 2. What Is Remaining (Manual / Pre-Submission Steps)

### 1. Deployment & Hosting Setup (Railway / Render Ready)
- [ ] **Deploy via [`Dockerfile`](Dockerfile) on Railway or Render:**
  - Connect the GitHub repo (auto-detects `Dockerfile` using `node:22-slim`).
  - Attach a Persistent Volume mounted at `/data`.
  - Set `NEXT_PUBLIC_FLAGSMITH_ENV_KEY`, `DATABASE_PATH=/data/focuspulse.db`, `ADMIN_SECRET=<strong-secret>`, and `NEXT_PUBLIC_ENABLE_DEMO_CONTROLS=false`.
- [ ] **Push Repository to Public GitHub:**
  - Create a public GitHub repository, add `origin`, and push (`git push -u origin master`).
  - Confirm `.env` and `.env.local` are **not** visible on GitHub.

### 2. Browser Verification on Your Live Deployed URL (Before Nov 29)
- [ ] **Sticky Identity (Browser):** Open the live URL in a normal browser window, note the variant in the footer, and refresh 5 times to confirm it stays identical.
- [ ] **50/50 Distribution (Incognito):** Open 6–8 separate Incognito/Private windows and verify roughly half see `minimal` and half see `gamified`.
- [ ] **Fallback Resilience (Local Test):** In local testing, temporarily set an invalid value in `.env.local` (note: Next.js gives `.env.local` priority over `.env`), restart `npm run dev`, confirm it renders `minimal` (`Fallback Default` in footer) without crashing, then restore the valid key.
- [ ] **End-to-End Session Completion:** Open `/?admin=1`, toggle **Demo (1m)**, complete one full session in `minimal` and one in `gamified` (using **Reset Identity / Switch Variant** if needed), and verify both appear on `/results` with accurate timestamps and IDs.
- [ ] **Abandonment Tracking (Reset & Tab Close):** Start a timer, wait 15+ seconds (`>= 10s` so the noise filter keeps it), click Reset (and repeat by closing a tab mid-session), then verify `session_abandoned` appears on `/results` and lowers the completion rate.
- [ ] **Rapid Click Integrity:** Rapidly double-click Start (or Complete) and verify `/results` shows only one event per `session_uuid`.

### 3. Final Hackathon Submission Assets (WeMakeDevs)
- [ ] **Generate / Collect Final Traffic & Refresh Flagsmith:** Gather real user traffic (or simulated traffic for final snapshot) and verify results in both `/results` and Flagsmith Experiment #451 (`https://app.flagsmith.com/project/55855/environment/esMZQYfcANsHcmozTaXb6F/experiments/451`).
- [ ] **Update [`README.md`](README.md):** Replace the `<paste ...>` placeholders in Section 5 (`Live Experiment Results`) with your actual final counts, completion rates, and lift, then commit and push.
- [ ] **Record Demo Video (2–4 mins):**
  1. Show Flagsmith Cloud dashboard with `focus_experience_variant` (#303219) and Experiment #451.
  2. Walk through Variant A (`minimal`) and Variant B (`gamified`) live on the deployed app.
  3. Show `/results` updating live (including CSV/JSON export and noise filter) and explain your conclusion.
- [ ] **Submit on WeMakeDevs:** Submit the public GitHub repo URL, live URL, and demo video link before the hackathon deadline.
