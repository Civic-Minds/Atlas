# Frequency filter rules

These are the rules for "every N min or less". Read this before touching frequency filter code.

## The rules

1. **Every direction must pass.** A route passes only if each direction meets N in the chosen period. The worst direction decides.
2. **Occasional extra trips don't count against the main service.** A short-turn or extension pattern with only a few trips (tier `infrequent`) is set aside when the same direction has a steady main pattern. Example: TTC 100's few "via Linkwood" trips don't fail the route.
3. **A direction never disappears.** If a direction's main pattern is not steady in the period, its other steady patterns still count. A route never passes just because one direction went unchecked.
4. **A busy stretch never passes a route on its own.** Values from the busiest stop, the shared trunk, or a single headsign are for display only. They never decide the filter.
5. **A route may show the stretches that themselves pass; it never makes the whole route pass (CIV-82).** The partial-route overlay highlights the qualifying stretch of a passing route. A route that fails may draw only the shared stretches whose pooled stop values pass the same filter in every direction (the matching stop of the opposite direction must pass too). The route itself still fails: it stays out of lists, counts and agency cards, and its other stops stay hidden.
6. **Per-period and all-day follow the same rule.** Both use the worst direction, and both set aside occasional extra trips the same way. A pattern that is steady in no period and also runs in fewer daytime periods (AM peak to evening) than the steady patterns in the same direction is an occasional variant and never sets the all-day value (TTC 102's 3-trip Markham short turn, #749). A slow destination that runs in every daytime period still counts even though it is steady nowhere (Dayton 17's West Loop, every 114).
7. **The full-window check follows the same rule.** The period check that catches long gaps (a route that starts late or stops for hours) looks at the same patterns as the period frequency. A rare variant with a few trips does not make a route look like it leaves hours without service (#658). If no pattern in a direction is steady, the patterns that run in the period decide, so the direction still counts.

## Where the rule lives

- `shared/worstDirection.ts` stamps the worst-direction values on every route feature. `selectDirectionPeriodPool` is the one place that decides which patterns speak for a direction in a period; the frequency and the full-window check both use it. `selectDirectionAllDayPool` decides the same for the all-day value.
- `shared/tileFilterExprs.ts` is the map filter expression. It is the single definition of the rule.
- `shared/routeHeadwayFilter.ts` evaluates that same expression for the app (counts, lists, route cards, overlay), so the app and the map always agree.
- `shared/sharedStops.ts` reads the pooled values at shared stops (processing: `pipeline/sharedStretch.ts`). A shared stretch is judged stop by stop with the same `featurePassesHeadwayFilter`, fed the pooled value where it is lower than the stop's own and the stop's own value otherwise (`src/utils/frequencySegments.ts`).

## Reaching the map

The map reads PMTiles. A change to these rules reaches the live map only after a PMTiles rebuild. Changes to how processing measures headways also need a reprocess of every agency first.

## Thresholds and where they were decided

These are settled; don't change them without a new decision (Ryan, 2026-10-15).

**A. Tier tolerance** (how much a tier may bend and still count). Decided 2026-10-03 to 2026-10-06 in #567 (parent), #568 (edge gaps), #570 (hard gaps) and #571 (census of 1,160 archives), with the decisions in the issue comments. Shipped in 75c2d842 (PR #584). Decision log: `docs/engineering/pipeline-studies/frequency-tier-methodology-2026-10/INDEX.md`, section "Decision log".

| What | Value | Code |
|---|---|---|
| Near-miss share (`violationPercentByTier`) | 10% for the 5, 8, 10 and 15 minute tiers; 5% for the 20, 30 and 60 minute tiers | `pipeline/transit-phase2.ts` |
| Near-miss floor and cap (`maxGraceViolations`) | 0, with a cap of three gaps | `pipeline/transit-phase2.ts` |
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

## Checks

- Real-route regression tests, using frozen copies of real data (`scripts/__fixtures__/headway-filter-routes.json`) in `src/utils/__tests__/routeHeadwayFilter.test.ts`:
  - MiWay 3 overnight (weekday and Saturday) fails every-20.
  - TTC 100 and LA Metro 51 AM Peak pass despite occasional extra trips.
  - TransLink 99 AM Peak is a known case that still fails every-20 (#602).
  - TTC 506, 63, 84 and 100 weekday, and CTA 77 midday, pass despite a rare variant with a long gap (#658).
- Rule unit tests: `shared/__tests__/worstDirection.test.ts`.
- All-agency audit (read-only): `npx tsx scripts/audit-headway-filter-consistency.ts`. Expect zero app/map disagreements.

## Known gaps

- #602: TransLink 99 fails every-20 in AM Peak because processing marks its main eastbound pattern as not steady.
- #603: Filtering per stretch (clip a sparse tail instead of deciding the whole route) needs per-direction stop data from processing.
