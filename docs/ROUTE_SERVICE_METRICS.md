# Route service metrics

Atlas route surfaces should derive scheduled service values from the named projections in `RouteFacts.service`.

## How the underlying numbers are computed

`PIPELINE.md` describes the methodology at a high level ("median gap between departures"). This section documents the specific mechanics in `pipeline/headway-utils.ts` and `pipeline/process-core.ts` — the level of detail someone auditing a specific field's behavior actually needs.

### `medianHeadwayInWindow` (the shared primitive)

Filters departures to `[start, end]`, sorts them, computes consecutive gaps, sorts the gaps, and returns `gaps[Math.floor(gaps.length / 2)]`. Requires a minimum departure count (`minDeps`, default 2, but every call site in the pipeline passes `3`).

**Known caveat — not a true median for an even number of gaps.** For an even-length gap array this returns the upper-middle element, not the average of the two middle values (`hasGenuineBranchPattern` a few lines down in the same file *does* average correctly for even-length arrays — this helper doesn't). Concretely: departures with gaps `[10, 20]` (the minimum passing case, since every caller requires ≥3 departures → ≥2 gaps) return `20`, not the textbook median of `15`. Since 2-gap windows are the floor for every headway field in Atlas, this is a systematic small upward bias, not a rare edge case. Tracked as a known defect — see git history / issue tracker for current status before assuming it's fixed.

### `headwayByHour` — a 90-minute rolling window, not an hourly bucket

Computed as `medianHeadwayInWindow(times, h*60, h*60+90, 3)` — e.g. the "8 AM" value actually covers 8:00–9:30. This is deliberate: a strict 60-minute bucket often can't produce the ≥3 departures required on 30-minute-or-better routes. The tradeoff: a schedule change at 9:00 can bleed into both the 8 AM and 9 AM values, and the field name reads as a stricter hourly measurement than what's computed. Treat it as a smoothed rolling estimate for sparklines, not a precise per-hour fact.

### `headwayByPeriod` — drops gaps that straddle a period boundary

Each period (AM Peak, Midday, PM Peak, etc.) filters departures to its own `[start, end]` window independently, then computes gaps only between departures inside that same window. A gap between the last departure before a boundary and the first one after it (e.g. 8:55 → 9:05 across the AM Peak/Midday line) isn't counted toward either period.

### All-day per-stop headway — midday, then PM peak, not a raw all-day window

`process-core.ts`'s per-stop `allStopHw` calculation is `medianHeadwayInWindow(9-15h) ?? medianHeadwayInWindow(15-19h)`, not a median over the full service day. This exists because a raw all-day median gets skewed by a departure cluster elsewhere in the day — the fix was written against a single confirmed case (an AM-peak-only route whose all-day median implied off-peak service that didn't exist) and has not yet been validated against a broader, diverse set of agencies. See [#279](https://github.com/Civic-Minds/Atlas/issues/279) for that follow-up. Returning `null` when neither window has enough departures is intentional — it's what prevents an AM-peak-only route from showing a misleading frequency dot.

## Canonical projections

- `display`: the destination/branch cadence shown on route cards, agency cards, search, Recent routes, Near You, and live scheduled comparisons. It uses the period summary, then hourly data, then the all-day branch summary.
- `filter`: the cadence used by the frequency filter. For an active period it uses the best available stop-period value, then the branch period summary, then the hourly fallback. For all-day filtering it uses worst-direction cadence, then the minimum-stop value, then the branch summary.
- `branch`: destination-specific branch cadence used by route rows and branch sparklines.
- `shared`: combined cadence on shared stops/sections, including headsign-scoped trunk values used for branch ranges and shared-section sparklines.
- stop-specific metric: `buildRouteStopMetric()` projects a route's cadence at one named stop for stop cards and transfer rows.

The projections intentionally may differ. The important invariant is that a surface names the metric it intends to show instead of independently choosing a raw GeoJSON field.

## Intentional raw-data exceptions

These consumers operate on a different representation and should not be silently changed to route-card display cadence:

- MapLibre/PMTiles filters and paint expressions read serialized tile properties because they run inside the map renderer.
- Corridors and the service timeline use from-stop/to-stop segment metrics to describe a specific corridor leg.
- History uses archived snapshot headways, which are historical observations rather than current route service facts.
- Live adherence rows use the live feature's scheduled branch value for the selected trip/direction.
- Route variant aggregation uses branch values while calculating combined variant frequency.

If one of these surfaces needs a rider-facing route cadence, it should project the relevant `RouteFacts.service` metric at its boundary and keep its representation-specific value separately named.

## Filter semantics decision ([#166](https://github.com/Civic-Minds/Atlas/issues/166))

The settled product behavior is **best qualifying stop during the active period**. This preserves section clipping: a route appears when a useful high-frequency section meets the selected threshold, even if an outer terminal or destination is slower. The route card continues to show destination/branch cadence, so the two values must remain explicitly labeled as display versus filter metrics.

This was decided and implemented in [#166](https://github.com/Civic-Minds/Atlas/issues/166). Changing it to median-stop, percentage-of-stops, destination, or worst-direction semantics would be a new product request, not remaining work for [#166](https://github.com/Civic-Minds/Atlas/issues/166) or the [#186](https://github.com/Civic-Minds/Atlas/issues/186) consistency fix.

## Post-deploy verification

Any route with multiple branches/destinations works for this check — for example, TTC 900 Airport Express (used as the fixture route in the automated tests too, so a manual click-through and the test suite are checking the same scenario). Using that route with the same active period, verify:

1. The route card, agency card, search result, Recent routes, and Near You show the same display cadence.
2. The route card may show a different filter result only when the best-stop filter semantics explain it; the filter behavior remains consistent between sidebar and map.
3. Stop panels show the named stop-specific cadence, not the route-wide display cadence.
4. Shared-section/branch ranges and sparklines use their shared and branch projections respectively.
5. Live Vehicles' scheduled comparison matches the route-card scheduled branch metric.

---

[Back to Data](./DATA.md)
