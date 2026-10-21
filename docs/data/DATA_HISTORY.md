# Historical data coverage (History app)

Atlas's **History** app displays route frequency changes over a 10-year period. This document details the history model, the status of audited systems, and deferred agencies.

---

## History model & eligibility

For an agency to show up in the History app, it must satisfy both of these:
*   **Distinct Years** (frontend eligibility): Must have at least **10 distinct real snapshot years** across its route snapshots, none after the build year (`MIN_HISTORY_DISTINCT_YEARS = 10` in `shared/historyEligibility.ts`). `coverage.json` coverage years no longer count: a year counts only when a route has a snapshot for it.
*   **Change Detection** (`pipeline/build-history.ts`): Must have at least **1 route** with a recorded headway change that differs from current live data before it is compiled into the history config at all.

### History v2 snapshots (additive, versioned)

Each v2 snapshot carries `v2: {refDate, key, rep, sat?, sun?, flag?}`; old snapshots stay as they are.

*   **Real date.** `refDate` is the service day the processor read (the same auto-detected reference date as the map). A v2 snapshot's `year` is the year of `refDate`; an old snapshot keeps the year of its period key. At build time every snapshot whose year is after the build year is dropped (no archive file is rewritten).
*   **Dropped snapshots are reported.** The build also drops any snapshot with an empty or unparseable label, an unreadable `refDate`, or no year, and lists each in `tmp/history-build-report.json` (slug, route, label, reason).
*   **One per route per year.** Snapshots group by (route key, year). The winner is the latest `refDate` (when both have one), else the latest period key, then `processedAt`. If two disagree by more than 25% the later is kept and the build report counts it. Snapshots are ordered by real date, never by month-name labels.
*   **Representative weekday value.** `rep.h` is the route's all-day value (`routeAllDayHeadway`: worst direction, main-stretch median, settled rules), never the fastest pattern or direction 0. The no-service sentinel (or a route whose rows are all `span`) is stored as `rep.lim`, with no number. No stamp means blank. `rep.p` holds the per-period values (`routeFilterHeadwayByPeriod`, else `worstDirectionHeadwayByPeriod`). A limited or blank v2 snapshot is dropped from the published list rather than filled from an old pattern minimum.
*   **Weekend.** `sat` / `sun` are optional; a missing key is unknown (blank), never 0. `{none:true}` is stored only when the feed's calendar proves it (`pipeline/historyWeekend.ts`): the reference week is inside the calendar window, calendar.txt has rows, none of the route's services flags the day and none is added on that weekday, the route has weekday service, and either other routes run the day or nothing in the feed does or adds it. Expired or non-covering calendars stay blank, and a one-day holiday row never counts as Saturday service.
*   **Flags.** `flag` is `fast` (under 2 min), `slow` (over 300 min) or `limited`. Stored only; nothing is hidden anywhere.
*   **Keys.** `historyRouteKey` (short name, else route_id, else long name) is the only key function; backfills must not skip a blank short name (a test enforces it). The display name is the long name, then the key.
*   **Aliases.** `config/history-route-aliases.json` (`{slug: {canonicalKey: [oldKeys]}}`) folds old keys into the canonical key before the one-per-year rule. It is empty until an alias is verified from data. Candidate to verify first: gcrta `HealthLine` -> `HL` (already a manual current-name alias in `build-history.ts`).
*   **Storage.** Immutable sidecar objects `history-v2/{slug}/{periodKey}.json` (all routes of one agency period). Per-route archive files are untouched; `build-history` joins by period key, never by label. A sidecar with the same key and different content is a conflict, not an overwrite.
*   **Change detection.** The fingerprint is weekday + Saturday + Sunday headlines; unknown is a wildcard, so an old baseline against a new snapshot is not a change. `latest.json` gains `sat`/`sun` (and `wk`, marked `v: 2`).
*   **Visibility report (report-only).** `visibility` in the build report lists per agency: (a) current routes with no kept snapshot in the last 5 years, (b) history keys that match no current route (candidate split or renumbered keys; aliases count as a match), (c) spikes, a weekday value at least 5x both the previous and next kept snapshot (route, label, values). Nothing is dropped, hidden or changed by it.
*   **Writers.** `refresh` writes v2 only with `ATLAS_HISTORY_V2=1` (opt-in). `pipeline/backfill-history-v2.ts` rebuilds sidecars from archived zips into a local `--out-dir` and never touches R2.

### Data sourcing
Historical snapshots are compiled via two methods:
1.  **Weekly Snapshots (Automated)**: Since the pipeline's launch, weekly runs (`refresh.ts`) automatically archive headway changes under `history/{slug}/{routeShortName}/{periodKey}.json` in `atlas-archive`.
2.  **Historical Backfilling (One-off)**: Running `pipeline/backfill-mdb-history.ts` fetches dataset archives from the **Mobility Database (MDB) API** dating back to ~2013-2016, processes them chronologically, and writes the snapshot history.

---

## Audited agencies status log

### 1. Active & fully backfilled (10+ years)

| Agency (Slug) | MDB Feed ID | Years Covered | Snapshots Compiled | Status / Notes |
| --- | --- | --- | --- | --- |
| **GCRTA** (`gcrta`) | N/A | 2014 - 2026 | 13 years | Manually seeded pre-pipeline + manual zips backfill. |
| **CDTA** (`cdta`) | N/A | 2015 - 2026 | 11 years | Backfilled via manual archive zips. |
| **IndyGo** (`indygo`) | N/A | 2015 - 2025 | 10 years | Backfilled via manual archive zips. |
| **Burlington Transit** (`burlington`) | `mdb-724` | 2015 - 2026 | 10 years | Backfilled via Mobility Database. |
| **Community Transit** (`communitytransit`) | N/A | 2016 - 2026 | 11 years | Backfilled via manual archive zips. |
| **Kingston Transit** (`kingston`) | `mdb-733` | 2016 - 2027 | 10 years | Backfilled via Mobility Database. |
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

The trip-time-over-years experiment is intended to start with rail because alignments change less often than bus. Candidate selection still needs a separate audit; see the experiment note in `docs/roadmap/EXPERIMENT_IDEAS.md`.

---

### 3. Research candidates (1–9 live years)

These 21 agencies are the research pool for reaching the 10-year History threshold. Counts below come from the live `history-config.json` catalog as of 2026-09-28; unusual future-dated years need validation before being treated as real coverage. The pool combines agencies close to eligibility with agencies that have a strong historical service-change story or an unusually promising archive source.

| Agency | Live years | Gap to threshold | Research result |
| --- | ---: | ---: | --- |
| **SacRT** (`sacrt`) | 8 | 2 | **Partial** — manual archive backfill covers 2012–2026, but the compiled snapshot catalog currently contains only eight distinct years. |
| **Brampton Transit** (`brampton`) | 9 | 1 | **Strong** — MDB `mdb-729` has archived datasets from 2014–2023; the current feed is separately catalogued for 2024–2026. |
| **NORTA** (`norta`) | 8 | 2 | **Strong** — RIDE’s WordPress media archive exposes official RTA ZIPs from 2012–2021; all ten processed locally with no skips, producing 140 route-history snapshots. |
| **Caltrain** (`caltrain`) | 4 | 6 | **Strong** — MDB `mdb-54` has datasets from 2017–2026; a 2017 feed processed locally with no validation errors. |
| **AC Transit** (`actransit`) | 3 | 7 | **Blocked/low** — MDB history currently reaches only 2025–2026 and the current producer feed requires an API key. |
| **BART** (`bart`) | 3 | 7 | **Promising** — MDB `mdb-53` covers 2021–2026, and two older official samples were recovered and processed locally: a 2017-dated ZIP through 2018 and an archived feed through 2020. |
| **NFTA** (`nfta`) | 3 | 7 | **Strong** — MDB `mdb-465` supplied seven datasets from 2017–2023; all processed locally, and Atlas’s 2024–2026 records complete a ten-year span. |
| **PATH** (`path`) | 3 | 7 | **Open research** — no MDB archive path is configured; Transitland and community archives are the next sources. |
| **Transfort** (`transfort`) | 3 | 7 | **Partial recovery** — [Transitland lists 45 archived feed versions](https://www.transit.land/feeds/f-9xj-transfortcityoffortcollins), reaching back to 2016; a healthy 2016 Wayback sample was recovered and processed, but later captures resolve to a 2022 file and the remaining archive versions require Transitland access. |
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
| **MBTA** (`mbta`) | 1 | 9 | **Strong** — MBTA’s official archive supplied one processable feed for each year from 2010–2019; all ten downloaded and processed locally, producing 675 route-history snapshots. |
| **Edmonton Transit Service** (`edmonton`) | 1 | 9 | **Strong story / weak archive** — Valley Line LRT expansion is compelling, but historical GTFS recovery still needs work. |
| **Calgary Transit** (`calgary`) | 1 | 9 | **Strong story / weak archive** — Green Line expansion is compelling, but MDB `mdb-712` currently reaches only 2024–2026. |
| **Toronto Transit Commission** (`ttc`) | 1 | 9 | **Strong story / weak archive** — annual network plans provide a change trail, while MDB `mdb-2253` currently reaches 2024–2026. |

The first archive pass should use the [Mobility Database](https://mobilitydatabase.org/faq) and [Transitland feed archive](https://www.transit.land/feeds/archive/), then agency-specific sources. Confirmed leads include the [RIDE New Orleans historical RTA archive](https://rideneworleans.org/opendata/gtfs/), its [published media archive](https://rideneworleans.org/wp-json/wp/v2/media?search=GTFS&per_page=100), the [MBTA historical GTFS archive](https://github.com/mbta/gtfs-documentation/blob/master/reference/gtfs-archive.md), the [Transitland Transfort archive](https://www.transit.land/feeds/f-9xj-transfortcityoffortcollins), [BART’s official GTFS page](https://www.bart.gov/schedules/developers/gtfs), and the Mobility Database histories for [Caltrain](https://mobilitydatabase.org/feeds/gtfs/mdb-54), [AC Transit](https://mobilitydatabase.org/feeds/gtfs/mdb-2455), and [BART](https://mobilitydatabase.org/feeds/gtfs/mdb-53). Service-change leads include [WMATA's network redesign](https://www.wmata.com/news/metro-budget-proposal-includes-targeted-rail-service-increases-adopts-bus-network-redesign.html), [Edmonton's LRT expansion](https://www.edmonton.ca/projects_plans/transit/future-lrt-projects), and [TTC's annual service plan](https://www.ttc.ca/about-the-ttc/projects-and-plans/2025-Annual-Service-Plan).

Local validation has confirmed that the Atlas processor can read historical BART, Brampton, Caltrain, NFTA, NORTA, Transfort, and Worcester feeds without validation errors. The dry-run reports now carry explicit coverage metadata for valid source years: Brampton (10), Caltrain (10), NFTA (7 historical plus Atlas’s current 2024–2026 records), Worcester (12), MBTA (10), and NORTA (10). Route-change snapshot counts can be lower than coverage-year counts when a route’s headway stays unchanged. Transfort’s recovered 2016 sample was healthy, but it is not yet a ten-year backfill.

### Prepared local batches

These are local-only dry-run results. They have not been published to R2.

| Agency | Source years processed locally | Route-history snapshots | Result |
| --- | ---: | ---: | --- |
| Brampton Transit | 2014–2023 | 196 | Ready; 10 coverage years |
| Caltrain | 2017–2026 | 13 | Ready; 10 coverage years |
| NFTA | 2017–2023 | 115 | Combine 7 historical coverage years with Atlas’s 2024–2026 records |
| Worcester RTA | 2013–2026 | 109 | Ready; 12 coverage years |
| MBTA | 2010–2019 | 675 | Ready; 10 coverage years |
| NORTA | 2012–2021 | 140 | Ready; 10 coverage years |

---

### 4. Deferred / low-feasibility agencies

These agencies were audited but cannot be backfilled automatically due to missing datasets or API restrictions:

*   **Hamilton Street Railway** (`hamilton` / `mdb-2358`)
    *   *Checked*: August 2026.
    *   *Reason*: Mobility Database only has 1 dataset from 2025.
