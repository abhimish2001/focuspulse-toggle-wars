# 🚀 CloudFlow SaaS: Flagsmith Experimentation Demo
> **Toggle Wars: The Flagsmith Experimentation Hackathon**  
> **Track 01:** *Test Something Real* ($2,000 Prize Track)

---

## 📌 1. Project Overview & Hypothesis

In modern SaaS products, the first 60 seconds of onboarding determine user activation and conversion. 
This project puts two onboarding flows head-to-head using **Flagsmith Experimentation** to let real user data pick the winner:

- **Control (`control`):** Traditional fast-track 3-field form (Name, Email, Company).
- **Variation B (`guided_tour`):** Interactive personalized workflow selector (Workspace Goal, Team Size, Custom Subdomain).
- **Core Hypothesis:** Giving users interactive, goal-oriented choices during onboarding creates immediate ownership, resulting in a statistically significant increase in completed onboarding conversions.

---

## 🎯 2. Experiment & Metric Definition

- **Multivariate Feature Flag:** `onboarding_flow`
  - `control`: Default value (`control`) - 50% split
  - `guided_tour`: Multivariate variation (`guided_tour`) - 50% split
- **Success Metric:** `completed_onboarding`
  - **Aggregation:** `occurrence`
  - **Direction:** `up`
  - **Event Name:** `completed_onboarding` (fired when the user clicks "Complete Setup & Get Started")

---

## 🏗️ 3. Architecture & Flagsmith Integration

This project uses the official `@flagsmith/nodejs` SDK (v9.5.0) with native experimentation enabled:

1. **Exposure Tracking:**
   When an identified user visits the onboarding page, the server calls:
   ```javascript
   const flag = await flagsmith.getExperimentFlag('onboarding_flow', userId);
   ```
   Flagsmith automatically records a `$flag_exposure` event attributing the identity to the assigned variation.

2. **Conversion Tracking:**
   When the user completes onboarding, the server tracks the conversion:
   ```javascript
   flagsmith.trackEvent('completed_onboarding', { identifier: userId });
   await flagsmith.flushEvents();
   ```

3. **Bayesian Results Engine:**
   Flagsmith's built-in Bayesian analytics engine calculates win probability, lift, and credible intervals between `control` and `guided_tour`.

---

## 🛠️ 4. Quick Start & Setup

### Prerequisites
- Node.js 18+ (tested on Node v24)
- Flagsmith Cloud account or self-hosted Flagsmith instance

### Installation
```bash
npm install
```

### Configure Environment Variables
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```
Add your Flagsmith Server-Side Environment Key:
```env
FLAGSMITH_ENVIRONMENT_KEY=ser.xxxxxx...
PORT=3000
```

### Run the Web Demo
```bash
npm start
```
Visit `http://localhost:3000` to interact with the live onboarding flow, test user identities, and trigger conversions.

---

## 🧪 5. Simulating User Traffic (Instant Results)

You don't need to wait days for hundreds of users. Run the automated traffic simulator:
```bash
npm run simulate
```
This script:
- Simulates 250 distinct user identities.
- Retrieves flags and logs exposures via `getExperimentFlag`.
- Models conversion behavior with real-world statistical variation.
- Flushes all buffered events via `await flagsmith.close()`.

---

## 📊 6. Live Experiment Results & Dashboard

- **Project ID:** `55855`
- **Environment Key:** `esMZQYfcANsHcmozTaXb6F`
- **Feature Flag ID:** `302755` (`onboarding_flow`)
- **Experiment ID:** `426` (`Onboarding Flow Experiment`)
- **Direct Dashboard Link:**  
  [Flagsmith Experiment Dashboard](https://app.flagsmith.com/project/55855/environment/esMZQYfcANsHcmozTaXb6F/experiments/426)

### Bayesian Statistical Summary:
| Variation | Exposures (n) | Conversions | Conversion Rate | Lift | Win Probability |
| :--- | :---: | :---: | :---: | :---: | :---: |
| **Control** (`control`) | 119 | 38 | 31.9% | Baseline | — |
| **Guided Tour** (`guided_tour`) | 131 | 74 | 56.5% | **+76.9%** | **99.75%** |

The guided tour variant demonstrated a clear, statistically significant +76.9% lift with a **99.75% chance to win** under Flagsmith's Bayesian analysis engine.

