# ModRadar

**Predictive Raid and Brigading Shield for Reddit**

ModRadar is a real-time behavioral threat detection platform built entirely on the [Devvit](https://developers.reddit.com/docs/devvit) developer platform. It enables subreddit moderators to detect and intercept coordinated brigades, spam waves, and account-farming rings before they cause disruption — shifting moderation from reactive to predictive.

Built for the **Reddit Mod Tools and Migrated Apps Hackathon 2026**.

---

## Overview

Traditional Reddit moderation is reactive: by the time a brigade is identified, the damage is already done. ModRadar addresses this by continuously analyzing behavioral signals on every incoming comment and computing a composite risk score in real time.

When a risk score exceeds the configured threshold, the comment is silently redirected to the mod queue — automatically, before it is ever visible to the community.

---

## Architecture

```
src/
├── main.tsx                  # Application orchestrator (triggers, scheduler, dashboard, menus)
├── types/
│   └── radar.ts              # TypeScript interfaces and enumerations
└── backend/
    ├── pipeline.ts           # Sequential middleware security engine
    └── sliding-window.ts     # Temporal telemetry bucketing and velocity computation
```

---

## Core Systems

### 1. Sequential Security Pipeline

Every incoming comment passes through a chain of three middleware analyzers executed in order:

**Account Age Check**
Flags accounts younger than the configured trusted threshold.
- Penalty: +30 risk points
- Triggered rule: `NEW_ACCOUNT`

**Global Velocity Monitor**
Detects abnormal comment acceleration across the subreddit using a sliding window analysis.
- HIGH alert: +20 risk points — rule: `HIGH_SUBREDDIT_VELOCITY`
- CRITICAL alert: +40 risk points — rule: `CRITICAL_SUBREDDIT_VELOCITY`

**Jaccard Proximity Analysis**
Computes the behavioral similarity between a user's recent subreddit activity and a moderator-configured watchlist of hostile communities, using the Jaccard similarity index:

```
J(A, B) = |A ∩ B| / |A ∪ B|
```

The implementation is case-insensitive and divide-by-zero safe. No external libraries or ML dependencies are used.

---

### 2. Sliding Window Telemetry Engine

Comment activity is bucketed per minute and stored in Devvit `kvStore`. A rolling 15-minute window is segmented into three blocks to compute velocity acceleration:

| Segment | Time Range | Role |
|---------|------------|------|
| A | t-0 to t-4 min | Immediate activity |
| B | t-5 to t-9 min | Intermediate baseline |
| C | t-10 to t-14 min | Historical baseline |

**Velocity acceleration formula:**

```
DeltaV = Segment A / avg(Segment B, Segment C)
```

Threat levels escalate dynamically: `LOW` → `MEDIUM` → `HIGH` → `CRITICAL`.

Since Devvit `kvStore` does not support native TTL, ModRadar implements a probabilistic garbage collection mechanism: a 10% cleanup chance per comment event evicts buckets older than 20 minutes.

---

### 3. Interactive NOC Dashboard

A custom post type renders a full-screen, dark-themed Network Operations Center interface directly inside Reddit. The dashboard provides:

- Live alert-level status indicator with color-coded severity
- Ingestion telemetry charts built with dynamic layout primitives
- Behavioral threat table with per-user risk scores, Jaccard similarity values, triggered rules, and deep scan inspection
- Manual lockdown control and automatic emergency lockdown (triggered at CRITICAL velocity with timed recovery via Devvit Scheduler)

---

### 4. Circuit Breaker Optimization

The Jaccard proximity analysis requires fetching a user's recent comment history from the Reddit API, which consumes quota. ModRadar implements a circuit breaker that skips this expensive operation when both conditions are met:

- The account age is above the trusted threshold
- The current global alert level is `LOW`

This significantly reduces API consumption during normal traffic periods.

---

## Technical Implementation

| Capability | Devvit API Used |
|------------|-----------------|
| Real-time comment ingestion | `Devvit.addTrigger(CommentSubmit)` |
| Scheduled lockdown recovery | `Devvit.addSchedulerJob()` |
| Interactive dashboard | `Devvit.addCustomPostType()` |
| Moderator controls | `Devvit.addMenuItem()` |
| Persistent state | `context.kvStore` |
| Moderator configuration | `Devvit.addSettings()` |

**Zero external dependencies.** The entire detection engine runs on native Devvit APIs and pure TypeScript.

---

## Configuration

Moderators can configure the following settings directly from the subreddit settings panel:

| Setting | Description |
|---------|-------------|
| `trustedAccountAgeWeeks` | Minimum account age (in weeks) to be considered trusted |
| `autoActionThresholdScore` | Risk score above which comments are automatically filtered |
| `jaccardWatchlist` | Comma-separated list of hostile subreddits to monitor |

---

## Local Development

**Prerequisites:** Node.js 18+, Devvit CLI

```bash
# Install dependencies
npm install

# Build
npm run build

# Run in playtest mode against a test subreddit
npx devvit playtest <your-subreddit>
```

---

## Known Challenges

- **Deprecated `submitCustomPost()`**: The correct method is `context.reddit.submitPost()` with a JSX preview component. The older API no longer functions.
- **No native TTL in `kvStore`**: Worked around with probabilistic garbage collection.
- **`ServerCallRequired` constraint**: State mutations must occur inside async button handlers, not inside `useAsync` render callbacks.

---

## Roadmap

- Mod Mail integration for automatic incident reports
- Temporal pattern recognition for recurring attack signatures
- Cross-subreddit federated threat intelligence (anonymized)
- Lightweight NLP toxicity scoring layer
- Real-time dashboard auto-refresh via `useInterval`

---

## License

MIT
