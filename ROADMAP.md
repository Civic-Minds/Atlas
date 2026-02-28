# Atlas Roadmap

## Current State (v0.9.0)

Atlas is a transit intelligence platform built on a GTFS analysis engine, persistent route catalog, and map visualization layer. The core pipeline is:

```
GTFS Upload → Web Worker Parsing → Screening (frequency analysis) → Commit to Catalog → Atlas Map
```

### What works today
- **GTFS Parsing**: Reads routes, trips, stops, stop_times, calendar, calendar_dates, shapes, feed_info, and agency.txt. Handles calendar-only, calendar_dates-only, and combined feeds.
- **Two-Phase Analysis**: Raw departure extraction per individual day (Mon-Sun), then criteria application with configurable time windows, tier thresholds, and grace periods. Weekday rollup uses worst-tier-across-days.
- **Persistent Catalog**: IndexedDB-backed route catalog with feed versioning. Every upload creates new snapshots; old entries preserved for history. Schedule change detection inherits verification status for unchanged routes.
- **Multi-Agency**: Parser reads agency.txt and assigns per-route agency_id. Combined feeds (one ZIP with multiple operators) properly attribute routes. Multiple agencies coexist in the catalog.
- **Direction Pairing**: Both directions of a route are linked via `routePairKey` in the database.
- **Verification**: Per-route Verify/Flag/Skip controls with notes, persisted to IndexedDB.
- **Atlas Map**: Leaflet map rendering all cataloged routes with frequency tier coloring, agency filter, auto-zoom, dark/light basemaps.
- **Route Audit**: Departure table, headway timeline, gap distribution chart, departure strip, per-day breakdown, service_id provenance.
- **108 tests passing**, 0 TypeScript errors, clean production build.

---

## Next Steps

### Near-term (data pipeline completion)

**Feed Management UI**
- View all uploaded feeds with metadata (agency, date range, route count, upload date)
- Delete a feed and its catalog entries
- Re-upload flow with change detection preview

**Verifier Module Overhaul**
- Repurpose existing VerifierView as a catalog-wide verification dashboard
- Show all unreviewed routes across all agencies, sorted by priority
- Batch verification (verify all routes for an agency at once)
- Filter by verification status (unreviewed / verified / flagged)

**Criteria Panel UI**
- Let users change time windows, tier thresholds, and grace settings in the browser
- The `AnalysisCriteria` type and `setCriteria()` store action already exist — needs a settings panel
- Save criteria to IndexedDB so they persist

**Route History View**
- Click a cataloged route to see its history timeline
- "Route 10 Weekday: 10min (Mar 2026, verified) → 15min (Jun 2026, unreviewed)"
- Data is already stored — needs UI

**Screener Catalog Integration**
- Show verification status column in the Screener results table
- Visual indicator for "already in catalog" vs "new route"
- Inline verification from the Screener table (without opening the modal)

### Mid-term (analysis depth)

**Export / Import**
- Export entire catalog as JSON for backup or sharing between devices
- Import catalog JSON to restore or merge databases
- Bridge to eventual cloud backend

**Direction-Paired Display**
- Use `routePairKey` to show Route 10 as one row with Dir 0 and Dir 1 as sub-rows
- Combined verification: verify a route as a whole rather than per-direction
- Direction comparison: side-by-side headway charts for both directions

**Catalog Search & Filtering**
- Search routes by name, number, mode, tier, agency
- Filter catalog by verification status, tier, date range
- Sort by headway, reliability score, trip count

**GTFS Spec Compliance**
- Validate `agency_id` referential integrity (routes → agencies)
- Warn on multi-agency feeds where routes lack `agency_id`
- Surface validation issues in the commit modal before writing to catalog

### Long-term (platform expansion)

**Cloud Backend**
- Move catalog from IndexedDB to a server-side database
- User accounts, team sharing, permissions
- API for programmatic access to catalog data

**Access Module (Equity & Isochrone Mapping)**
- Walking-time isochrones from any stop using the GTFS stop graph
- Census demographic overlay to surface equity gaps
- Coverage score per demographic zone

**Collaborate Module (Scenario Sharing)**
- Export Simulate sessions as shareable URLs (no backend required initially)
- Read-only scenario viewer for public engagement

**Monitor Module (GTFS-RT Integration)**
- Consume GTFS-RT VehiclePositions/TripUpdates feeds
- Compare real-time headways to static schedule tiers
- "Plan vs. reality" dashboard that feeds anomalies back into the Screen queue
- Closes the feedback loop in the planning lifecycle

**Optimize Module (Network Redesign)**
- Algorithmic route optimization using catalog data
- Generate candidate network designs based on demand patterns
- Feed proposals into Simulate for impact modeling
