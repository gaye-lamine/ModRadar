# ModRadar — Devpost Additional Info Section

Here are the detailed answers for the **Additional Info** section of your Devpost submission.

---

### 1. Sponsor / Special Prizes
*   **Select all that apply**: Check **Devvit Helper Award** and **Feedback Awards**.
    *   *Why*: Our project provides valuable feedback regarding the Devvit SDK (e.g., deprecated `submitCustomPost()` API documentation and Asyncify `ServerCallRequired` try/catch constraints).

---

### 2. Reddit Username
*   `u/CartographerFirst755` (and the app bot account `u/modradar-shield`)

---

### 3. developers.reddit.com App Page
*   `https://developers.reddit.com/apps/modradar-shield`

---

### 4. Tool Overview
**ModRadar** is a predictive real-time raid and brigading shield for Reddit built on Devvit. It acts as an automated, proactive gatekeeper to prevent subreddits from being overwhelmed during massive traffic anomalies (raids, coordinated spam, or brigading).

#### Key Capabilities & Bot Functionality:
1. **Real-time Ingestion Tracking**: ModRadar hooks into `CommentSubmit` events. It logs comment metadata into one-minute time-series buckets inside Devvit `kvStore` to compute real-time ingestion velocity.
2. **Sequential Security Middleware**: Every comment is evaluated sequentially against account age checks, comment velocity spikes, and Jaccard Proximity match against blacklist subreddits (Jaccard similarity index).
3. **Automated Defensive Actions**: If a comment's calculated risk score exceeds the moderator's configured threshold (e.g., 75/100), the bot automatically removes the comment silently using `context.reddit.remove()` and routes it to the Mod Queue.
4. **Emergency Auto-Lockdown**: If the global velocity delta reaches `CRITICAL` levels, the system automatically triggers a temporary subreddit lockdown and schedules a recovery job via `scheduler` to release it after a moderator-defined duration (default: 30 minutes).
5. **Interactive NOC Console**: A premium, live Custom Post dashboard allows moderators to:
    * View live security alerts (`LOW` / `MEDIUM` / `HIGH` / `CRITICAL`).
    * Analyze comment volume & velocity delta on a 15-minute telemetry bar chart.
    * Inspect flagged threat vectors (user, risk score, triggered rules).
    * Manually activate/deactivate emergency lockdowns instantly.

---

### 5. Project Impact
Here are 3 types of communities that would find ModRadar highly beneficial:

1. **High-Velocity Discussion Subreddits (e.g., r/worldnews, r/politics)**:
   * *Impact*: These subreddits are frequent targets of brigading and political astroturfing. ModRadar saves moderators hours of manual purging by automatically filtering comments from coordinated groups of brand-new accounts while skipping trusted users under low-traffic conditions.
2. **Financial and Cryptocurrency Subreddits (e.g., r/CryptoCurrency)**:
   * *Impact*: Highly targeted by coordinated spam rings, pump-and-dump groups, and karma-farming bot networks. ModRadar's Jaccard Proximity Analysis instantly catches users with high overlap in known "karma-farming" subreddits and blocks them before their comments disrupt threads.
3. **Medium to Large Entertainment Communities (e.g., r/gaming, r/movies)**:
   * *Impact*: Spoilers, review-bombing, and toxic spam waves are common during major release windows. ModRadar provides automatic emergency lockdown protection, giving moderation teams a breather to coordinate during flash mobs or viral traffic waves.

---

### 6. Is this a new app or a migrated app?
*   Select: **New App**

---

### 7. [For Ported Projects] Original Bot Username
*   `N/A`

---

### 8. [For Ported Projects] Port Completion
*   `N/A`

---

### 9. [For Ported Projects] Are you the original owner of this migration?
*   `N/A`

---

### 10. Nominate a most helpful user
*   `N/A` (or list any community helper from r/Devvit or Discord if they helped you with troubleshooting or resource sharing).
