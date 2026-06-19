# Technical Roadmap

Engineering direction for Atlas infrastructure and the live data layer.

---

## Current Stack

| Layer | What | Status |
|-------|------|--------|
| Frontend | React + Leaflet, hosted on Vercel | Live |
| Route data | GTFS → GeoJSON pipeline, stored on Cloudflare R2 | Live |
| Weekly refresh | GitHub Actions cron → `npm run refresh` | Live |
| GTFS-RT archiving | Cloudflare Worker → raw `.pb` snapshots to `atlas-live` R2 bucket | Live (Burlington + Hamilton) |
| Live adherence panel | On-demand TripUpdates fetch when a covered route is selected | Live (Burlington 1/10, Hamilton 01/10) |

---

## Next: Live Data Infrastructure

The goal is to move from storing raw GTFS-RT blobs to storing queryable events — so questions like "is this bus always late on Tuesday mornings at this stop" become answerable without downloading and scanning hundreds of files.

- [ ] **Extend GTFS-RT Worker to capture VehiclePositions**: write `{slug}/vehicles/latest.json` per agency to R2 on each poll; frontend polls R2 every 30s for the live map
- [ ] **Add Neon Postgres**: serverless Postgres for structured adherence events — (agency, route, stop, scheduled time, actual time, day of week, period). Neon scales to zero when idle, no always-on instance needed.
- [ ] **Trip-matching logic**: match observed vehicle positions to scheduled trips using GTFS static data to derive delay in seconds per stop visit
- [ ] **Adherence event writer**: on each poll, derive stop-level delay and write rows to Postgres alongside the raw R2 archive

Why Postgres and not just R2: R2 is a file store, not a query engine. Pattern questions ("always late Tuesdays") require aggregating across thousands of observations — that needs SQL.

---

## Later

- [ ] **Data retention**: define pruning window for raw R2 `.pb` files; aggregate into daily summaries after 90 days
- [ ] **Expand Worker coverage**: add more agencies beyond Burlington and Hamilton once the pipeline is validated
- [ ] **Trip-matching confidence score**: flag observations where the vehicle-to-trip match is uncertain, so low-quality matches don't pollute performance metrics

---

[Back to Roadmap](../ROADMAP.md)
