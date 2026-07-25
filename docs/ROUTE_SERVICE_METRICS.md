# Route service metrics

Atlas route surfaces should derive scheduled service values from the named projections in `RouteFacts.service`.

## How the underlying numbers are computed

`PIPELINE.md` describes the methodology at a high level ("median gap between departures"). This section documents the specific mechanics in `pipeline/headway-utils.ts` and `pipeline/process-core.ts` — the level of detail someone auditing a specific field's behavior actually needs.

### `medianHeadwayInWindow` (the shared primitive)

Filters departures to `[start, end]`, sorts them, computes consecutive gaps, sorts the gaps, and returns `gaps[Math.floor(gaps.length / 2)]`. Requires a minimum departure count (`minDeps`, default 2, but every call site in the pipeline passes `3`).

**Fixed (#280, 2026-07-25).** Used to return the upper-middle element for an even-length gap array instead of averaging the two middle values (`hasGenuineBranchPattern` a few lines down in the same file already averaged correctly — this helper didn't). Now averages correctly in both cases.

### `headwayByHour` — an adaptive 60-to-90-minute window, not a strict hourly bucket

Computed via `adaptiveMedianHeadwayInWindow` (`headway-utils.ts`): tries a strict 60-minute window (`h*60` to `h*60+60`) first, and only widens to 90 minutes when the strict window doesn't already have the ≥3 departures required. This replaced an always-90-minute window (issue #282) that blended real adjacent-hour differences together even when an hour had enough departures to stand on its own -- e.g. TTC 5's real AM ramp from ~20min to ~5min service around 6-7am had its 6am reading pulled down by borrowing 7am's tighter trips. The 90-minute ceiling still exists for hours that genuinely need it (TTC 10's real 30-min service only clears 3 departures within 90 minutes at some stops).

The field name still reads as a stricter hourly measurement than what's computed -- an hour's true window is now *either* 60 or 90 minutes depending on that hour's own data, and the UI doesn't currently expose which one applies to a given bar (its tooltip states the conservative 90-minute upper bound in both cases). Treat it as a smoothed rolling estimate for sparklines, not a precise per-hour fact.

This same adaptive-window computation is shared by three call sites in `process-core.ts` (the branch-level feature value, the per-stop `allStopHourHw`, and the headsign-scoped terminal value) -- all three call the one function rather than each inlining their own window logic, specifically so a future change to this window can't miss a call site the way an earlier fix attempt did (one of the three used a differently-named times variable and didn't turn up in a grep for the other two).

### `headwayByPeriod` — drops gaps that straddle a period boundary (still open — do not patch naively)

Each period (AM Peak, Midday, PM Peak, etc.) filters departures to its own `[start, end]` window independently, then computes gaps only between departures inside that same window. A gap between the last departure before a boundary and the first one after it (e.g. 8:55 → 9:05 across the AM Peak/Midday line) isn't counted toward either period.

An attempted fix (2026-07-25: let a period's gap list reach forward to the next departure past its boundary) was built, tested, and reverted before committing. It has the same failure signature as the all-day fallback below: TTC route 10 (Van Horne → Victoria Park) has real departures every 30 min in AM peak, then a genuine 315-minute gap with zero service, then 30 min again in PM peak. The fix let midday's gap list borrow the 30 min edge-gaps from both neighboring periods, so its 3-gap median became `30` — completely outvoting the one real 315 min gap that *is* midday's actual story. The old (still-current) behavior returns `173` for that cell, which is also not great, but the fix made it worse, not better, and the two failure modes can't be told apart by a small patch — see the discussion when this is next picked up (a max-gap field alongside the median is probably the honest fix, not a second window-boundary rule).

#### `headwayByPeriodSustained` — a parallel diagnostic flag, not a fix (#281)

Rather than changing `headwayByPeriod`'s reported number, a separate optional field flags whether that number is actually representative: `isSustainedHeadway` (in `headway-utils.ts`) re-checks a period's own gap list against its reported median using the same grace/violation tolerance `determineTier` (`transit-phase2.ts`) already uses for tier classification — a gap that exceeds `median + grace` (capped by an allowed-violation count/percent) marks the period `sustained: false`. For TTC route 10's midday cell above (gaps `[315, 30]`, median `173`), grace for `T=173` is `max(5, round(173*0.15)) = 26`, so the 315 min gap (>199) fails outright and the cell reports `sustained: false` — flagging exactly the case the reverted boundary fix was trying (and failing) to solve, without touching the published number.

This is deliberately a **separate field**, not a change to `headwayByPeriod`'s value shape. An earlier attempt changed `headwayByPeriod` entries to `{value, sustained}` objects directly — type-checked cleanly (0 `tsc` errors after fixing every direct consumer) but was caught before committing: several pipeline consumers (`refresh.ts`, which writes `headwayByPeriod` into R2 history snapshots that already exist as bare numbers; `route-report.ts`; Corridors) declare their **own independent** `Record<string, number|null>` type for this field instead of importing the shared type, so they'd have silently misread the new object shape as a plain number with no compiler error — and reshaping already-persisted history snapshots isn't something a consumer-side fix can address anyway. The parallel-field design means every existing reader of `headwayByPeriod` is untouched; `headwayByPeriodSustained` is additive and currently unconsumed by the UI.

Validated (2026-07-25) via dry-run reprocess: TTC route 10 midday still reports `headwayByPeriod.midday: 173` with the new `headwayByPeriodSustained.midday: false`; Halifax 330's existing numbers (`amPeak: 10`, `pmPeak: 24`) are unchanged, now annotated `sustained: false` (consistent with its known peak-cluster-plus-outlier pattern from #279); a normal all-day-frequent route (TTC 504) reports `sustained: true` across its periods, confirming the flag isn't universally pessimistic.

### All-day per-stop headway — midday, then PM peak, then sustained-check raw all-day

`process-core.ts`'s per-stop `allStopHw` calculation is `medianHeadwayInWindow(9-15h) ?? medianHeadwayInWindow(15-19h) ?? sustainedMedianHeadwayInWindow(6-22h)`. The third step, added in #279 (2026-07-25) and validated against Halifax/TTC/Madison dry-run reprocesses, rescues routes with real all-day service that happens to fall outside 9am-7pm (e.g. TTC 32, 5-15min gaps all day) without reintroducing the original AI-217 bug (Halifax 330, a peak-only commuter express whose all-day median would otherwise look misleadingly frequent) — `sustainedMedianHeadwayInWindow` rejects the raw all-day median whenever one gap dominates disproportionately (>4x the median gap), which is the actual signature distinguishing the two cases. Returning `null` when none of the three steps qualify is intentional — it's what prevents a peak-only route from showing a misleading frequency dot.

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
