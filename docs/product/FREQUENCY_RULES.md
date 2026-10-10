# Frequency filter rules

These are the rules for "every N min or less". Read this before touching frequency filter code.

## The rules

1. **Every direction must pass.** A route passes only if each direction meets N in the chosen period. The worst direction decides.
2. **Occasional extra trips don't count against the main service.** A short-turn or extension pattern with only a few trips (tier `infrequent`) is set aside when the same direction has a steady main pattern. Example: TTC 100's few "via Linkwood" trips don't fail the route.
3. **A direction never disappears.** If a direction's main pattern is not steady in the period, its other steady patterns still count. A route never passes just because one direction went unchecked.
4. **A busy stretch never passes a route on its own.** Values from the busiest stop, the shared trunk, or a single headsign are for display only. They never decide the filter.
5. **Clipping only trims a route that already passes.** The partial-route overlay highlights the qualifying stretch of a passing route. It never brings back a route that failed.
6. **Per-period and all-day follow the same rule.** Both use the worst direction, and both set aside occasional extra trips the same way.

## Where the rule lives

- `shared/worstDirection.ts` stamps the worst-direction values on every route feature.
- `shared/tileFilterExprs.ts` is the map filter expression. It is the single definition of the rule.
- `shared/routeHeadwayFilter.ts` evaluates that same expression for the app (counts, lists, route cards, overlay), so the app and the map always agree.

## Reaching the map

The map reads PMTiles. A change to these rules reaches the live map only after a PMTiles rebuild. Changes to how processing measures headways also need a reprocess of every agency first.

## Checks

- Real-route regression tests, using frozen copies of real data (`scripts/__fixtures__/headway-filter-routes.json`) in `src/utils/__tests__/routeHeadwayFilter.test.ts`:
  - MiWay 3 overnight (weekday and Saturday) fails every-20.
  - TTC 100 and LA Metro 51 AM Peak pass despite occasional extra trips.
  - TransLink 99 AM Peak is a known case that still fails every-20 (#602).
- Rule unit tests: `shared/__tests__/worstDirection.test.ts`.
- All-agency audit (read-only): `npx tsx scripts/audit-headway-filter-consistency.ts`. Expect zero app/map disagreements.

## Known gaps

- #602: TransLink 99 fails every-20 in AM Peak because processing marks its main eastbound pattern as not steady.
- #603: Filtering per stretch (clip a sparse tail instead of deciding the whole route) needs per-direction stop data from processing.
