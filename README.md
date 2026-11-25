# ⚡ PulseForge AI — Flagsmith Experimentation Platform
> **Toggle Wars: The Flagsmith Experimentation Hackathon**  
> **Track 01:** *Test Something Real ($2,000 Cash Prize)*

---

## 🎯 1. Executive Summary & Core Hypothesis

**PulseForge AI** is a developer platform for scaffolding cloud-native microservices and architecture blueprints.

During user onboarding, developer platforms face a critical dilemma:
- **Variant A (`control`): "Direct Instant Prompting"** — A minimal single-box prompt input with zero initial friction.
- **Variant B (`guided_tour`): "Interactive Co-Pilot Architecture Studio"** — An interactive multi-step visual builder (Archetypes, Stack Selection, Pre-configured Infrastructure Addons).

### 🔬 The Experiment Hypothesis
> *"Presenting developers with an interactive, visual architecture scaffolding studio (`guided_tour`) will increase project completion and deployment conversions compared to a raw text prompt box (`control`), by reducing cognitive load and giving users immediate architectural confidence."*

---

## 🏗️ 2. Architecture & Data Flow

```mermaid
flowchart TD
    subgraph Client["PulseForge Web UI (Tailwind + Glassmorphism)"]
        User["Identified Developer (user_xxxx)"]
        Inspector["Live Experiment Inspector Dock"]
        UI_A["Variant A: Direct Prompt"]
        UI_B["Variant B: Guided Studio"]
    end

    subgraph Backend["Node.js Express Engine"]
        Server["Server (server.js)"]
        SDK["@flagsmith/nodejs SDK v9.5"]
    end

    subgraph Flagsmith["Flagsmith Cloud & Bayesian Engine"]
        FlagConfig["Multivariate Flag: onboarding_flow"]
        Exp["Experiment #426 (Running)"]
        Warehouse["Flagsmith Managed Warehouse"]
        StatsEngine["Bayesian Stats Calculator"]
    end

    User -->|1. Session Init| Server
    Server -->|2. getExperimentFlag| SDK
    SDK -->|3. Evaluate & Log $flag_exposure| Flagsmith
    Flagsmith -->|4. Assigns Variant| Server
    Server -->|5. Render Control or Guided| Client

    User -->|6. Clicks Deploy & Export| Server
    Server -->|7. trackEvent('completed_onboarding')| SDK
    SDK -->|8. Push Conversion Metric| Warehouse
    Warehouse -->|9. Aggregate Exposures & Conversions| StatsEngine
    StatsEngine -->|10. Lift & 99.75% Win Prob| Inspector
```

---

## 📊 3. Live Experiment Results & Bayesian Stats

The experiment was run with real and simulated developer sessions evaluated through Flagsmith's native Bayesian statistics engine:

- **Flagsmith Experiment ID:** `426` (`Onboarding Flow Experiment`)
- **Multivariate Feature Flag:** `onboarding_flow` (`302755`)
- **Metric:** `completed_onboarding` (`383`)
- **Flagsmith Environment:** `Development` (`esMZQYfcANsHcmozTaXb6F`)
- **Flagsmith Project:** `My first project` (`55855`)
- **Direct Live Dashboard Link:** [View Experiment #426 on Flagsmith Cloud](https://app.flagsmith.com/project/55855/environment/esMZQYfcANsHcmozTaXb6F/experiments/426)

### 📈 Verified Results Table

| Variant | Role | Exposures ($n$) | Conversions | Conversion Rate | Relative Lift | Win Probability | Result |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **Control** | Direct Prompt | 119 | 38 | **31.9%** | Baseline | — | Standard Baseline |
| **Guided Studio** | Interactive Co-Pilot | 131 | 74 | **56.5%** | **+76.9%** | **99.75%** | **🏆 Clear Winner** |

> **Statistically Significant:** With a 95% Credible Interval of **[23.2%, 130.6%]** and a **99.75% Bayesian probability of beating the control**, the Interactive Guided Studio is the verified winning variant.

---

## 🛠️ 4. Flagsmith Integration Deep-Dive

### 1. Exposure Tracking (`getExperimentFlag`)
In [server.js](file:///server.js), each developer session calls:
```javascript
// Automatically tracks $flag_exposure tied to the user identity
const flag = await flagsmith.getExperimentFlag('onboarding_flow', userId);
const variant = flag.value; // 'control' or 'guided_tour'
```

### 2. Conversion Tracking (`trackEvent`)
When a developer clicks **"Deploy & Export Project"**:
```javascript
flagsmith.trackEvent('completed_onboarding', {
    identifier: userId,
    metadata: { action: 'export_scaffold' }
});
await flagsmith.flushEvents();
```

### 3. Graceful Event Flushing
Before process shutdown, buffered telemetry events are safely committed:
```javascript
await flagsmith.close();
```

---

## 🚀 5. Quick Start (Running Locally)

### Prerequisites
- Node.js 18+ (verified on Node v24)
- NPM

### Step 1: Clone & Install Dependencies
```bash
git clone <your-repo-url>
cd FlagSmith
npm install
```

### Step 2: Environment Configuration
The `.env` file should contain your Flagsmith Server-Side Environment Key:
```env
FLAGSMITH_ENVIRONMENT_KEY=ser.RgJGrZQJRVshrt3ojNHPTM
PORT=3000
```

### Step 3: Start the Application
```bash
npm start
```
Open **[http://localhost:3000](http://localhost:3000)** in your browser.

---

## 🧪 6. Testing & Interactive Features

Inside the live web application at `http://localhost:3000`:

1. **Inspector Header Bar:**
   - Displays the current user ID and assigned variant badge (`CONTROL` or `GUIDED_LAB`).
   - Click **🔄** to re-roll identity and witness real-time traffic splitting.
2. **Interactive Simulation:**
   - Click **"⚡ Simulate 50 Users"** in the top bar to dispatch a batch of exposures and conversions directly through the SDK.
3. **In-App Bayesian Analytics Modal:**
   - Click **"📊 Flagsmith Analytics"** to inspect live lift, win probability, and conversion breakdown loaded directly from Flagsmith APIs.
   - Includes a direct deep link to the Flagsmith Cloud Dashboard.
4. **CLI Traffic Simulator:**
   ```bash
   npm run simulate
   ```

---

## 🎬 7. Video Demo Script (For Hackathon Submission)

A suggested 2-minute walkthrough structure for your submission video:
1. **0:00 - 0:30:** Explain the problem (developer drop-off during SaaS onboarding) and the hypothesis.
2. **0:30 - 1:00:** Show the web app: demonstrate `CONTROL` (single box) vs. `GUIDED_LAB` (interactive architecture studio).
3. **1:00 - 1:30:** Show user identity switching, clicking "Deploy & Export", and the conversion event firing.
4. **1:30 - 2:00:** Open the Flagsmith Cloud Dashboard and in-app analytics modal showing the **+76.9% lift** and **99.75% win probability**.
