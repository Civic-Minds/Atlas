# Frequency filter rules

These are the rules for "every N min or less", the all-day filter, Frequent Service, Night Service and "limited service". Read this before touching frequency filter code.

## The rules

Every route direction on a day is read from its trips, not from the drawn patterns one at a time (the trip-set selector, `pipeline/tripSets.ts`).

1. **Regular patterns shape the route.** A pattern (one stop sequence) is regular when it runs steadily through at least one daytime period (AM peak, midday, PM peak, evening) at its own middle stop, by the steadiness checks and the midpoint test below. A route with no steady daytime pattern (a night route) is shaped by the patterns steady in any period. A pattern with fewer than 4 trips, or all of them within 90 minutes, is a burst and never shapes the route (#720's evidence: TransLink 044's 3-trip express). A short turn with under 20% of the direction's trips that lies on a longer regular pattern (off it, nothing that would pass the tail test) does not shape it either (CTA 93's Foster turn, CTA 152's Harlem loop). Phase 2's per-pattern class is not used: a feed that gives each trip its own shape (CapMetro) defeats it. Two patterns that take alternate trips are both regular when the direction's busiest pattern is not regular on its own, the two share at least 2 stops and end (or start) at the same terminal (within 100 m), each has at least `MIN_SCHEDULE_DEPARTURES` departures at their middle shared stop, some of the other pattern's departures fall within the busiest pattern's span at their middle shared stop, and together they run steadily through a daytime period that neither does alone; the main stretch is then their shared stops (#1256: Pace 542, MATA 30). A branch steady on its own, or a peak-only branch beside a steady all-day pattern (Pace 808), is not promoted.
2. **The main stretch is read at its middle stop.** The main stretch is the stops every regular pattern serves. Its value is read at its middle reference stop, counting every trip that serves that stop. The row's headline (display only) can instead read the rider's wait at that same stop: the time-weighted median gap in the headline's window (midday, then PM peak, then all day), when it is 10+ minutes longer, and only where the direction runs through that window (midday: rules 5 and 7; PM peak: rule 5; all day: not limited by rule 7). Otherwise the row keeps its headline and is stamped `headlineNoRegular`. The tier can only get worse; filter values and the map colour are unchanged (CIV-1204, CIV-1161; DECISIONS.md, 2026-10-31). When regular patterns share no stop, the pattern with the most stop visits is the main stretch.
3. **Branches (tails) are read on their own, and the slower one decides (D1).** A run of a regular pattern off the main stretch of at least 5 stops and 1 km is a tail, split wherever the set of patterns serving it changes. A tail counts in a period when it runs steadily through that period (the steady test and the midpoint test at its own middle stop); a tail that does not is left out of that period. A tail that a sibling branch takes over from part way through a period is read at its own steady spacing there, not at its full-window wait: the main stretch is steady with every wait within `PERIOD_COVERAGE_MAX_HEADWAY`, and at its middle stop the tail's trips and the trips of the other regular patterns that leave the main stretch elsewhere between the same two terminals (within 100 m) each have 3 departures in the period, one set entirely before the other, with their spacing and the handover gap passing the steadiness test against each other (#1072: HSR 16 every 30 via Wilson until 12:10, then every 30 via Fiddler's Green). The slower branch still decides. A branch that just stops, a peak extension or cut-back to another terminal (CTA 28, TransLink 9), and a sibling that overlaps it or runs at another spacing keep the wait; the all-day value and Frequent Service are unchanged. A direction's value in a period is the worst of its main stretch and its counting tails; route cards show the range from the main stretch to the slowest branch ("every 8-25 min").
4. **Every direction must pass.** The route's value is the worst direction's. A direction with stray trips in a period but no service through it voids the route's value; a direction with no service at all in that period (one-way peak service) is skipped.
5. **Stray trips are not service (the midpoint test, D8).** A stretch runs through a period only when it has departures on both sides of the period's midpoint and, when the period is not steady, no internal gap more than `BOUNDARY_DOMINANT_RATIO` times its typical gap. A straggler and the first trips of the next service (YRT Viva overnight) are not service through the period.
6. **All day.** A direction's all-day value is the median gap at its main stretch's middle stop over the day's grading window (07:00-22:00; Sunday 09:00-21:00), and the worst of that and each all-day branch. An all-day branch runs at midday and its own departures span at least 40% of the grading window (#720's coverage test); a part-day branch (TTC 76B southbound from 12:13) still sets its own periods but not the all-day value. The route takes the worst direction.
7. **Limited service has no all-day value.** A direction is limited when it does not run at midday by the #899 rule, read as main reads it: the direction's longest 09:00-15:00 wait at its best-served stop over every trip, with a midday reading (a typical midday gap at any of its stops, as main takes it from any drawn line) and a wait under three hours, or a wait of at most `ALL_DAY_MIDDAY_MAX_WAIT` (GO 88 Saturday runs at midday: 90 and 95 at Durham College). It has no all-day value, and neither has its route: OC Transpo 226 (11 peak trips), CTA 108 (every 20 at the peaks, a 5-hour midday gap). The exception is phase 2's overnight fallback: a main stretch with under two departures in the grading window is a night route, read over all its departures, with its branches judged overnight (TTC 300 reads 15, its branches, not the Bloor trunk's 8). The same decision stamps `routeHasLimitedDirection`, which the "hide limited service" toggle, `shared/irregularRoutes.ts` and the tile expression read; on these route-days a row's own phase 2 class no longer marks it limited (TTC 134, every 15 at midday). A split-peak pattern (rush-hour service with no repeated off-peak service) is graded by its rush-hour blocks' own spacing, not `span`, when each block holds its tier by `peakBlockHoldsTier` (`pipeline/transit-phase2.ts`: at least `MIN_PEAK_BLOCK_DEPARTURES` departures over at least an hour and two cycles of the tier). Since #1254 the rush hours are counted from the raw departures, so trips before 07:00 count and such a route passes the filter in its own period (OC Transpo 187 and 275 AM peak) while still having no all-day value.
8. **The midday cap (#899), as on main.** Some directions run at midday and some do not: the route fails every all-day threshold (`routeMiddayCap` is the no-service sentinel). Every direction runs: the all-day value is capped at the longest midday wait among the directions with no midday reading. No direction runs (a peak-only route): no cap, and rule 7 already leaves it with no all-day value. The inputs are rule 7's.
9. **Frequent Service** (weekdays): every direction's main stretch and each all-day branch run at least every 15 minutes from 07:00 to 19:00, with no gap and no late start (TTC 76 fails: its 76B branch runs every 20-36). Its rows with midday service are lit.
10. **Night Service, 2–5 AM.** A route qualifies at 30 or 60 when every direction it runs by day passes at the middle of its main stretch, and each tail that runs at night passes. A tail runs at night only when it has departures on both sides of 3:30, which counts as the later side (D3: CTA 20's downtown loop, starting at 4:47, drops out). A stretch that runs at night (departures on both sides of 3:30) passes at 30 or 60 when every gap between its 2:00-5:00 departures is at most that, its first departure is by 3:00 and its last is from 4:00: the wait before the first night trip and after the last is held to 60 minutes, not 30, because night networks start when day service and the subway stop (TTC 300's Danforth Rd branch, every 15 from its first bus at 2:39; Ryan, 2026-10-30, CIV-1198). Any other stretch has no gap over 30 or 60 at the start or end of 2:00-5:00, so day service starting at 4:30 never passes. When night service does not reach the daytime main stretch's middle stop, the direction is judged on its night version: the stretch shaped by the trips running 2:00-3:30 (the owl), measured with every trip. A route that passes only that way is a partial night route: its rows that run at night are lit and the card names the stops it runs at (NYC subway 3, 5, M, N, R; CTA 87). A route-day without stretch data (no direction_id in the feed) never qualifies for Night Service.
11. **A busy stretch never passes a route on its own.** Values from the busiest stop, a shared trunk or one headsign are for display. A route may show the stretches that themselves pass; it never makes the whole route pass (CIV-82).

Route-days without stretch data (no direction_id in the feed, partial-weekday route-days #710) keep the earlier worst-direction fields (`shared/worstDirection.ts`).

## Where the rule lives

- `pipeline/tripSets.ts` is the selector and the rules above. `pipeline/process-core.ts` builds each direction's trips, stamps the filter fields, Frequent Service, Night Service and `routeHasLimitedDirection`.
- Filter fields on each route feature: `routeFilterHeadwayByPeriod` and `routeRunsByPeriod` (tiles: `rv_` and `rr_` keys), `directionFilterHeadwayByPeriod`, `routeAllDayHeadway` and `routeMiddayCap` (no value: the no-service sentinel; no cap: 0).
- `shared/tileFilterExprs.ts` is the map filter expression and the single definition of the rule: it reads the stretch fields first and the worst-direction fields otherwise. `shared/routeHeadwayFilter.ts` evaluates that same expression for the app (counts, lists, route cards, overlay), so the app and the map always agree.
- The filter counts a row's period value (`rv_`, `routeAllDayHeadway`) only on a row that is not `span` and runs in the period. Route lists, agency and area pages, Compare and search read `routeFilterContract` (`src/utils/stretchCard.ts`): the lowest `routeFilterHeadway` across the route's rows, so a list number always passes the filter at that number, and a route with none reads "Irregular" (#1247, CIV-1238).
- The route chooser's dot reads `routeFilterHeadway`, like the route card dot and the map line (#1246, `src/utils/chooserRoutes.ts`).
- `shared/worstDirection.ts` keeps the worst-direction values for route-days without stretch data.
- `shared/sharedStops.ts` reads the pooled values at shared stops (processing: `pipeline/sharedStretch.ts`). A shared stretch is judged stop by stop with the same `featurePassesHeadwayFilter` (`src/utils/frequencySegments.ts`).

## Reaching the map

The map reads PMTiles. A change to these rules reaches the live map only after a PMTiles rebuild. Changes to how processing measures headways also need a reprocess of every agency first.

## Thresholds and where they were decided

These are settled; don't change them without a new decision (Ryan, 2026-10-15).

**A. Tier tolerance** (how much a tier may bend and still count). Decided 2026-10-03 to 2026-10-06 in #567 (parent), #568 (edge gaps), #570 (hard gaps) and #571 (census of 1,160 archives), with the decisions in the issue comments. Shipped in 75c2d842 (PR #584). Decision log: `docs/engineering/pipeline-studies/frequency-tier-methodology-2026-10/INDEX.md`, section "Decision log".

| What | Value | Code |
|---|---|---|
| Near-miss share (`violationPercentByTier`) | 10% for the 5, 8, 10 and 15 minute tiers; 5% for the 20, 30 and 60 minute tiers | `pipeline/transit-phase2.ts` |
| Near-miss floor and cap (`maxGraceViolations`) | a floor of 1 once there are 8 or more gaps (`GRACE_FLOOR_MIN_GAPS`), and a cap of three gaps | `pipeline/transit-phase2.ts` |
| Edge gap allowance (`EDGE_GAP_ALLOWANCE_MINUTES`) | 10 minutes over the tier, for each true service edge (not window boundaries); each edge uses one near-miss slot | `pipeline/transit-phase2.ts` |
| Hard-gap grace | the larger of 5 minutes and 15% of the tier; no bigger allowance turns a large internal gap into a near miss | `pipeline/transit-phase2.ts` |
| Minimum evidence | 3 departures; 4 after an edge allowance | `pipeline/transit-phase2.ts` |

**B. Steadiness checks** (is the median a fair description of the gaps).

| Constant | Value | Decided in |
|---|---|---|
| `MIN_UNSUSTAINED_EXCESS_MINUTES` | 15 | 1ab8ec57, #345 |
| `MIN_UNSUSTAINED_RATIO` | 1.7 | b1dfb752, #345 |
| `BOUNDARY_DOMINANT_RATIO` | 8 | a267472a, #299 |
| `PERIOD_COVERAGE_MAX_HEADWAY` | 60 | 33758d8b and 5be33998, #524 |

The first three live in `pipeline/headway-utils.ts`, the last in `shared/periodEligibility.ts`.

**C. Card rows** (how a row says what the filter read).

| What | Value | Decided in |
|---|---|---|
| A main stretch's row shows the number at the filter's stop (AC Transit 281 AM: every 63, not its own trips' 60) | the stretch's steady spacing, when the row's trips are all of the stretch's (one destination) | Ryan, 2026-10-31, #1239 |
| Gap words ("every 42 min, with a 65 min gap") | only when the gap that sets the filter value is at least `ROW_GAP_WORDS_RATIO` (1.5) times the row's spacing; "every 63 min, with a 66 min gap" isn't worth mentioning | Ryan, 2026-10-31, #1239 |

Both live in `src/utils/rowTrips.ts`.

## Checks

- The GTFS oracle, `scripts/handcheck/stretch-departures.py`, reads a route's main stretch and tails straight from the feed and shares no code with the pipeline. Expected values in the selector tests come from it.
- Selector tests on real routes: `pipeline/__tests__/tripSets.test.ts`, with fixtures listed in `pipeline/__tests__/fixtures/STRETCH-FIXTURES.md`. Cut a weekday fixture with a Monday-Friday calendar: a one-weekday cut is partial-weekday and silently keeps the earlier fields.
- Real-route filter tests, using frozen copies of real data (`scripts/__fixtures__/headway-filter-routes.json`) in `src/utils/__tests__/routeHeadwayFilter.test.ts`. Regenerate the copy with `npx tsx scripts/build-headway-filter-fixture.ts <reprocess output> "<source>"` whenever the fields the filter reads change, and check every changed expectation against the oracle before accepting it:
  - MiWay 3 overnight (weekday and Saturday) fails every-20.
  - TTC 100 AM Peak passes: the occasional via-Linkwood trips do not slow the route.
  - LA Metro 51 AM Peak fails every-20: the slower of its two regular branches decides (24).
  - TransLink 99 AM Peak still fails every-20: its eastbound main stretch ramps up through 7:00 (gaps 16-19), so it reads its full-window wait. That is a steadiness question, not trip selection.
  - TTC 506, 63, 84 and 100 weekday, and CTA 77 midday, pass despite a rare variant with a long gap (#658).
- Rule unit tests: `shared/__tests__/worstDirection.test.ts`.
- All-agency audit (read-only): `npx tsx scripts/audit-headway-filter-consistency.ts`. Expect zero app/map disagreements.

## Known gaps

- #602: TransLink 99 fails every-20 in AM Peak because its main eastbound stretch is not steady.
- #603: Filtering per stretch (clip a sparse tail instead of deciding the whole route) needs per-direction stop data from processing.
