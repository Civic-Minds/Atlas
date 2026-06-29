# Data Overrides

Atlas processes GTFS feeds as published by each agency. When a feed contains a known error that won't self-correct in the near term, we apply a targeted override at ingest time rather than show incorrect information.

Overrides are configured in `public/data/index.json` under each agency entry and applied by the pipeline before processing. They are documented here for transparency.

---

## stratford

**Agency:** Stratford Transit

**Override:** `excludeRouteShortNames: ["LOS"]`

**Reason:** "Lights On Stratford" (route short name `LOS`) is a free hop-on hop-off shuttle that runs during the Lights On Stratford festival — a seasonal event from mid-December to mid-January. The current GTFS feed incorrectly marks these routes as operating every Thursday through Sunday year-round. We exclude them until the feed is corrected.

**Added:** June 2026
