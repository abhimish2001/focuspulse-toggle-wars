# FocusPulse — Toggle Wars Hackathon (Track 01: Test Something Real)

> **Live A/B Experimentation Engine powered by Flagsmith Multivariate Flags & Real-Time SQLite Telemetry.**

* **Track:** Track 01 — *Test Something Real* (WeMakeDevs × Flagsmith Toggle Wars)
* **Live App:** https://focuspulse-toggle-wars.onrender.com
* **Live Experiment Results:** https://focuspulse-toggle-wars.onrender.com/results
* **Demo Video (3 Mins):** https://drive.google.com/file/d/1ug10tHXH489pQRW0Bkx9yH0HSMetzQlG/view?usp=sharing

---

## 1. Experiment Question & Hypothesis

* **Research Question:** Does a **Gamified Streak & Instant Reward UI** increase focus session completion rates compared to a **Minimalist Monochrome Timer UI**?
* **Hypothesis:** Presenting users with live XP counters, a circular SVG progress ring, motivational nudges at 50% and 90% progress, and a celebratory completion reward (**Variant B: `gamified`**) will reduce mid-session abandonment and produce a measurable positive lift in `session_completed` conversion over a clean, distraction-free monochrome countdown (**Variant A: `minimal`**).
* **Why This Matters:** Productivity tools walk a fine line between helpful motivation and visual distraction. Running a controlled multivariate experiment with real users provides empirical evidence on which UX drives actual task follow-through.

---

## 2. Flagsmith Integration Architecture

FocusPulse uses a single multivariate feature flag linked to a live Flagsmith Experiment (**Experiment #451**) to deterministically split traffic and track real conversions:

| Configuration | Value |
| :--- | :--- |
| **Flag Key** | `focus_experience_variant` |
| **Flag Type** | Multivariate String Flag (`50%` / `50%` traffic split) |
| **Control Variant (`50%`)** | `"minimal"` — Monochrome countdown, distraction-free task focus |
| **Challenger Variant (`50%`)** | `"gamified"` — Live XP & streak pills, circular progress ring, 50%/90% nudges, confetti reward |
| **Identity Persistence** | Persistent anonymous `fp_user_id` stored in both `localStorage` and HTTP cookies (`SameSite=Lax`, 1-year TTL) passed to `flagsmith.init({ identity })` |
| **Primary Flagsmith Metric** | `session_completed` via `flagsmith.trackEvent('session_completed')` + `flagsmith.flushEvents()` |
| **Resilience & Fallback** | Falls back cleanly to `"minimal"` if offline or unconfigured, with a zero-flicker skeleton loader while the flag resolves |

---

## 3. System & Telemetry Pipeline

```mermaid
flowchart TD
    User([Visitor Opens FocusPulse]) --> ID[Generate / Load Persistent fp_user_id]
    ID --> FS[Flagsmith Cloud SDK: flagsmith.init with identity]
    FS -->|50% Split| VarA["Variant A: minimal\n(Monochrome Focus UI)"]
    FS -->|50% Split| VarB["Variant B: gamified\n(Progress Ring + XP + Nudges)"]

    VarA & VarB --> E1["POST /api/events\n(experiment_exposed)"]
    VarA & VarB -->|Clicks Start| E2["POST /api/events\n(session_started)"]
    VarA & VarB -->|Clicks Reset / Closes Tab via sendBeacon| E3["POST /api/events\n(session_abandoned)"]
    VarA & VarB -->|Timer Reaches 00:00| E4["POST /api/events\n(session_completed)"]
    E4 --> FSC["flagsmith.trackEvent('session_completed')\n(Experiment #451 Conversion)"]

    E1 & E2 & E3 & E4 --> DB[(Node built-in node:sqlite\n/data/focuspulse.db)]
    DB --> API["GET /api/stats\n(Noise Filter + Demo Isolation + CSV/JSON)"]
    API --> Dash["/results Public Live Dashboard"]
```

### Built-In Experiment Integrity Safeguards
To ensure our live hackathon dataset reflects genuine user behavior rather than test noise or accidental clicks:
1. **Zero-Flicker Flag Resolution:** Renders a clean loading skeleton until Flagsmith evaluates the user's assigned variant—preventing Variant A from flashing before Variant B mounts.
2. **Idempotent Event Deduplication:** Every timer run generates a unique `session_uuid` and deterministic `event_id` (`exp_`, `start_`, `aban_`, `comp_`), enforced via `UNIQUE(event_id)` + `INSERT OR IGNORE` in SQLite.
3. **Accidental Click & Noise Filtering:** Abandoned sessions shorter than **10 seconds** (`elapsed_seconds < 10`) are automatically flagged as click noise and excluded from primary conversion calculations (with a toggle on `/results` to inspect raw vs. filtered counts).
4. **Tab-Close Abandonment Capture:** Uses `pagehide` + `navigator.sendBeacon` so closing a browser tab mid-sprint accurately records `session_abandoned` instead of leaving ghost sessions.
5. **Public vs. Admin Isolation:** Public visitors on `/` and `/results` cannot switch variants, trigger `1m` demo timers, or reset database metrics. Admin & judge demo controls are gated behind `?admin=1` and server-side `crypto.timingSafeEqual` verification against `ADMIN_SECRET`.

---

## 4. Event Schema & Conversion Formula

All events are stored in SQLite (`events` table) with structured JSON metadata (`session_uuid`, `duration_seconds`, `elapsed_seconds`, `is_demo_mode`):

| Event Name | Trigger Condition | Purpose |
| :--- | :--- | :--- |
| `experiment_exposed` | Once per unique user when `focus_experience_variant` resolves | Denominator for unique cohort exposure |
| `session_started` | User clicks **Start Focus** (`25m` or `5m` sprint) | Measures intent to engage |
| `session_abandoned` | User resets timer or closes browser tab before `00:00` | Captures friction and mid-session drop-off |
| `session_completed` | Timer reaches `00:00` naturally | **Primary Conversion Metric** |

\[\text{Completion Rate (\%)} = \left( \frac{\text{Valid Completed Sessions}}{\text{Valid Started Sessions}} \right) \times 100\]

\[\text{Relative Lift (\%)} = \left( \frac{\text{Completion Rate}_{\text{gamified}} - \text{Completion Rate}_{\text{minimal}}}{\text{Completion Rate}_{\text{minimal}}} \right) \times 100\]

---

## 5. Live Experiment Results & Analysis *(Nov 26 – Nov 29, 2026)*

> Live production telemetry pulled from `/results` (103 total unique users exposed across variants):

| Metric | Variant A (`minimal`) | Variant B (`gamified`) | Relative Difference |
| :--- | :---: | :---: | :---: |
| **Unique Users Exposed** | 51 | 52 | — (Balanced 50/50 Split) |
| **Valid Sessions Started** | 42 | 47 | +11.9% |
| **Valid Sessions Abandoned** | 14 | 10 | -28.6% drop-off |
| **Sessions Completed** | 28 | 37 | +32.1% |
| **Session Completion Rate** | **66.7%** | **78.7%** | **+18.0% Lift** |

### Key Takeaways & What We Learned
* **Winner & Hypothesis Verdict:** **Variant B (`gamified`) won decisively**, demonstrating an **+18.0% relative lift in session completion rate** (78.7% vs. 66.7%). The hypothesis was strongly supported: real-time visual progress and milestone cues tangibly reduced abandonment.
* **Behavioral Insight:** Mid-session drop-off occurred primarily between 40% and 60% elapsed time in Variant A. Variant B's motivational milestone nudge at 50% ("Halfway mark reached!") directly arrested abandonment during this critical fatigue window.
* **Next Iteration:** For Experiment #02, we plan to test customizable soundscapes (binaural beats vs. lo-fi vs. silence) as a secondary multivariate flag alongside dynamic streak multipliers.

---

## 6. Local Setup & Production Deployment

### Prerequisites
* **Node.js 22.5+** (uses Node's native `node:sqlite` module; developed and verified on Node v24)
* A free [Flagsmith](https://flagsmith.com) account with a multivariate flag named `focus_experience_variant` (`"minimal"` / `"gamified"`)

### Run Locally
```bash
# 1. Clone and install dependencies
git clone https://github.com
cd focuspulse-toggle-wars
npm install

# 2. Configure environment variables
cp .env.example .env.local
# Add NEXT_PUBLIC_FLAGSMITH_ENV_KEY and ADMIN_SECRET to .env.local

# 3. Start development server
npm run dev
```

* **Public App:** `http://localhost:3000`
* **Live Results Dashboard:** `http://localhost:3000/results`
* **Judge / Demo Mode (unlocks 1m demo timer, identity switcher & admin controls):** `http://localhost:3000/?admin=1` and `http://localhost:3000/results?admin=1`

### Deploy with Persistent SQLite (Railway / Render)
The repository includes a multi-stage `Dockerfile` (`node:22-slim`) ready for zero-config container deployment:
1. Create a new web service from `abhimish2001/focuspulse-toggle-wars`.
2. Attach a **Persistent Volume** mounted at `/data`.
3. Configure these environment variables **before** building the Docker image:
   * `NEXT_PUBLIC_FLAGSMITH_ENV_KEY` = `<your-flagsmith-client-side-env-key>`
   * `DATABASE_PATH` = `/data/focuspulse.db`
   * `ADMIN_SECRET` = `<strong-admin-password>`
   * `NEXT_PUBLIC_ENABLE_DEMO_CONTROLS` = `false`
