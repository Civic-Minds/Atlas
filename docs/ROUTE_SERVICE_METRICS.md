# Route service metrics

Atlas route surfaces should derive scheduled service values from the named projections in `RouteFacts.service`.

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
