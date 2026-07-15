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

## 2026-07-15 — Operational consumers own operational decisions

Atlas provides live and historical transit context but does not own product-specific
decisions such as dispatch recommendations, rider reroute choices, trip-prediction
UX, or research instrumentation. Those belong to Bridge, Reroute, Transit Stats,
Rocket, or an adapter that consumes Atlas data.

## 2026-07-15 — Hide Corridors from primary navigation

Corridors remains implemented but is hidden from the main header.

The current tool compares routes and frequency between two selected stops. That is a useful network-analysis capability, but its purpose is not clear enough to present as a primary app mode for ordinary Atlas users. Keep the implementation available for future refinement or contextual entry from a selected stop.
