# Historical Data Coverage (History App)

Atlas's **History** app displays route frequency changes over a 10-year period. This document details the history model, the status of audited systems, and deferred agencies.

---

## History Model & Eligibility

For an agency to show up in the History app, it must satisfy the eligibility criteria defined in the frontend:
*   **Distinct Years**: Must have at least **10 distinct years** of historical snapshots (`MIN_HISTORY_DISTINCT_YEARS >= 10` in `shared/historyEligibility.ts`).
*   **Change Detection**: Must have at least **1 route** with a recorded headway change that differs from current live data.

### Data Sourcing
Historical snapshots are compiled via two methods:
1.  **Weekly Snapshots (Automated)**: Since the pipeline's launch, weekly runs (`refresh.ts`) automatically archive headway changes under `history/{slug}/{routeShortName}/{periodKey}.json` in `atlas-archive`.
2.  **Historical Backfilling (One-off)**: Running `pipeline/backfill-mdb-history.ts` fetches dataset archives from the **Mobility Database (MDB) API** dating back to ~2013-2016, processes them chronologically, and writes the snapshot history.

---

## Audited Agencies Status Log

### 1. Active & Fully Backfilled (10+ Years)

| Agency (Slug) | MDB Feed ID | Years Covered | Snapshots Compiled | Status / Notes |
| --- | --- | --- | --- | --- |
| **GCRTA** (`gcrta`) | N/A | 2014 - 2026 | 13 years | Manually seeded pre-pipeline + manual zips backfill. |
| **CDTA** (`cdta`) | N/A | 2015 - 2026 | 11 years | Backfilled via manual archive zips. |
| **IndyGo** (`indygo`) | N/A | 2015 - 2025 | 10 years | Backfilled via manual archive zips. |
| **Burlington Transit** (`burlington`) | `mdb-724` | 2015 - 2026 | 10 years | Backfilled via Mobility Database. |
| **Community Transit** (`communitytransit`) | N/A | 2016 - 2026 | 11 years | Backfilled via manual archive zips. |
| **Kingston Transit** (`kingston`) | `mdb-733` | 2016 - 2027 | 10 years | Backfilled via Mobility Database. |
| **SacRT** (`sacrt`) | N/A | 2012 - 2026 | 8 years | Backfilled via manual archive zips. Span satisfies 10-year goal. |
| **Metro Transit** (`metro-transit`) | `mdb-205` | 2016 - 2026 | 11 years | Backfilled (August 2026). Dynamic URLs updated in `index.json`. |
| **Grand River Transit** (`grt`) | `mdb-721` | 2016 - 2026 | 11 years | Backfilled (August 2026) using deprecated source ID redirect. |
| **Brampton Transit** (`brampton`) | `mdb-729` | 2016 - 2026 | 11 years | Backfilled (August 2026) using dynamic open data feeds. |

---

### 2. High-Feasibility Candidates (Awaiting Backfill)

These agencies have verified, complete 10+ year dataset history on the Mobility Database and can be backfilled immediately:

*   **Detroit DDOT** (`ddot` / `mdb-464`)
    *   *Checked*: August 2026.
    *   *MDB Coverage*: 2014 - 2026 (56 datasets).
    *   *Feasibility*: Very High.
*   **Spokane Transit** (`spokane` / `mdb-290`)
    *   *Checked*: August 2026.
    *   *MDB Coverage*: 2013 - 2026 (152 datasets).
    *   *Feasibility*: Very High.
*   **Halifax Transit** (`halifax` / `mdb-734`)
    *   *Checked*: August 2026.
    *   *MDB Coverage*: 2013 - 2026 (89 datasets).
    *   *Feasibility*: Very High.

---

### 3. Deferred / Low-Feasibility Agencies

These agencies were audited but cannot be backfilled automatically due to missing datasets or API restrictions:

*   **AC Transit** (`actransit` / `mdb-2455`)
    *   *Checked*: August 2026.
    *   *Reason*: Major gap in Mobility Database. Only 3 distinct years available (2024-2026, 11 datasets). Missing 2016–2023.
    *   *API issue*: Direct `feedUrl` requires a developer API token (returns 401 Unauthorized).
*   **New Orleans NORTA** (`norta` / `ntd-60032`)
    *   *Checked*: August 2026.
    *   *Reason*: Mobility Database only has datasets from 2024-2026 (15 datasets). Cannot automatically backfill 10 years or show post-Katrina recovery.
*   **Richmond GRTC** (`grtc` / `mdb-902`)
    *   *Checked*: August 2026.
    *   *Reason*: Mobility Database only has 1 dataset from 2024.
*   **Hamilton Street Railway** (`hamilton` / `mdb-2358`)
    *   *Checked*: August 2026.
    *   *Reason*: Mobility Database only has 1 dataset from 2025.
