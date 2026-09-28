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

### 3. Research candidates (1–9 live years)

These 20 agencies are the current research pool for reaching the 10-year History threshold. Counts below come from the live `history-config.json` catalog as of 2026-09-28; unusual future-dated years need validation before being treated as real coverage. The pool combines agencies close to eligibility with agencies that have a strong historical service-change story or an unusually promising archive source.

| Agency | Live years | Gap to threshold | Initial assessment |
| --- | ---: | ---: | --- |
| **Brampton Transit** (`brampton`) | 9 | 1 | Best first target; configured open-data source may provide another historical feed. |
| **NORTA** (`norta`) | 8 | 2 | Worth searching, but current source history appears limited. |
| **Caltrain** (`caltrain`) | 4 | 6 | Rail agency; search official schedule archives and historical feed mirrors. |
| **AC Transit** (`actransit`) | 3 | 7 | Search needed; direct feed access currently requires an API token. |
| **BART** (`bart`) | 3 | 7 | Search official and community schedule archives. |
| **NFTA** (`nfta`) | 3 | 7 | Search historical GTFS and agency archive sources. |
| **PATH** (`path`) | 3 | 7 | Search historical GTFS and agency archive sources. |
| **Transfort** (`transfort`) | 3 | 7 | Validate future-dated entries, then search historical feeds. |
| **WMATA** (`wmata`) | 3 | 7 | Search official and community schedule archives. |

The following agencies are lower-confidence extensions of the pool, but each has either older-than-2026 coverage or a specific reason to expect a meaningful historical story:

| Agency | Live years | Gap to threshold | Initial assessment |
| --- | ---: | ---: | --- |
| **GRTC** (`grtc`) | 2 | 8 | Search for older Richmond GTFS archives beyond 2024. |
| **Kitsap Transit** (`kitsaptransit`) | 2 | 8 | Search for historical agency or regional feed archives beyond 2021. |
| **Niagara Transit** (`niagara`) | 2 | 8 | Search for historical agency and regional feed archives beyond 2021. |
| **StarMetro** (`starmetro`) | 2 | 8 | Search historical agency and community feed archives beyond 2024. |
| **Tulsa Transit** (`tulsa-transit`) | 2 | 8 | Search for older GTFS archives beyond 2023. |
| **Worcester RTA** (`wrta`) | 2 | 8 | Search for older GTFS archives beyond 2020. |
| **Western Reserve Transit Authority** (`youngstown-wrta`) | 2 | 8 | Search for older GTFS archives beyond 2020. |
| **MBTA** (`mbta`) | 1 | 9 | Highest-confidence one-year candidate: the MBTA publishes an official historical GTFS archive. |
| **Edmonton Transit Service** (`edmonton`) | 1 | 9 | High-interest one-year candidate: the Valley Line LRT expansion creates a clear before/after service story. |
| **Calgary Transit** (`calgary`) | 1 | 9 | High-interest one-year candidate: the Green Line project creates a clear network-expansion story. |
| **Toronto Transit Commission** (`ttc`) | 1 | 9 | High-interest one-year candidate: annual network plans provide a route and service-change trail. |

The first archive pass should use the [Mobility Database](https://mobilitydatabase.org/faq) and [Transitland feed archive](https://www.transit.land/feeds/archive/), then agency-specific sources. Confirmed leads include the [RIDE New Orleans historical RTA archive](https://rideneworleans.org/opendata/gtfs/), the [MBTA historical GTFS archive](https://github.com/mbta/gtfs-documentation/blob/master/reference/gtfs-archive.md), and the Mobility Database histories for [Caltrain](https://mobilitydatabase.org/feeds/gtfs/mdb-54), [AC Transit](https://mobilitydatabase.org/feeds/gtfs/mdb-2455), and [BART](https://mobilitydatabase.org/feeds/gtfs/mdb-53). Service-change leads include [WMATA's network redesign](https://www.wmata.com/news/metro-budget-proposal-includes-targeted-rail-service-increases-adopts-bus-network-redesign.html), [Edmonton's LRT expansion](https://www.edmonton.ca/projects_plans/transit/future-lrt-projects), and [TTC's annual service plan](https://www.ttc.ca/about-the-ttc/projects-and-plans/2025-Annual-Service-Plan).

---

### 4. Deferred / Low-Feasibility Agencies

These agencies were audited but cannot be backfilled automatically due to missing datasets or API restrictions:

*   **Hamilton Street Railway** (`hamilton` / `mdb-2358`)
    *   *Checked*: August 2026.
    *   *Reason*: Mobility Database only has 1 dataset from 2025.
