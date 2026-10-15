# Internal glossary

For developers and AI agents working on Atlas. Not public. One entry per internal term: what it means in the code, where it lives, and the words the UI uses for it. When a chat, issue or commit uses one of these terms, it means what this page says. If the code changes a meaning, update the entry in the same commit.

Paths are from the repo root. "Main" means `origin/main` as of 2026-10-14 (741ee0d0). Terms from other branches are marked with the branch name.

## Pipeline and grading

### Values and tiers

- **headway**: minutes between departures at one point, read as the typical wait, not the mean. `typicalOfGaps` (`pipeline/headway-utils.ts`) takes the median of the gaps, except when short and long gaps alternate (#772). A long gap is 1.5 to 5 times the median, and gaps over 5 times the median are left out as outliers. Long gaps count as alternation only when they are not at either end of the list and make up at least a third of the remaining gaps. When they do, the value is the long gaps' median if there are 4 or more gaps, the long gaps take more than half the time, and they are one block or at least 3 times the short gaps (30, 90 reads 90). Otherwise it is the mean, when larger than the median (6, 12, 6, 12 reads 9). Over a whole day, three gaps with one at least 3 times the median stay on the median, because that is a break between runs (#834). In route properties, `headway` is the headline (next entry). Per-stop values are `stopHeadways`, and per-period values are `headwayByPeriod`. UI wording comes only from `shared/headwayText.ts`: "every N min" for a scheduled spacing, "about every N min" for a measured or typical one.
- **headline**: the one headway a drawn line shows, `feature.properties.headway`. `decideHeadline` (`pipeline/routeGrading.ts`) reads the terminal's midday value, from the destination pool when one qualifies (#690) and otherwise from the drawn pattern. It then applies the thin-shape rescue (#733), the #745 uneven-midday rule, the #771 floor or the #772 branch decision. It is null for a midday variant ("limited"). It never reads a pooled stop value as a route-level value (CIV-82).
- **tier**: the frequency band a line sustains across the whole analysis window. The value is a string: a tier max (`'5'`, `'8'`, `'10'`, `'15'`, `'20'`, `'30'`, `'60'`), `'infrequent'` (regular service slower than 60, or slower than the scale's last step), or `'span'` (irregular service, no cadence). The tier is graded separately from the headline, so a line can read "every 12" and still be tier 15 or 20. UI: legend "≤10 min" (`headwayTierLabel`), "Infrequent".
- **surface tier scale**: `SURFACE_TIER_MAXES` = 10, 15, 20, 30, 60 (`shared/config.ts`, derived from `HEADWAY_TIERS`). It covers buses and every other non-rail type, including ferries, gondolas (6) and trolleybuses (11) on purpose (`getModeCategory`, `pipeline/defaults.ts`).
- **rail tier scale**: `RAIL_TIER_MAXES` = 5, 8, 10, 15, 30, 60 (`pipeline/headway-utils.ts`; `modeTierOverrides.rail` in `pipeline/defaults.ts`). It applies to GTFS route types 0, 1, 2, 5, 7 and 12, plus the extended types 100-199, 400-599, 900-999 and 1400-1499. It has no 20, so a 20-minute rail line grades 30. `routeTierScale()` in `pipeline/process-core.ts` picks the scale for a route. The rail scale is not the same set as `railFeature`, which is true only for effective modes 1, 2, 12 and virtual LRT (`isRailLikeRoute`, `shared/modes.ts`). Streetcars (0), cable cars (5) and funiculars (7) grade on the rail scale but are not `railFeature`.
- **TIER_RANK**: the order used to compare tiers, best first: every numeric tier on either scale by value (5, 8, 10, 15, 20, 30, 60), then `infrequent`, then `span` (`pipeline/headway-utils.ts`). It is built from the numbers, not from list positions, so a streetcar graded 8 ranks correctly (CIV-152). Any unknown or null tier ranks 99, which counts as worst.
- **every-gap grader**: `determineTier` (`pipeline/transit-phase2.ts`). It returns the tightest tier T for which every gap in the window is at most T, apart from a few near misses. The grace is `max(5 min, round(T × 15%))`, so tier 60 gets 9 minutes and tiers up to 30 get 5. A gap inside T + grace is a near miss. Any gap beyond it fails the tier. Allowed near misses = `min(3, max(maxGraceViolations, floor(gaps × pct), floor))`. The pct is 10% for tiers 5-15 and 5% for tiers 20-60 (`violationPercentByTier`). The cap is 3. The floor is 1 once there are 8 or more gaps (`GRACE_FLOOR_MIN_GAPS`). The tier also needs `ceil(span / T)` trips. The default tier determiner (`applyAnalysisCriteria`, `pipeline/transit-phase2.ts`) is `determineTierWithEdgeGapAllowance`, which wraps it: a true first or last gap of the day may run up to T + 10 (`EDGE_GAP_ALLOWANCE_MINUTES`). That edge gap uses one near-miss slot, and at least 4 departures must remain. The result is published as `edgeGapAllowance`.
- **near miss**: a gap over T but within T + grace. "Violation" in the code (`maxGraceViolations`, `violationPercent`) means the same thing.
- **stopTiers**: the every-gap grade at each drawn stop (CIV-152), computed in `publishStopData` (`pipeline/process-core.ts`). Each stop's own list (pooled where it pools) and its own pattern's list are both graded through `scopedTerminalHeadline`, and the better grade is kept. The result is then capped so it is never better than the stop's headway tier on the route's scale. A stop without an all-day reading (`stopHasReading`: fewer than `MIN_ALL_DAY_TERMINAL_DEPARTURES` = 4 departures between 6:00 and 22:00) gets no grade. Routes where `railFeature` is true get no stop grades. Streetcars, cable cars and funiculars do.
- **worst-stop route tier**: `settleTierOnStops` (`pipeline/process-core.ts`). The line's tier is the worst grade in `stopTiers`, so ungraded stops never drag it down. It can only lift the tier through `liftTierOnDestinationPool` (#728): every own-pattern stop must be graded, on Weekday every other weekday whose trips differ must agree, and the lift never goes past the headline's tier. It skips `railFeature` routes (modes 1, 2, 12 and virtual LRT), irregular lines, `span` lines and lines with no headline. Buses, streetcars and other non-`railFeature` routes are graded this way.
- **settleTier**: Step 3 in `pipeline/routeGrading.ts`. After the headline, the tier can only get worse (AI-220). The one exception: a thin shape that phase 2 left infrequent takes its rescue sample's finite tier.
- **pooled stop value**: `pooledHeadwayInWindow` (`pipeline/stopPools.ts`). It reads the headway of the merged departures of every pattern that pools at a stop. Steps: departures 1 minute apart or less are collapsed into one (`collapseBunched`, `BUNCHED_DEPARTURE_MINUTES` = 1). The value is the typical wait, never better than the rounded mean gap and never worse than the stop's own pattern for the same window. If the gaps are uneven, nothing is published and the stop keeps its own value. Uneven means the longest gap is over `max(1.75 × mean, mean + 5)` or over `max(1.6 × value, value + 5)` (#813). The "+ 5" part is the **#851 grace** (`POOLED_MAX_GAP_GRACE_MINUTES`): without it, one held bus on a dense trunk blanked the value. The card says the value is pooled.
- **destination pool**: the branch-scoped pool at the terminal, made of every pattern under the same headsign and stop run. The headline, the periods and the #728 lift read it (#690).
- **#771 floor**: when the headline or a period value comes from a destination pool, it is never better than the worst drawn stop that some pooled variants skip (`decideHeadline` `worstDrawnStopHw`, `decidePeriod`). A drawn stop without an all-day reading is left out of the floor and drawn limited. This behaviour is decided (TriMet 35, TTC 29). Issue #771 is still open for the remaining cases.
- **midday variant / "limited" rule**: `middayVariant` (`pipeline/process-core.ts`, manager decision 2026-10-14). A drawn pattern is a midday variant when four things hold: its terminal (own or destination list) has no midday reading, no stop on it has one, at least half its departures fall between 6:00 and 22:00, and another drawn pattern of the same route id, direction and day does have a midday reading. Its headline is set to null and the card shows it as limited. A line with no midday sibling keeps its own reading (a two-hourly route, a lone peak-only line), and so do night patterns.
- **serviceClass**: the phase 2 class of a pattern. It has exactly three values (`types/gtfs.ts`, set in `pipeline/transit-phase2.ts`):
  - `regular`: covers the analysis window. It can still be infrequent.
  - `time-limited`: runs part of the day with a sustained cadence. That means a burst of 90 minutes or less, span coverage under 40%, a partial weekday, or a previous-night tail only, with 3 or more departures and a finite grade.
  - `irregular`: split-peak service (3+ AM or PM peak trips and fewer than 3 midday and evening), or limited service with no sustained cadence. Its tier is always `span`.

  `span` and `infrequent` are tier values, not classes. "limited" is not a serviceClass: it is `isLimitedService` (`shared/irregularRoutes.ts`), meaning `time-limited` or `routeHasLimitedDirection`, plus the null-headline cases above. `routeHasIrregularDirection` and `routeHasLimitedDirection` are set per route and day by `pipeline/worst-direction.ts`.
- **shared stretch** (CIV-82): `pipeline/sharedStretch.ts`. Two patterns of one route direction and day pool at a stop only inside an aligned run of at least 5 stops (`SHARED_STRETCH_MIN_STOPS`) and 1 km (`SHARED_STRETCH_MIN_KM`). Same-headsign variants that cover two-thirds of the pattern's stops pool at every common stop (`SAME_HEADSIGN_COVERAGE`, `pipeline/stopPools.ts`). The result is published as `sharedStretches`, which is stripped from tiles. The rule: a route may show the stretches that themselves pass, but a pooled stretch never makes the whole route pass.
- **periods**: `TIME_PERIODS` (`shared/config.ts`), in GTFS hours: `amPeak` 6-9, `midday` 9-15, `pmPeak` 15-19, `evening` 19-23, `late` 23-26, `overnight` 26-30. The labels are "AM Peak", "Midday", "PM Peak", "Evening", "Late" and "Overnight". The analysis window used for tiers is separate (`DEFAULT_CRITERIA`): Weekday and Saturday 7:00-22:00, Sunday 9:00-21:00.

### Lines, patterns and dedupe

- **shape**: a GTFS `shape_id` geometry. Several patterns can share one shape, and one pattern can be spread across several shapes (#690).
- **pattern**: one phase 2 result per (route, direction, day, headsign, shape), graded on its own trips.
- **drawn line**: one map feature per slot of (route group, direction, day, headsign, branch). Dedupe picks which pattern's geometry and grade fill the slot. Stop values on the drawn line can read other patterns through pooling.
- **dedupe**: `decideDedupe` (`pipeline/featureDedupe.ts`). It decides whether a candidate pattern replaces the incumbent in a slot. Rules, in order:
  1. A drawn line beats a mapless point (#596).
  2. On Weekday, the pattern that carries the representative weekday wins (#716).
  3. A night-only pattern never takes a slot from a midday one (#746).
  4. Same-line rule, step 3b (#844).
  5. A thin pattern with no daytime service loses to a daytime sibling with 8+ departures (#740, `MIN_THIN_REPLACING_DEPARTURES`).
  6. Otherwise the better plain-median midday headway wins (#772), and a tie keeps the incumbent.
- **#844 same-line rule**: two drawn patterns are the same line when their lengths differ by under 2% and both ends are within 100 m (`isSameLine`). Between two such patterns whose headways read as one service (within 20%), a pattern with no midday trips never takes or keeps the slot from a midday pattern with 8 or more departures.
- **#877 rule** (on `fix/877-ttc-86-early-path`, 08004c37, not main yet): extends step 3. A pattern with no departure between 9:00 and 19:00 (`!hasDaytime`) also never holds the slot against a midday pattern, even when its early or evening trips give it a period value (TTC 86 Saturday).

### Release, gate and tiles

- **placeholder expiry**: a calendar end more than `PLACEHOLDER_EXPIRY_YEARS` = 2 years out (`pipeline/refreshMeta.ts`, `recordedFeedExpiry`). The recorded expiry is capped so a fake end such as 20500101 never hides an outdated feed (#688). The release gate raises it as the yellow `placeholder-expiry` flag.
- **pmtilesPending**: an agency flag in the index. `build-pmtiles` skips the agency and it is never a reprocess target (`pipeline/build-pmtiles.ts`, `pipeline/archiveSelection.ts` `isReprocessTarget`, `pipeline/pmtilesCoverage.ts`). A public agency with this flag shows "Couldn't load" (#757, #759), so `publicAgenciesExcludedFromRelease` (`pipeline/releaseGuard.ts`) lists it to be hidden.
- **release gate**: `pipeline/releaseDiff.ts` (`GATE_FLAGS`). It compares each agency's new output with what is live before any R2 write. It runs in refresh, reprocess `--write` and publish. Each flag is `red` (blocks only that agency) or `yellow` (reported). The flags:
  - red only: `drop`, `empty`, `mode-lost` (a mode such as Commuter Rail is gone), `duplicate`, `day-lost`
  - red or yellow by size: `headway-shift`, `headway-lost` (route directions that still run on weekdays but have lost their weekday headway, #710)
  - red or yellow by output: `expired` (red when the output changed, yellow when it did not)
  - yellow only: `route-shift` (one route's weekday tier moves 2 or more steps on its own scale, rail 5 and 8 included since #871), `day-shrunk`, `future-start`, `placeholder-expiry`, `added`

  `--allow <slug>:<flag>` accepts one reviewed flag for one agency. `--allow-drop` accepts a reviewed drop for every agency in the run.
- **codeVersion**: the git SHA (`GITHUB_SHA` or `git rev-parse HEAD`, `currentCodeVersion` in `pipeline/releaseGuard.ts`) stamped into the release manifest by `build-pmtiles` and `publish-data-release`. `releasePublishError` refuses to publish when the publishing checkout differs from the build's SHA.
- **release pin**: no code uses this name. It means the set of mechanisms that tie the app to one verified release:
  - `atlas/release.json`, the pointer that only `publish-data-release` moves once every check passes;
  - the `releaseId` stamped into tiles and agency snapshots, checked by `releasePublishError`;
  - `codeVersion`;
  - the app reading only a compatible release (`isCompatibleDataRelease` in `src/lib/dataRelease.ts`, with `ROUTE_ARTIFACT_SCHEMA_VERSION` and `ACCEPTED_TILE_RULES_VERSIONS` in `shared/artifactSchema.ts`). Deployed builds never fall back to unversioned files.

  When you mean one of these, name it.
- **tile whitelist**: `TILE_ROUTE_SCALAR_KEYS` plus the flat period keys `pch_`, `wdpch_`, `hps_`, `msph_`, `wdph_`, `hph_` and `pws_` (`pickTileRouteProperties`, `shared/pmtilesProps.ts`). Any other route property is dropped from PMTiles, and the client reads it from the agency JSON. Add a key only when a style expression or `queryRenderedFeatures` reader needs it (`shared/__tests__/tileRouteProperties.test.ts`). A null period value becomes `NO_PERIOD_SERVICE_TILE_VALUE` (999999), because MVT drops nulls.

## Live

Every entry in this section is **on feature/live-local-poc, not main yet**, unless it says "main". The code is in `shared/segmentDelay.ts`, `scripts/live-segment-delay.ts`, `src/utils/segmentDelayView.ts` and `src/components/Interval/panels/SegmentDelaySection.tsx`. The methods are in `docs/research/live-route-performance-2026-10/INDEX.md`. The card section is titled "Where the {route} falls behind" and has three views: "Running time", "Spacing" and "Standing still". Its time bands are "All day", "AM Peak", "Midday", "PM Peak" and "Evening".

### Measuring

- **stop passage** (interpolated): `stopPassages` returns a `StopPassage`. The time a vehicle passed a stop is interpolated by distance along the shape between the two positions on either side of the stop. A stop is skipped when those two positions are over 150 s apart (`maxBracketGapSec`). A position over 50 m off the shape ends the leg (`maxPerpM`), so no stop pair is measured across a detour. A position implying over 25 m/s (90 km/h) is dropped as a bad fix.
- **segment running time**: one `SegmentObservation` per consecutive stop pair within a leg (`segmentObservations`). It is compared with the timetable's median time for that stop pair in the same band on that service date (`aggregateSegments`). It does not depend on trip identity. A pass with no timetable counterpart is dropped, not guessed.
- **headway window**: `headwayWindows`. A stretch of 4 or more consecutive scheduled trips at one stop, in one band on one service date, where every trip was seen at that stop by trip ID and no scheduled gap exceeds 30 minutes. Spacing is measured only inside these windows, because a missed vehicle would otherwise look like one long gap. Only passes by trips on that stop's timetable for that date are counted (filtered in the script).
- **degraded snapshot**: a minute of feed trouble (`scripts/live-segment-delay.ts`). Any one of these counts:
  - empty: 0 vehicles while 4 or more are scheduled in service;
  - stale: the newest vehicle report is over 300 s old, or the same as the previous snapshot taken 50 s or more earlier;
  - thin: fewer than half the scheduled vehicles are reporting while 4 or more are scheduled;
  - outage: no snapshot for over 180 s.

  `feedDown(t)` is true when any degraded minute, outage or archive edge falls within ±120 s of t. Degraded time turns trip statuses into `feed_gap` and drops stood-still events.
- **main pattern ends**: in the script, the first two and last two stops of every pattern with 50 or more trips are flagged `terminal`. Running time and spacing leave out any stop pair or stop flagged this way, because layover and loop time is not delay.

### Metrics on the card

- **typical extra running time**: `gainedMedianSec`, the median of (actual minus scheduled) per pass.
  - Card wording: "Takes {X} longer than scheduled", plus the pass count and day count.
  - Never use: "late", "delay of", "at least".
  - Rounding: nearest ½ min (`halfMinutes`). Colour and flags test the raw seconds: amber from 30 s, red from 60 s. A stop pair is listed only from 30 s.
  - Minimum sample: 30 passes and 5 days (`MIN_SEGMENT_TRIPS`, `MIN_DAYS`).
  - Excludes: stop pairs touching main pattern ends.
- **the 1-in-10 (p90)**: `gainedP90Sec`, the nearest-rank 90th percentile of (actual minus scheduled).
  - Card wording: "1 in 10 take {X}+ min longer". It is shown only when it is greater than the typical value.
  - Rounding: down toward zero (`halfMinutesDown`). That is why "+" is honest here and only here.
  - Never use "at least" or "+" on any value rounded to nearest.
  - Minimum sample and exclusions: the same as the typical value.
- **"looser than needed"**: `isPadded`. The typical pass is at least 30 s under schedule (`gainedMedianSec ≤ −30`) and `gainedP90Sec ≤ 0`, so 9 in 10 passes are at or under the timetable.
  - Card heading: "Where the schedule is looser than needed".
  - Card row: "The schedule allows {X} more than vehicles need". The map colour is the "early" blue.
  - Never use: "early", "too much time", "fast".
  - Rounding: nearest ½ min. At most 2 stop pairs are listed.
- **"too tight"**: no card label and no code name. It is shorthand for a stop pair where the timetable gives less time than vehicles need, which is the amber or red running-time case. Do not put "too tight" on the card. Use the running-time wording.
- **EWT (excess wait time)**: `excessWaitSec` (`headwayBandStat`). The average wait for a rider arriving at random is Σgap² ÷ (2 × Σgap). EWT is that value from actual gaps minus the same value from scheduled gaps, computed per headway window and then weighted by each window's scheduled span.
  - Card row: "Where every scheduled trip ran, riders waited {X} longer than the timetable implies; {P}% of gaps were close to scheduled". "Close" means within ±50% of the window's scheduled median gap (`withinShare`). The footer calls the measure "Extra wait". The methods note calls it "excess wait".
  - Never use: "late", "delay", "at least", "bunching" (unless that is measured separately).
  - It is a lower bound, because cancelled or unseen trips are left out, and the card says so.
  - Rounding: nearest ½ min. Colour and flags: amber from 30 s, red from 90 s. A stop is listed only from 30 s.
  - Minimum sample: 30 gaps and 5 days (`MIN_HEADWAY_GAPS`).
  - Excludes: main pattern ends, and anything outside a headway window.
- **stood still**: `detectHolds`, then `standingStillExcess`. A vehicle moved 25 m or less along the shape for 2 minutes or more, within 60 m of a stop.
  - Card wording: "Stood still 2+ min near this stop: {N} times on {D} of {T} days". Chip: "Standing still". Footer: "Could be holding for time, a signal or a blockage; the data can't tell which."
  - Never use "hold", "held", "dwell" or "blocked" to name the event. Those words may appear only in the possible-causes caveat. The internal names `detectHolds` and `HoldEvent` are legacy and must not reach the card.
  - Rounding: none. It is a count, and "2+" is a threshold, not a rounded value.
  - Minimum sample: 10 events on 5 days (`MIN_STILL_EVENTS`).
  - Excludes: the first two and last two stops of the pattern, planned turn-back points, stops within 400 m of a carhouse, events within 10 minutes of the car's first or last report on the trip, events outside the trip's scheduled span, and degraded time.
  - The scheduled dwell (departure minus arrival) is subtracted. It is 0 for TTC.

### Trip statuses (computed, not on the card)

Each scheduled stop of each trip gets one `TripStopStatus` from `classifyTripStops`. Where and when the car joined or stopped is judged by its position on the route, with about 400 m of slack (`slackM`), never by timetable times. Trip pieces with 10 stops or fewer, or shorter than 12 minutes, are left out. Wording on this list is the `TRIP_STOP_STATUS_LABELS` text, used only after review.

- **ran**: a stop passage was timed here. Label: "Timed here".
- **timing_gap**: the car was reporting nearby, but this stop was not timed. Label: "Vehicle reporting nearby, but this stop wasn't timed". Never "skipped".
- **quiet_spell** (the brief's "quiet-and-back"; that name is not in the code): the car's reports had a gap of over 5 minutes here, and it reported again later. Label: "Vehicle went quiet here and reported again later".
- **joined_late**: the car first appeared on the route more than about 400 m beyond this stop. Label: "Vehicle first appeared on the route after this stop". Never "late" on its own, because it is about position, not time.
- **stopped_reporting**: the car's last on-route position was more than about 400 m before this stop. Label: "Vehicle's last report on the route was before this stop". Never "ended early", "short-turned" or "cancelled".
- **started_other_trip** (renamed from `ended_early` earlier on the branch; `ended_early` no longer exists): a confirmed turn-back happened before this stop. Label: "Vehicle started another trip partway along".
- **not_seen**: no vehicle reported under this trip's number, the feed was healthy, and no unlisted cars were running. Label: "No vehicle reported under this trip's number. Not a count of cancellations; trips cut short aren't included." Never "cancelled", "missed" or "didn't run".
- **unlisted_cover**: no vehicle reported this trip number, but cars on trip numbers missing from the timetable were running. It is not counted.
- **feed_gap**: the feed was down or degraded around this time, so the status is unknown and excluded. A never-seen trip that overlaps any feed trouble is `feed_gap`, not `not_seen`.
- **off_route**: the car was off this trip's shape around this time, or it reported but never on this route. Label: "Off this trip's route here". Never "detour" on its own (see off-route running in the methods note).
- **turn-back**: `isTurnBack`. All of these must hold:
  - the car stopped 1 km or more from the route end;
  - its next trip runs in the opposite direction and starts within 20 minutes and 500 m;
  - it moves 200 m or more along that next trip's route;
  - no other car shared the trip number;
  - it was not off route just before stopping;
  - next to a carhouse, the next trip starts within 5 minutes (script).

  It produces `started_other_trip`. The count is a lower bound and is not shown.

### Delay wording rules

These measures are different things. Never combine them, convert one into another, or reuse one's words for another.

1. **"late / early / on time"** is only for one vehicle against its own scheduled time at one point. That is main's live adherence (`getVehicleStatus` in `src/utils/colors.ts` and `LiveAdherenceCard`, main). Main writes it as "on time" or "+N min" / "−N min".
2. **"takes N min longer than scheduled"** is only for running time between two stops. Never call it "late": a stop pair can lose time while the vehicle is still early.
3. **"riders waited N min longer than the timetable implies"** (label "Extra wait") is only for spacing. Never call it "late" or "delay". Always keep the caveat that it is a lower bound.
4. **"the schedule allows N more than vehicles need"** is only for the looser-than-needed case. Never call it "early".
5. **"stood still"** is a count of events, never a duration, a delay or a "hold".
6. Use "+" or "at least" only on a value that was rounded down (the 1-in-10). Values rounded to nearest get a plain number.
7. Name the period and the sample ("31 trips, 9 days") with every number.

## Internal term to UI wording

| Internal term | Code | UI wording today | Notes |
|---|---|---|---|
| headline | `properties.headway` | "every N min" or "about every N min" | `shared/headwayText.ts` only |
| tier `'10'`…`'60'` | `tier` | "≤10 min" (legend) | `headwayTierLabel` |
| tier `infrequent` | `tier` | "Infrequent" | |
| tier `span` | `tier` | hidden by "Hide irregular routes" | not a frequency |
| `serviceClass: 'time-limited'` | `isLimitedService` | "Time-limited" (About page), "Limited" (agency table), "limited service" (card), "Hide limited-service routes" (beta switch) | #720 decided "part-time" as the new label, not shipped |
| `serviceClass: 'irregular'` | `isIrregularService` | "Irregular", "Hide irregular routes" | #720 decided "one-off", not shipped |
| midday variant | `middayVariant` | "limited service", headline blank | not a serviceClass |
| pooled stop value | `stopHeadways` on a shared stretch | the card says the value is pooled | |
| `gainedMedianSec` (Live) | `segmentDelayView.ts` | "Takes X longer than scheduled" | branch only |
| `gainedP90Sec` (Live) | | "1 in 10 take X+ min longer" | branch only |
| `isPadded` (Live) | | "looser than needed", "The schedule allows X more than vehicles need" | branch only |
| `excessWaitSec` / EWT (Live) | | "Extra wait" (footer), "riders waited X longer than the timetable implies" (row) | branch only |
| `detectHolds` / `HoldEvent` (Live) | | "Stood still", "Standing still" | branch only; never "hold" |
| `not_seen` (Live) | | "No vehicle reported under this trip's number" | not on card |

### Known mismatches

- **"limited" vs "time-limited" vs "part-time"** (#720): the code class is `time-limited`. The UI uses "Time-limited", "Limited" and "limited service". The decided new label is "part-time", which has not shipped. "Limited" on the card also covers midday variants and stops without a reading, which are not `time-limited`.
- **"irregular" vs "one-off"** (#720): the code puts split-peak (rush-hour-only) service in `irregular`. So "Hide irregular routes" hides it, while the beta "Hide limited-service routes" description says it hides peak-only service. The About page says routes with only a few trips are labelled "limited", but in the code they are mostly `irregular`. #720 decided that irregular means one-off only and that rush-hour-only becomes part-time. That has not shipped.
- **"Extra wait" vs EWT** (Live, branch): the code says `excessWaitSec` and "TfL-style EWT", the methods note says "excess wait", the card footer says "Extra wait", and the row says "waited X longer". It is one measure under four names. Use "Extra wait" in the UI and `excessWaitSec` in code.
- **Grace floor comment**: `pipeline/defaults.ts` says near misses have "no minimum floor", but `determineTier` allows 1 at 8 or more gaps (`GRACE_FLOOR_MIN_GAPS`). The code is right and the comment is stale.
- **Live card footer**: it says "Rounded to the nearest ½ min", but the 1-in-10 is rounded down. It says "fewer than 30 samples are left out" but leaves out the 5-day minimum.
- **Stood-still colour**: the `stillColor` comment says red means "most days", but the code makes it red at 2 or more events per day on average (`events ≥ 2 × totalDays`).
- **"Looser than needed"**: the methods note says "9 in 10 passes beat it too", but the code tests `p90 ≤ 0`, which counts passes that match the timetable exactly.
- **Two "late" thresholds on main**: `getVehicleStatus` says late from +5.5 min and early from −1.5 min. `LiveAdherenceCard` says on time within ±2, amber from 2 and red from 5.
- **Live minute formatting**: the Live card formats minutes with its own `formatMinutes` ("1½ min") instead of `shared/headwayText.ts`, which prints "1.5 min" and is meant to be the only place headway wording is built.
