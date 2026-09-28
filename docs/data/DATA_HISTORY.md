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
| **SacRT** (`sacrt`) | N/A | 2012 - 2026 | 8 years | Backfilled via manual archive zips. The calendar span is long enough for the goal, but the compiled snapshot count still needs to satisfy the 10-distinct-year UI eligibility check. |
| **Metro Transit** (`metro-transit`) | `mdb-205` | 2016 - 2026 | 11 years | Backfilled (August 2026). Dynamic URLs updated in `index.json`. |
| **Grand River Transit** (`grt`) | `mdb-721` | 2016 - 2026 | 11 years | Backfilled (August 2026) using deprecated source ID redirect. |
| **MARTA** (`marta`) | `mdb-368` | 2013 - 2026 | 14 years | Backfilled via Mobility Database. |
| **RTD Denver** (`rtd-denver`) | `mdb-178` | 2013 - 2026 | 14 years | Backfilled via Mobility Database. |
| **STM** (`stm`) | `mdb-2126` | 2013 - 2026 | 14 years | Backfilled via Mobility Database. |

The trip-time-over-years experiment is intended to start with rail because alignments change less often than bus. Candidate selection still needs a separate audit; see the experiment note in `docs/roadmap/EXPERIMENTS.md`.

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

### 3. Research candidates (3–9 live years)

These agencies have enough existing history to justify a broader web/archive search, but are not yet eligible for the 10-year History threshold. Counts below come from the live `history-config.json` catalog as of 2026-09-28; unusual future-dated years need validation before being treated as real coverage.

| Agency | Live years | Gap to threshold | Initial assessment |
| --- | ---: | ---: | --- |
| **Brampton Transit** (`brampton`) | 9 | 1 | Best first target; configured open-data source may provide another historical feed. |
| **NORTA** (`norta`) | 8 | 2 | Worth searching, but current source history appears limited. |
| **Caltrain** (`caltrain`) | 4 | 6 | Rail agency; search official schedule archives and historical feed mirrors. |
| **AC Transit** (`actransit`) | 3 | 7 | Search needed; direct feed access currently requires an API token. |
| **BART** (`bart`) | 3 | 7 | Search official and community schedule archives. |
| **NFTA** (`nfta`) | 3 | 7 | Search historical GTFS and agency archive sources. |
| **PATH** (`path`) | 3 | 7 | Search historical GTFS and agency archive sources. |
| **Petaluma Transit** (`petaluma`) | 3 | 7 | Validate the future-dated entry before searching for older feeds. |
| **Simi Valley Transit** (`simi-valley`) | 3 | 7 | Validate the future-dated entry before searching for older feeds. |
| **Transfort** (`transfort`) | 3 | 7 | Validate future-dated entries, then search historical feeds. |
| **WMATA** (`wmata`) | 3 | 7 | Search official and community schedule archives. |

---

### 4. Deferred / Low-Feasibility Agencies

These agencies were audited but cannot be backfilled automatically due to missing datasets or API restrictions:

*   **AC Transit** (`actransit` / `mdb-2455`)
    *   *Checked*: August 2026.
    *   *Reason*: Major gap in Mobility Database. Only 3 distinct years available (2024-2026, 11 datasets). Missing 2016–2023.
    *   *API issue*: Direct `feedUrl` requires a developer API token (returns 401 Unauthorized).
*   **Richmond GRTC** (`grtc` / `mdb-902`)
    *   *Checked*: August 2026.
    *   *Reason*: Mobility Database only has 1 dataset from 2024.
*   **Hamilton Street Railway** (`hamilton` / `mdb-2358`)
    *   *Checked*: August 2026.
    *   *Reason*: Mobility Database only has 1 dataset from 2025.
