# 📡 ModRadar — Predictive Raid & Brigading Shield

## Inspiration
Reddit moderation today is fundamentally reactive. Moderators often wake up to find their subreddit already flooded by coordinated brigades, spam waves, or karma-farming rings. By the time the issue is detected, the damage is already done.

We asked ourselves: **What if moderators had the same kind of real-time threat detection systems used by enterprise security teams?**

Inspired by cybersecurity Network Operations Centers (NOCs), we built **ModRadar** — a behavioral threat detection system that predicts and intercepts malicious activity in real time.

Our core insight was simple: **Brigading and spam are not random.** They leave measurable behavioral signatures:
*   Sudden comment velocity spikes
*   New-account clustering
*   Overlap with known hostile communities

We realized these signals could be detected mathematically and in real time using only Devvit APIs.

---

## What it does
ModRadar is a real-time behavioral threat detection platform for Reddit, built entirely on **Devvit**. It combines four integrated subsystems:

### 1. 🔬 Sequential Security Pipeline
Every incoming comment passes through a chain of middleware analyzers:
*   **Account Age Check**: Flags accounts younger than the trusted threshold. *(+30 risk points, triggers `NEW_ACCOUNT`)*
*   **Global Velocity Monitor**: Detects abnormal comment acceleration across the subreddit. *(+20 to +40 risk points, triggers `HIGH_SUBREDDIT_VELOCITY` / `CRITICAL_SUBREDDIT_VELOCITY`)*
*   **Jaccard Proximity Analysis**: Computes the similarity between a user’s recent subreddit activity and a moderator-defined watchlist of hostile communities.

#### Jaccard Similarity Formula:
$$J(A, B) = \frac{|A \cap B|}{|A \cup B|}$$

If the combined risk score exceeds the configured threshold, the comment is **automatically removed** and sent to the mod queue before disruption occurs.

### 2. 📊 Sliding Window Telemetry Engine
Comment activity is bucketed per minute using Devvit `kvStore`. A rolling 15-minute window is segmented into three blocks:
*   **Segment A** ($t\text{-}0 \rightarrow t\text{-}4$): Immediate activity.
*   **Segment B** ($t\text{-}5 \rightarrow t\text{-}9$): Intermediate baseline.
*   **Segment C** ($t\text{-}10 \rightarrow t\text{-}14$): Historical baseline.

#### Velocity Acceleration Formula:
$$\Delta V = \frac{\text{Segment A}}{\text{avg}(\text{Segment B}, \text{Segment C})}$$

Threat levels escalate dynamically: `LOW` $\rightarrow$ `MEDIUM` $\rightarrow$ `HIGH` $\rightarrow$ `CRITICAL`.

### 3. 🛡️ Interactive NOC Dashboard
A premium dark-themed Custom Post visualizes the subreddit security state in real time. Features include:
*   **Live alert-level indicators** (Harmonious NOC colors)
*   **Ingestion telemetry charts** (Custom built with dynamic primitives)
*   **Behavioral threat tables** showing flagged users, risk scores, Jaccard similarity, triggered rules, and deep scan inspection actions
*   **Manual lockdown controls** and **automatic emergency lockdown** (triggered at `CRITICAL` velocity with timed recovery via Devvit Scheduler)

### 4. ⚡ Circuit Breaker Optimization
To preserve Reddit API quotas during intense traffic, ModRadar implements a smart circuit breaker. If the account is trusted **AND** the alert level is `LOW`, the expensive Jaccard history analysis is skipped entirely. This dramatically reduces API consumption during normal traffic periods.

---

## How we built it
ModRadar is a pure Devvit application built with a strict TypeScript architecture.

*   **Real-Time Ingestion**: `Devvit.addTrigger(CommentSubmit)`
*   **Scheduled Recovery**: `Devvit.addSchedulerJob()`
*   **Interactive Dashboard**: `Devvit.addCustomPostType()`
*   **Moderator Controls**: `Devvit.addMenuItem()` and `Devvit.addSettings()`

### Clean Architecture:
```
src/
├── main.tsx                  # App orchestrator (triggers, scheduler, dashboard, menu)
├── types/
│   └── radar.ts              # Strict TypeScript interfaces & types
└── backend/
    ├── pipeline.ts           # Sequential middleware security engine
    └── sliding-window.ts     # Temporal telemetry bucketing & velocity computation
```

The Jaccard similarity engine was implemented entirely from scratch: **zero external libraries, no ML dependencies, and no external services.**

---

## Challenges we ran into
*   **Deprecated `submitCustomPost()`**: We initially attempted `context.reddit.submitCustomPost()` based on older documentation, which failed. After inspecting the Devvit SDK source code, we migrated to the correct `context.reddit.submitPost()` with a JSX preview.
*   **Custom Post Rendering Constraints**: Devvit UI primitives do not provide native charting support. We manually built telemetry visualizations using dynamically-sized stacked layout blocks.
*   **No Native TTL in `kvStore`**: Devvit `kvStore` does not support automatic expiration. We implemented a probabilistic garbage collection mechanism (10% cleanup chance per comment) to evict buckets older than 20 minutes.
*   **State Synchronization (`ServerCallRequired`)**: We ran into execution issues when using mutations inside client-side `useAsync` calls. We resolved this by extracting state updates into the asynchronous button handlers, letting Asyncify signals bubble up cleanly.

---

## Accomplishments that we're proud of
*   **Zero External Dependencies**: The entire threat detection engine runs 100% on native Devvit APIs and pure TypeScript.
*   **Real Mathematical Detection**: Implemented a robust, case-insensitive, divide-by-zero safe Jaccard index from scratch.
*   **Production-Grade Resilience**: Built defensive null checks, fallbacks, and error boundaries for all operations.
*   **Authentic NOC Experience**: Created a highly immersive dark tactical UI with real-time incident controls.

---

## What we learned
*   Devvit `kvStore` is surprisingly powerful when modeled as a lightweight time-series database.
*   Middleware patterns fit moderation systems exceptionally well.
*   Circuit breakers are just as valuable in moderation apps as they are in large microservices.

---

## What's next for ModRadar
*   **📬 Mod Mail Integration**: Automatic incident reports delivered directly to moderators.
*   **⏱️ Temporal Pattern Recognition**: Detection of recurring attack patterns.
*   **🌐 Cross-Subreddit Federation**: Shared anonymized threat intelligence across subreddits.
*   **🧠 Lightweight NLP Scoring**: Combine behavioral detection with toxicity scoring.
*   **🔄 Real-Time Dashboard Refresh**: Integrate `useInterval` to completely eliminate manual refreshes.
