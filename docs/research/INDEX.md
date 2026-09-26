# Atlas research and validation index

This is the entry point for source-backed research, audits, and experiments that inform Atlas. Reports stay in their existing category folders; this index groups related reports and links to their supporting artifacts.

## How to use this index

- **Research** answers a question using agency, GTFS, or other primary sources.
- **Audits** check a specific Atlas output or implementation against independent evidence.
- **Experiments** test a proposed product or pipeline behavior before launch.
- A report’s status and checked date are part of the evidence. A report does not change production behavior unless a linked implementation or decision says so.

## Current research

### Service frequency

The frequent-service reports are one research set: the pilot contains the agency-level review, the analysis summarizes the completed catalog, and the JSON catalog is the structured source record.

- [Frequent-service research bundle](frequent-service-research-2026-09/) — complete; 500 agency reviews comparing published definitions with Atlas schedule results, with analysis and structured catalog.
- [System-map verification audit](system-map-audit-2026-09/system-map-audit-2026-09.md) — complete; 142 agencies checked against current official maps. Supporting data, PDFs, and images are in [the audit folder](system-map-audit-2026-09/).

### Schedule reliability and lateness

- [Agency lateness and headway policy study](agency-lateness-policy-study-2026-09/agency-lateness-policy-study-2026-09.md) — complete; 80 agencies reviewed for published fixed-route punctuality and headway policies. On-demand policies are excluded from the Atlas comparison.
- [Agency lateness policy ledger](agency-lateness-policy-study-2026-09/agency-lateness-policy-study-2026-09.json) — structured source ledger for the study.

### On-demand and GTFS-Flex coverage

These are companion reports: the first establishes which public on-demand services exist, and the second checks their data-publication paths.

- [North America on-demand service audit](north-america-on-demand-audit-2026-09.md) — complete; current public on-demand services identified and classified.
- [North America GTFS-Flex publication audit](north-america-gtfs-flex-publication-audit-2026-09.md) — complete; public GTFS-Flex availability and request paths checked for the on-demand inventory.

## Validation audits

- [Route accuracy spot check](../audits/route-accuracy-spot-check-2026-09.md) — seeded cross-operator check comparing Atlas output with independent GTFS calculations; PDF review is reserved for unclear or failed cases.

## Experiments

- [Offline stop-hub clustering](../experiments/stop-hub-clustering.md) — local verification passed; map QA remains pending a PMTiles rebuild.

## Product synthesis

- [Agency pain points and problem statements](../product/RESEARCH.md) — strategic synthesis connecting agency research to Atlas product opportunities. This is interpretation, not a replacement for the dated source reports above.

## Report conventions

New reports should include, near the top:

- status
- checked or generated date
- scope and sample
- source/evidence boundary
- whether production behavior changed
- links to structured data and supporting assets

When a report is updated, keep the dated filename if the scope is unchanged and update its status/date. Create a new dated report when the sample, method, or research question materially changes.
