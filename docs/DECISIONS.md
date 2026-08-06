# Product Decisions

## 2026-07-15 — Atlas is the shared transit data platform

Atlas owns reusable transit-data capabilities for the Transit tool family:
GTFS/GTFS-RT configuration and normalization, static route and stop artifacts,
live snapshots, archives, replay/query access, and shared freshness metadata.
Downstream tools consume stable Atlas contracts rather than maintaining competing
copies of the same data-processing behavior.

Atlas may add an additive, versioned field, artifact, or API when it benefits
multiple consumers. A request that only changes one consumer’s presentation or
domain workflow belongs in that consumer or in an adapter outside Atlas.

Atlas must not change canonical data semantics merely to make one downstream
integration easier. This preserves Atlas as a dependable platform, in the same way
that a search provider does not reorder its canonical results for every client.

## 2026-07-02 — Support GTFS Fares V2 alongside V1

Atlas parses both GTFS Fares V2 and legacy Fares V1. When both are available,
route base fares use the lowest applicable adult V2 product; V1 fare attributes
and rules remain the fallback for older feeds, followed by an explicit manual
override when an agency’s feed does not provide usable fare data.

This is intentionally limited to deriving a route’s base fare for the Fares map.
It is not a claim that Atlas can calculate every rider’s complete fare, transfer,
zone, or concession outcome.

## 2026-07-15 — Operational consumers own operational decisions

Atlas provides live and historical transit context but does not own product-specific
decisions such as dispatch recommendations, rider reroute choices, trip-prediction
UX, or research instrumentation. Those belong to Bridge, Reroute, Transit Stats,
Rocket, or an adapter that consumes Atlas data.

## 2026-07-15 — Hide Corridors from primary navigation

Corridors remains implemented but is hidden from the main header.

The current tool compares routes and frequency between two selected stops. That is a useful network-analysis capability, but its purpose is not clear enough to present as a primary app mode for ordinary Atlas users. Keep the implementation available for future refinement or contextual entry from a selected stop.

## 2026-07-25 — Report unrepresentative frequency honestly instead of computing a plausible number anyway

When a time window (a period like Midday, or an hour like the sparkline's) doesn't have genuinely sustained service, Atlas should say so rather than compute a technically-valid statistic that looks like a real answer.

This came up twice independently in the same investigation: `headwayByPeriod` can report a clean-looking median for a window with a dominant internal gap and almost no real service ([#281](https://github.com/Civic-Minds/Atlas/issues/281)), and `headwayByHour` can only produce a number for a sparse hour by borrowing departures from a neighboring hour with a different frequency regime ([#282](https://github.com/Civic-Minds/Atlas/issues/282)). In both cases, every strategy tried for choosing which departures to include just prints a different plausible fiction — none of them make the underlying problem (this window has no representative frequency) go away. `headwayByPeriodSustained` and `maxGapByPeriod` flag and explain the first case without changing the median. The second is still open; the honest fix is a null or an unsustained flag, not a better-tuned window.

This does not mean every sparse window should go null — `sustainedMedianHeadwayInWindow` ([#279](https://github.com/Civic-Minds/Atlas/issues/279)) and `minDeps=3` throughout the pipeline exist specifically to rescue real, consistent service that happens to be sparse or fall outside a fixed window. The line is between "sparse but real" and "not enough evidence to claim a sustained pattern at all."

## 2026-07-25 — Extend a shared calculation field with a new parallel field, not by widening its value shape

When a published or persisted field (like `headwayByPeriod`) needs new information attached to it, add a new field alongside it rather than changing the original field's value type.

Consumers of a shared type are not fully visible to the type checker: a file can declare its own local shape for the same field name instead of importing the shared type, and `tsc` has no way to flag it as a consumer. While mitigating [#281](https://github.com/Civic-Minds/Atlas/issues/281), widening `headwayByPeriod` from a bare number to `{value, sustained}` type-checked cleanly (every consumer that imported the real type was fixed) but would have silently broken `pipeline/refresh.ts`, `pipeline/route-report.ts`, and Corridors, which each declare their own independent number-shaped type for the same field. One of those consumers writes the field into R2 history snapshots that already exist as bare numbers — a data-shape change there isn't something a consumer-side fix can retroactively address at all.

A same-named parallel field (`headwayByPeriodSustained`, later joined by `maxGapByPeriod`) leaves every existing reader untouched, typed or not, and sidesteps the persisted-data problem entirely. Before widening a shared type used by a published or persisted field, grep the whole repo for other independent declarations of a field with that name, not just `tsc`'s error list.
