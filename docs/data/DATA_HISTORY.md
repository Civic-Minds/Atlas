# Historical data coverage (History app)

Atlas's **History** app displays route frequency changes over a 10-year period. This document details the history model, the status of audited systems, and deferred agencies.

---

## History model & eligibility

For an agency to show up in the History app, it must satisfy both of these:
*   **Distinct Years** (frontend eligibility): Must have at least **10 distinct years** across its route snapshots and any `history/{slug}/coverage.json` coverage years (`MIN_HISTORY_DISTINCT_YEARS = 10` in `shared/historyEligibility.ts`). This is the default rule and is unchanged. Under History v2 (`ATLAS_HISTORY_V2=1`, passed by the build as `realYearsOnly: true`) only **real snapshot years** count, none after the build year, and `coverage.json` years are ignored (this shrinks the public list from 22 to 16 agencies, so it is not on by default).
*   **Change Detection** (`pipeline/build-history.ts`): Must have at least **1 route** with a recorded headway change that differs from current live data before it is compiled into the history config at all.

### History v2 is opt-in: one flag, `ATLAS_HISTORY_V2=1`

History v2 is **flag-gated, not additive**. `refresh-feeds.yml` runs `build-history` every Monday and writes the public `history-config.json`, so with `ATLAS_HISTORY_V2` unset (the cron) the build output is **byte-identical to the pre-v2 build** (`pipeline/__tests__/buildHistoryDefaultGolden.test.ts` compares it with a golden made by origin/main's own `build-history.ts` on a synthetic multi-agency fixture). Only the exact value `1` turns v2 on. Every v2 behaviour below runs only behind it:

*   **Build (`pipeline/build-history.ts`)**: the sidecar join, alias merging, one snapshot per route per year, dropping future/blank-label/unparseable snapshots, the representative all-day value (and no `directionId` filter) on the current endpoint, skipping the current endpoint for limited routes, the build report (`tmp/history-build-report.json`) and visibility checks. Unset, the build reads no sidecars or alias file, writes no report, and keeps the old fastest-direction-0 current value.
*   **Eligibility (`shared/historyEligibility.ts`)**: an explicit option `realYearsOnly` (default `false` = the original rule), not an env read, because the file also runs in the browser. The build passes `realYearsOnly: v2` when it rewrites `shared/data/history-agencies.json`, so by default that file is written exactly as before.
*   **Route keys (`pipeline/historyRouteKey.ts`)**: the long-name fallback is the option `longNameFallback`, defaulting to the env flag, so a normal refresh creates no new keys. v2-only code (`historyV2.ts`, `historyWeekend.ts`, `backfill-history-v2.ts`) passes it explicitly. The legacy backfills (mdb, gcrta, cdta, mbta, norta) use `backfillRouteKey`: by default they skip a blank short name as they always did; under the flag they use the full key function.
*   **Writers (`pipeline/refresh.ts`)**: sidecar writes and the weekday/Saturday/Sunday fingerprint in `latest.json` run only with the flag (unchanged).
*   **Pilots**: run with `ATLAS_HISTORY_V2=1` set in the environment.

### History v2 snapshots (versioned; applies only with the flag)

Each v2 snapshot carries `v2: {refDate, key, rep, sat?, sun?, flag?}`; old snapshots stay as they are.

*   **Real date.** `refDate` is the service day the processor read (the same auto-detected reference date as the map). A v2 snapshot's `year` is the year of `refDate`; an old snapshot keeps the year of its period key. At build time every snapshot whose year is after the build year is dropped (no archive file is rewritten).
*   **Dropped snapshots are reported.** The build also drops any snapshot with an empty or unparseable label, an unreadable `refDate`, or no year, and lists each in `tmp/history-build-report.json` (slug, route, label, reason).
*   **One per route per year.** Snapshots group by (route key, year). The winner is the latest `refDate` (when both have one), else the latest period key, then `processedAt`. If two disagree by more than 25% the later is kept and the build report counts it. Snapshots are ordered by real date, never by month-name labels.
*   **Representative weekday value.** `rep.h` is the route's all-day value (`routeAllDayHeadway`: worst direction, main-stretch median, settled rules), never the fastest pattern or direction 0. The no-service sentinel (or a route whose rows are all `span`) is stored as `rep.lim`, with no number. No stamp means blank. `rep.p` holds the per-period values (`routeFilterHeadwayByPeriod`, else `worstDirectionHeadwayByPeriod`). A limited or blank v2 snapshot is dropped from the published list rather than filled from an old pattern minimum.
*   **Weekend.** `sat` / `sun` are optional; a missing key is unknown (blank), never 0. `{none:true}` is stored only when the feed's calendar proves it (`pipeline/historyWeekend.ts`): the reference week is inside the calendar window, calendar.txt has rows, none of the route's services flags the day and none is added on that weekday, the route has weekday service, and either other routes run the day or nothing in the feed does or adds it. Expired or non-covering calendars stay blank, and a one-day holiday row never counts as Saturday service.
*   **Flags.** `flag` is `fast` (under 2 min), `slow` (over 300 min) or `limited`. Stored only; nothing is hidden anywhere.
*   **Keys.** `historyRouteKey` (short name, else route_id, else, under v2 only, long name) is the only key function; no backfill skips a route inline because of a blank short name (a test enforces it; they go through the flag-gated `backfillRouteKey`). The display name is the long name, then the key.
*   **Aliases.** `config/history-route-aliases.json` (`{slug: {canonicalKey: [oldKeys]}}`) folds old keys into the canonical key before the one-per-year rule. Only aliases verified from data go in (route_id continuity plus matching descriptions and termini). Current entries are LA Metro (`lacmta`): 2/302, 30/330, 108/358, 111/311, 51/52/352, 78/79/378, 163/162 and 245/244 (both id changes happened in 2021). Caveats: `30/330` may include limited-stop 330 trips from the old combined route; `245/244` has an odd 2020 value (61 min against 36 before and 30 after). Parked for Ryan, not aliased: the combined 16 keys (16/316, 16/17/316, 16/17) and the Rapid lines (733, 760, 705). Detroit (`ddot`): 046 to 46, 023 to 23, 060 to 60, 049 to 49 (the leading zero was only used in the 2016 to 2019 feeds; same route name, route corridor and termini, and the two spellings never run in the same feed). Caveats: 46 lost its Saturday service and half its trips in 2017; 23 and 60 had terminus changes (Northland Center to Meijer Gateway; Northland Center to Evergreen & Ten Mile); 49 ends in 2017 (no current route). Parked for Ryan, not aliased: ddot 9 (the pair 9/025 is not one route: 9 was Chalmers in 2014 and 2016, Jefferson from 2018, while Jefferson was 25, then 025, then 009; folding them would collide in 2014 and 2016) and caltrain Local into Local Weekday (same all-stops service, but the old Local also carried weekend trips, so its Saturday and Sunday values would land on a weekday-only route). STM Montreal (`stm`): 19 to 20 (Chabanel / Marche Central became Crémazie / Marche Central; 19's last service day was 2026-05-17 and 20 starts 2026-05-18, so they never run together). Caveats: STM route_ids equal the short names, so there is no route_id continuity to check; the Marche Central end was rerouted and extended (about 60% of 19's stops carry over). Parked for Ryan, not aliased: 715 to 50 (same name, but only about half of 715's stops carry into 50 in 2025 and by 2026 both ends differ), 435 to 480 (480 serves about half of 435's stops, the downtown half of the old Du Parc express), 191 to 198 (191 Lionel-Groulx to Dorval became 198 Angrignon to Dorval; 491 is its own route since 2015, not a successor), 419 to 210 (express with a Fairview terminus became a local with an Anse-a-l'Orme terminus; clean handoff 2026-05-18). Not aliased, because both keys ran as separate routes in the same feed years: 58/61, 15/34, 53/55, 146/13, 405/211, 968/174. No successor found: 77, 78, 76, 109, 425, 495. Route 70 changed name from Bois-Franc to Poirier in 2026 but is the same route (same key, same Côte-Vertu to Raymond-Lasnier line), so no alias is needed.
*   **Holiday-week reference dates are dropped (blank beats wrong).** The shared reference-date picker can land on a holiday-week day at the end of a calendar_dates-only feed (STM's Oct 2024 dataset read Sunday 2025-01-05; its weekday reading used Dec 25 / Jan 1 timetables: 20 of 153 routes were at least 1.5x both neighbours, e.g. route 14 at 51 min against 27 before and after). The 5x spike check misses this. The sidecar writer (`refresh` and `backfill-history-v2.ts`, which know the zip) now stores an optional, additive `refDateQuality: {holiday, reason, tripsOnRef, medianTrips}` computed by `pipeline/historyRefQuality.ts` from `calendar.txt`, `calendar_dates.txt` and `trips.txt` only (trips per date; no stop_times). The v2 build leaves out the whole sidecar period when `holiday` is true, plus any same-period legacy change file (read from the same date), and lists it in the build report as `droppedHolidayPeriods: [{slug, periodKey, refDate, reason, routesAffected}]`. A sidecar without the field is kept. The shared picker is untouched. Rule: flag when (a) refDate's own trips are under 60% of the median of its day type, or (b) refDate is in Dec 20 - Jan 6 AND either its own trips are under 90% of that median, or a Mon-Fri date within 3 days of it (the dates the weekday reading uses) has under 85% of the median weekday's trips. A holiday-window refDate with normal trips everywhere is kept; with fewer than 3 comparison days or a refDate outside the calendar, nothing is flagged. Thresholds come from the pilots: STM's Jan 5 2025 and Jan 4 2026 points have a normal own-day count (99%) but Jan 1 / Jan 2 weekdays at 64-67% of the median weekday; STM's five Thanksgiving-Monday refDates (2019 to 2023) sit at 69-76% of the weekday median with clean data (0 or 1 routes at 1.5x both neighbours), so a 70% own-day threshold would wrongly drop 2021 and (a) is 60%; MARTA and Denver sit at 100% everywhere. Result on the pilots: STM 2025 (dataset 20241028) and the Jan 2026 point (20251113) are dropped, so STM goes from 11 to 10 real years (still eligible, with no margin) and 2025 disappears; MARTA and Denver drop nothing. Existing sidecars get the field through `pipeline/recompute-history-ref-quality.ts --sidecar-dir --zip-dir --out-dir` (writes copies; originals are never touched). Caveats: sidecars are immutable, so the sidecar already in R2 for a period stays without the field until it is replaced; a feed with `calendar.txt` where the processor already moved to a typical week can still be flagged (blank, not wrong); regional holiday weeks outside Dec 20 - Jan 6 are not detected.
*   **Storage.** Immutable sidecar objects `history-v2/{slug}/{periodKey}.json` (all routes of one agency period). Per-route archive files are untouched; `build-history` joins by period key, never by label. A sidecar with the same key and different content is a conflict, not an overwrite.
*   **Change detection.** The fingerprint is weekday + Saturday + Sunday headlines; unknown is a wildcard, so an old baseline against a new snapshot is not a change. `latest.json` gains `sat`/`sun` (and `wk`, marked `v: 2`).
*   **Visibility report (report-only).** `visibility` in the build report lists per agency: (a) current routes with no kept snapshot in the last 5 years, (b) history keys that match no current route (candidate split or renumbered keys; aliases count as a match), (c) spikes, a weekday value at least 5x both the previous and next kept snapshot (route, label, values). Nothing is dropped, hidden or changed by it.
*   **Writers.** `refresh` writes v2 only with `ATLAS_HISTORY_V2=1` (opt-in); so does `build-history` (see the gate above). `pipeline/backfill-history-v2.ts` rebuilds sidecars from archived zips into a local `--out-dir` and never touches R2.
*   **Supplemental (rail) feeds.** Agencies with `supplementalFeedUrls` (lacmta, nfta, septa, wmata, mta-maryland): with `ATLAS_HISTORY_V2=1`, `refresh` also puts the supplemental feeds' routes in the sidecar, each built with its own feed's calendar evidence, and lists them in the sidecar's `supplementalRoutes` (feed url -> route keys). Rail routes enter History from the first snapshot actually held: no invented history, no stitching of old keys (e.g. LA Metro 2013/14 rail 801-806 stay unaliased). A route key used by both the main and a supplemental feed is never overwritten: the main route is kept and the clash is printed in the refresh log. Supplemental feeds have no archive, so `backfill-history-v2.ts` refuses these agencies unless `--bus-only` is passed; the run then uses the main feed only and its report carries `busOnly: true`, `supplementalExcluded: [urls]` and "bus feed only; supplemental routes excluded". The build report's per-agency `visibility.supplementalFeeds` gives `{url, includedInHistory, firstSnapshot}` and a log line names each feed still not in History (report only; nothing is hidden). That line lists current routes with no history, which can include bus routes, since the artifact does not say which feed a route came from.

### History v2 reader contract

What the UI reads and how. Code: `shared/historyV2Reader.ts` (pure parsing and selectors), `src/utils/historyV2Loader.ts` (thin fetch layer).

*   **Files.** (1) Sidecar `history-v2/{slug}/{periodKey}.json`: `{version: 2, slug, periodKey, refDate, routes: {routeKey: {name?, rep, sat?, sun?, flag?}}, supplementalRoutes?}`, all routes of one agency period; a build input, not served publicly. (2) Agency-level history: `{slug, routes: [{routeShortName, routeName, snapshots: [{label, year, weekdayHeadwayMin, periodKey?, v2?}]}]}`, the `build-history` output and the shape of one `history-config.json` entry (`parseHistoryAgencyV2` accepts both).
*   **Three dates.** `refDate` is the real service day the processor read (YYYYMMDD). `year` is the year of `refDate` (v2) and is what the year slider uses. `periodKey` is only the archive file key (it can sit in another year than `refDate`); never show or sort by it when `refDate` exists.
*   **One snapshot per route per year.** The build keeps a single snapshot per (route, year). `routesForYear(agency, year)` returns exactly the routes that have one that year, each with that snapshot, its `periodKey` and `refDate`. A route with no snapshot in a year is absent from that year's list: the map shows only those routes for that year. `yearsAvailable(agency)` lists the years with at least one snapshot.
*   **Values.** `snapshotValue(snapshot, 'weekday' | 'sat' | 'sun')` returns `{kind:'value', min}`, `{kind:'limited'}` (no all-day value), `{kind:'none'}` (the feed positively has no service that day: stored `{none:true}`) or `{kind:'blank'}` (unknown: key absent). Weekday comes from `rep.h` / `rep.lim`; weekend from `sat` / `sun`.
*   **Never 0.** Zero is never stored and never shown for unknown. Blank is not none; none is not 0. Do not fill a blank from another day, another year or `headwayByPeriod`.
*   **Flags are stored, not hidden.** `snapshotFlag(snapshot)` gives `fast` (under 2 min), `slow` (over 300 min) or `limited`. The UI may word or mark them but must not drop the route or value because of one.
*   **v1 fallback.** A snapshot without `v2` (old data): weekday = `weekdayHeadwayMin`, Saturday and Sunday = blank, no flag, no `refDate`.
*   **Errors.** `parseHistoryV2Sidecar` and `parseHistoryAgencyV2` never throw; they return `{ok:false, error:{code, path, message}}` with code `not-object | unsupported-version | missing-field | bad-field`. Unknown extra fields are ignored and kept, so newer data does not break old readers; a newer sidecar `version` is rejected rather than guessed at.
*   **UI must not.** Treat missing weekend data as 0 or "no service"; hide fast/slow/limited routes; infer the year from the label or `periodKey`; show routes for a year that has no snapshot; read local paths in a built site.
*   **Local fixtures (no R2).** `npm run history-v2:fixtures` copies the pilot outputs (marta, rtd-denver, indygo, lacmta) from the scratchpad into `tmp/dev-history-v2/` (gitignored; never committed). Then run the app with `VITE_HISTORY_V2_BASE=/dev-history-v2` (for example `VITE_HISTORY_V2_BASE=/dev-history-v2 npm run dev:beta`). Vite dev serves `tmp/dev-history-v2` at `/dev-history-v2`: agency files at `/dev-history-v2/{slug}-v2-agency.json`, sidecars at `/dev-history-v2/history-v2/{slug}/{periodKey}.json`. `loadHistoryAgencyV2(slug)` and `loadHistoryV2Sidecar(slug, periodKey)` use it when set. The override is read only when `import.meta.env.DEV` is true, so built sites ignore it (same pattern as `ON_DEMAND_URL_OVERRIDE`), and the server route exists only in `vite` dev. Without it the loader takes the agency from `history-config.json`.

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
