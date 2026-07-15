# Known Issues

Ongoing data gaps, feed quirks, and platform limitations that aren't tracked as Linear bugs because they're either outside our control or waiting on upstream changes.

---

## Missing Agencies

Permanent blockers only — agencies we cannot add because upstream has no fixed-route GTFS or the feed is dead. Actionable adds belong in [`AGENCY_BACKLOG.md`](AGENCY_BACKLOG.md).

| Agency | Reason | Notes |
|--------|--------|-------|
| Bradford BWG Transit | On-demand only | No fixed-route GTFS; evaluated 2026 |
| STTR Trois-Rivières | Dead feed | MDB/official URL unreturnable; retry periodically |
| RTC Québec City | Dead feed | Follow-up from CHANGELOG_ARCHIVE |
| Peterborough Transit | No public GTFS | Metrolinx tmix slug 404; not in MDB; retry periodically |
| Brantford Transit | No public GTFS | Metrolinx tmix slug 404; not in MDB; retry periodically |
| Transit Cape Breton | No public GTFS | Not in MDB / Canadian INF sources; retry periodically |
| STS Saguenay | No usable public zip | Données Québec “STS” host serves Sherbrooke (sts.qc.ca), not Saguenay |
| Manchester Transit Authority (NH) | Inactive MDB only | No active public fixed-route GTFS; retry periodically |

---

## Feed Issues

### Feeds requiring Mobility Database mirrors
Some agencies publish feeds at unstable or rate-limited URLs. We use the Mobility Database stable mirror (`storage.googleapis.com/storage/v1/b/mdb-latest/o/{id}.zip?alt=media`) for:
- **Grand River Transit** (GRT) — official URL unreliable
- **Niagara Transit** (Niagara Region Transit) — official URL unreliable

If a weekly refresh fails for an agency, check whether the official `feedUrl` in `index.json` is still valid before blaming the pipeline.

### GO Transit dual route IDs
GO Transit publishes two overlapping route ID sets per schedule period (e.g. `04260626-41` and `06260926-41` for route 41). The pipeline deduplicates these by `routeShortName::direction::day::headsign`, keeping the lower-headway feature. The losing feature's stop headways are discarded. This is expected behaviour.

---

## Data Quirks (not bugs)

### Non-round GO Transit headways
GO Transit buses frequently show headways like 55 min instead of 60 min. This is accurate — GO schedules are not uniformly spaced. For example, route 94 "to Pickering GO" departs Square One at 09:35, 11:40, 12:35, 13:35, 14:20, 14:50 during Midday — a 2-hour gap followed by clustering. The median gap is genuinely 55 min.

### Corridors headway is at the FROM stop
The Corridors app shows frequency at the departure stop (where the user waits), not the destination. At major hubs like Square One, many patterns converge and the TO-stop headway is artificially low — GO route 41 showed 7 min at Square One but 30 min at Hamilton GO, where the user actually boards.

### NRT day/night route pairs
Niagara Transit (Niagara Region Transit) publishes separate daytime and nighttime route numbers (for example, 316 and 416, or 309 and 409). Atlas keeps those published route numbers separate so nighttime service does not make the daytime route appear more frequent than its schedule.

### NRT 209/216 auxiliary GTFS trips
The NRT feed includes two- and three-stop records for routes 209 and 216 that are marked as ordinary passenger trips but are not part of the published route frequency. Atlas removes those malformed auxiliary patterns during preprocessing so routes 209 and 216 do not appear to run every 1–5 minutes. See [#194](https://github.com/Civic-Minds/Atlas/issues/194), linked to the broader route-service metrics issue [#186](https://github.com/Civic-Minds/Atlas/issues/186).

### Commuter rail shape selection
GO Rail routes have multiple shape variants (local vs express, different terminal branches). The pipeline selects the shape associated with the most-common headsign per direction. Shapes for minor branches (e.g. Barrie South short-turns) may not render.

---

## Platform Limitations

### GTFS-Flex / on-demand transit zones
GTFS-Flex (the extension for demand-responsive transit — `locations.geojson`, stop_times booking windows) is not yet published by any GTHA agency. Atlas can't display on-demand service zones until agencies adopt the spec. Tracked in Linear as a future feature.

### No amenity data
GTFS contains almost no stop-level amenity data (shelters, accessibility, real-time displays). Any amenity overlay would require a separate data source (OpenStreetMap, agency open data portals, or manual digitization). No current plan to add this.

### GBFS (bike share) not integrated
GBFS is a separate spec for shared micromobility (Bike Share Toronto, etc.). Atlas does not currently ingest GBFS feeds. Would require a separate pipeline and render layer.
