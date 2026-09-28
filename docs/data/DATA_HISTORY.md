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
| **Detroit DDOT** (`ddot`) | `mdb-464` | 2014 - 2027 | 12 years | Backfilled; live catalog now meets the 10-year threshold. |
| **Halifax Transit** (`halifax`) | `mdb-734` | 2013 - 2026 | 12 years | Backfilled; live catalog now meets the 10-year threshold. |
| **MARTA** (`marta`) | `mdb-368` | 2013 - 2026 | 14 years | Backfilled via Mobility Database. |
| **Miami-Dade Transit** (`miami-dade-transit`) | N/A | 2013 - 2026 | 12 years | Live catalog now meets the 10-year threshold. |
| **Metro St. Louis** (`metrostlouis`) | N/A | 2015 - 2026 | 11 years | Live catalog now meets the 10-year threshold. |
| **RTD Denver** (`rtd-denver`) | `mdb-178` | 2013 - 2026 | 14 years | Backfilled via Mobility Database. |
| **Spokane Transit** (`spokane`) | `mdb-290` | 2013 - 2027 | 12 years | Backfilled; live catalog now meets the 10-year threshold. |
| **STM** (`stm`) | `mdb-2126` | 2013 - 2026 | 14 years | Backfilled via Mobility Database. |
| **LA Metro** (`lacmta`) | N/A | 2013 - 2026 | 10 years | Live catalog now meets the 10-year threshold. |

The trip-time-over-years experiment is intended to start with rail because alignments change less often than bus. Candidate selection still needs a separate audit; see the experiment note in `docs/roadmap/EXPERIMENTS.md`.

---

### 3. Research candidates (1–9 live years)

These 20 agencies are the current research pool for reaching the 10-year History threshold. Counts below come from the live `history-config.json` catalog as of 2026-09-28; unusual future-dated years need validation before being treated as real coverage. The pool combines agencies close to eligibility with agencies that have a strong historical service-change story or an unusually promising archive source.

| Agency | Live years | Gap to threshold | Research result |
| --- | ---: | ---: | --- |
| **Brampton Transit** (`brampton`) | 9 | 1 | **Strong** — MDB `mdb-729` has archived datasets from 2014–2023; the current feed is separately catalogued for 2024–2026. |
| **NORTA** (`norta`) | 8 | 2 | **Promising but incomplete** — RIDE’s archive exposes 2021–2025 RTA feed links; the 2025 file processed locally, while the older linked files and a 2017 Transitland archive URL currently return 404. |
| **Caltrain** (`caltrain`) | 4 | 6 | **Strong** — MDB `mdb-54` has datasets from 2017–2026; a 2017 feed processed locally with no validation errors. |
| **AC Transit** (`actransit`) | 3 | 7 | **Blocked/low** — MDB history currently reaches only 2025–2026 and the current producer feed requires an API key. |
| **BART** (`bart`) | 3 | 7 | **Medium** — MDB `mdb-53` has repeated datasets from 2021–2026, but older coverage needs another archive. |
| **NFTA** (`nfta`) | 3 | 7 | **Strong** — MDB `mdb-465` supplied seven datasets from 2017–2023; all processed locally, and Atlas’s 2024–2026 records complete a ten-year span. |
| **PATH** (`path`) | 3 | 7 | **Open research** — no MDB archive path is configured; Transitland and community archives are the next sources. |
| **Transfort** (`transfort`) | 3 | 7 | **Open research** — official current feed is available, but no historical source is confirmed yet. |
| **WMATA** (`wmata`) | 3 | 7 | **Medium story / weak archive** — MDB `mdb-1846` currently has 2024–2026 datasets; network redesign evidence makes deeper archive recovery worthwhile. |

The following agencies are lower-confidence extensions of the pool, but each has either older-than-2026 coverage or a specific reason to expect a meaningful historical story:

| Agency | Live years | Gap to threshold | Research result |
| --- | ---: | ---: | --- |
| **GRTC** (`grtc`) | 2 | 8 | **Low** — MDB `mdb-902` currently has one 2024 dataset; search would need to find an independent archive. |
| **Kitsap Transit** (`kitsaptransit`) | 2 | 8 | **Low/medium** — MDB `mdb-1304` currently reaches 2024–2026; older coverage is unconfirmed. |
| **Niagara Transit** (`niagara`) | 2 | 8 | **Open research** — current feed is available, but no historical archive has been confirmed. |
| **StarMetro** (`starmetro`) | 2 | 8 | **Open research** — official current feed is available; historical schedule sources still need to be found. |
| **Tulsa Transit** (`tulsa-transit`) | 2 | 8 | **Low/medium** — MDB `tld-235` currently reaches 2024–2026; search for earlier feeds beyond Atlas’s 2023 record. |
| **Worcester RTA** (`wrta`) | 2 | 8 | **Strong** — MDB `mdb-432` has datasets from 2013–2026; a 2013 feed processed locally with no validation errors. |
| **Western Reserve Transit Authority** (`youngstown-wrta`) | 2 | 8 | **Low/medium** — MDB `tld-1717` currently reaches 2024–2026; older coverage is unconfirmed. |
| **MBTA** (`mbta`) | 1 | 9 | **Strong** — MBTA’s official archive supplied one feed for each year from 2010–2019; all ten processed locally with no skipped feeds, producing 636 comparable route-history snapshots. |
| **Edmonton Transit Service** (`edmonton`) | 1 | 9 | **Strong story / weak archive** — Valley Line LRT expansion is compelling, but historical GTFS recovery still needs work. |
| **Calgary Transit** (`calgary`) | 1 | 9 | **Strong story / weak archive** — Green Line expansion is compelling, but MDB `mdb-712` currently reaches only 2024–2026. |
| **Toronto Transit Commission** (`ttc`) | 1 | 9 | **Strong story / weak archive** — annual network plans provide a change trail, while MDB `mdb-2253` currently reaches 2024–2026. |

The first archive pass should use the [Mobility Database](https://mobilitydatabase.org/faq) and [Transitland feed archive](https://www.transit.land/feeds/archive/), then agency-specific sources. Confirmed leads include the [RIDE New Orleans historical RTA archive](https://rideneworleans.org/opendata/gtfs/), the [MBTA historical GTFS archive](https://github.com/mbta/gtfs-documentation/blob/master/reference/gtfs-archive.md), and the Mobility Database histories for [Caltrain](https://mobilitydatabase.org/feeds/gtfs/mdb-54), [AC Transit](https://mobilitydatabase.org/feeds/gtfs/mdb-2455), and [BART](https://mobilitydatabase.org/feeds/gtfs/mdb-53). Service-change leads include [WMATA's network redesign](https://www.wmata.com/news/metro-budget-proposal-includes-targeted-rail-service-increases-adopts-bus-network-redesign.html), [Edmonton's LRT expansion](https://www.edmonton.ca/projects_plans/transit/future-lrt-projects), and [TTC's annual service plan](https://www.ttc.ca/about-the-ttc/projects-and-plans/2025-Annual-Service-Plan).

Local validation has confirmed that the Atlas processor can read historical Brampton, Caltrain, NFTA, and Worcester feeds without validation errors; Caltrain’s full 2017–2026 ten-year sample, NFTA’s 2017–2023 historical sample, and MBTA’s official 2010–2019 archive sample were processed through the dry-run path. NORTA’s available 2025 archive feed also processed successfully, but older archive URLs require recovery before a full NORTA backfill is possible.

---

### 4. Deferred / Low-Feasibility Agencies

These agencies were audited but cannot be backfilled automatically due to missing datasets or API restrictions:

*   **Hamilton Street Railway** (`hamilton` / `mdb-2358`)
    *   *Checked*: August 2026.
    *   *Reason*: Mobility Database only has 1 dataset from 2025.
