# ⏱️ FocusPulse — Flagsmith Experimentation Platform
> **Toggle Wars: The Flagsmith Experimentation Hackathon**  
> **Track 01:** *Test Something Real ($2,000 Cash Prize)*

---

## 🎯 1. Core Concept & Experiment Hypothesis

**FocusPulse** is a minimalist deep-work session and Pomodoro tracker engineered for high-performance builders.

### 🔬 The Experiment Hypothesis
> *"Does adding a **Gamified Streak & Instant Reward UI (Variant B)** increase session completion rates compared to a **Minimalist Distraction-Free Timer UI (Variant A)**?"*

- **Variant A (`"minimal"` - 50% split):** Clean monochrome interface, standard countdown timer, simple task input, and quiet completion states to minimize cognitive distraction.
- **Variant B (`"gamified"` - 50% split):** Vibrant dynamic progress ring, live streak counter, instant XP feedback, motivational milestone nudges (at 50% and 90%), and celebratory confetti upon session completion.
- **Primary Conversion Metric:** Focus Session Completion (`session_completed`), fired when the countdown timer hits `00:00`.

---

## 🏗️ 2. System Architecture

```mermaid
flowchart TD
    subgraph Client["Next.js App Router (TypeScript + Tailwind CSS)"]
        User["Persistent Anonymous Identity (fp_user_id)"]
        UI_A["Variant A: Minimal Timer"]
        UI_B["Variant B: Gamified Timer"]
        ResultsPage["Live Analytics Page (/results)"]
    end

    subgraph Flagsmith["Flagsmith Feature Flagging & Experimentation"]
        Flag["Multivariate Flag: focus_experience_variant"]
        Split["50% minimal / 50% gamified"]
        Identities["Identity Bucketing (flagsmith.identify)"]
        EventsAPI["Flagsmith Events Ingestion API"]
    end

    subgraph Backend["Next.js API & SQLite Datastore"]
        EventsRoute["POST /api/events"]
        StatsRoute["GET /api/stats"]
        SQLite[("focuspulse.db (node:sqlite)")]
    end

    User -->|1. flagsmith.identify(userId)| Identities
    Identities -->|2. Deterministic Assignment| Flag
    Flag -->|3. minimal or gamified| Client
    Client -->|4. experiment_exposed| EventsRoute
    Client -->|5. session_started / session_abandoned| EventsRoute
    Client -->|6. session_completed| EventsRoute
    Client -->|7. trackEvent('session_completed')| EventsAPI
    EventsRoute --> SQLite
    StatsRoute -->|Read Aggregates & Recent Events| SQLite
    ResultsPage -->|Live 5s Polling| StatsRoute
```

---

## 🚩 3. Flagsmith Setup & Flag Configuration

1. **Multivariate Feature Flag:** `focus_experience_variant` (Flag ID: `303219`)
   - **Variant A (Control):** `minimal` (50% traffic allocation)
   - **Variant B (Challenger):** `gamified` (50% traffic allocation, variant key: `gamified`)
2. **Conversion Metric:** `session_completed` (Metric ID: `413`, aggregation: `occurrence`, direction: `up`)
3. **Live Flagsmith Experiment:** [FocusPulse Timer Experience (#451)](https://app.flagsmith.com/project/55855/environment/esMZQYfcANsHcmozTaXb6F/experiments/451)
4. **Persistent Anonymous Identity:**
   - On the first visit, FocusPulse generates a unique identifier (e.g., `user_8xf3k9p2`) persisted across sessions via `localStorage` and cookies.
   - Evaluated via `@flagsmith/flagsmith`:
     ```typescript
     await flagsmith.init({ environmentID, enableEvents: true, identity: userId });
     const flag = flagsmith.getExperimentFlag('focus_experience_variant');
     ```
   - This ensures the exact same user consistently experiences their assigned variant without layout shifts or bucket reassignment.

---

## 📊 4. Real Event Tracking Pipeline (No Mock Data)

Every interaction is captured into an out-of-the-box local SQLite datastore (`node:sqlite`) and streamed simultaneously to Flagsmith:

| Event Name | Trigger Condition | Role |
| :--- | :--- | :--- |
| `experiment_exposed` | Triggered once per session when the flag resolves | Impression baseline |
| `session_started` | User presses "Start Focus" (deduplicated per `session_uuid`) | Funnel start |
| `session_abandoned` | User presses "Reset" or closes tab mid-session (`sendBeacon`) | Drop-off telemetry |
| `session_completed` | Timer successfully reaches `00:00` | **Primary Conversion Metric** |

---

## 📈 5. Live Experiment Results

> **Submission Note:** Replace the placeholder values below with your final real-traffic snapshot from `/results` and Flagsmith Dashboard before recording your demo video.

Open `/results` in your browser to view the real-time comparison dashboard (supports CSV/JSON raw export and `<10s` noise filtering):

```
+-------------------------------------------------------------------------+
| FOCUSPULSE LIVE EXPERIMENT RESULTS (SNAPSHOT TEMPLATE)                  |
+-------------------------------------------------------------------------+
| Metric                 | Variant A (Minimal)  | Variant B (Gamified)    |
+------------------------+----------------------+-------------------------+
| Unique Users Exposed   | <paste count>        | <paste count>           |
| Sessions Started       | <paste count>        | <paste count>           |
| Sessions Abandoned     | <paste count>        | <paste count>           |
| Sessions Completed     | <paste count>        | <paste count>           |
+------------------------+----------------------+-------------------------+
| Completion Rate (%)    | <paste %>            | <paste %>               |
| Statistical Lift       | Baseline             | <paste lift %>          |
+-------------------------------------------------------------------------+
```

---

## 🚀 6. Quick Start & Local Run

### Prerequisites
- Node.js 20+ (developed & verified on Node v24)
- NPM

### Installation & Run
```bash
# 1. Install dependencies
npm install

# 2. Start the development server
npm run dev
```

Visit:
- **Timer App:** `http://localhost:3000`
- **Live Results Dashboard:** `http://localhost:3000/results`

### Testing the Experiment
1. Regular visitors at `/` see genuine `25m` / `5m` focus presets (`is_demo_mode: false`) with a read-only session badge.
2. For demo recording and testing, open `/?admin=1` to unlock the **Demo (1m)** toggle and **Reset Identity / Switch Variant** button in the footer.
3. To access protected simulation/reset controls on `/results`, visit `/results?admin=1` and enter your `ADMIN_SECRET`.

---

## ☁️ 7. Deploying to Railway / Render (Persistent SQLite)

FocusPulse uses Node 22/24's built-in `node:sqlite` and ships with a multi-stage [`Dockerfile`](Dockerfile) (`node:22-slim`), allowing zero-config SQLite persistence across restarts:

1. **Connect Repository:** Connect this GitHub repository to **Railway** or **Render** (the platform auto-detects [`Dockerfile`](Dockerfile)).
2. **Attach a Persistent Volume:** Mount a persistent disk/volume at `/data`.
3. **Configure Environment Variables:**
   - `NEXT_PUBLIC_FLAGSMITH_ENV_KEY` — Your Flagsmith client-side environment key *(note: `NEXT_PUBLIC_*` vars must be available at build time as Docker build args/env vars in Railway/Render)*.
   - `DATABASE_PATH=/data/focuspulse.db` — Stores SQLite data on the mounted volume (`lib/db.ts` creates parent directories automatically on boot).
   - `ADMIN_SECRET=<strong-secret>` — Secures `POST /api/stats` (`simulate` and `reset` actions).
   - `NEXT_PUBLIC_ENABLE_DEMO_CONTROLS=false` — Keeps admin buttons hidden from public visitors unless `?admin=1` is appended.
4. **Admin Access in Production:** Open `https://<your-domain>/results?admin=1` and enter your `ADMIN_SECRET` when prompted.
