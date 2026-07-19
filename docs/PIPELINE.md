# The Atlas Pipeline: How We Calculate Transit Frequency

This document describes the methodology used by the Atlas data processing pipeline to turn raw General Transit Feed Specification (GTFS) schedule feeds into the frequency layers rendered on the map.

By standardizing feed schedules across different transit agencies, this pipeline produces a unified, regional transit frequency map.

---

## Technical Methodology

### 1. Fetching the Feeds
The pipeline downloads each agency's configured primary GTFS feed. Depending on the agency, that may be an official feed, a provider-hosted mirror, a [Transitland](https://www.transit.land/) archive, or a [Mobility Database](https://mobilitydatabase.org/) dataset. Some agencies also have a configured Mobility Database fallback when the primary feed fails.

- **Update Frequency:** Feeds are checked and re-downloaded automatically every week.
- **Fallbacks:** The refresh process uses `mdbFeedUrl` only when the configured `feedUrl` fails; it can also merge explicitly configured supplemental feeds.

### 2. Active Schedule Detection
GTFS feeds often package historical, current, and future service periods together. The pipeline checks the calendar dates inside the feed and programmatically determines which schedule is currently active.

- **Resolution:** It looks for active dates closest to the execution day to ensure the map shows what is actually running now, rather than an expired or future schedule.
- **Service Types:** Departures are split into Weekday, Saturday, and Sunday schedules.

### 3. Route Shape Selection
Transit routes often have multiple routing variants, such as branches, short-turns, or trips to the garage. To keep the map clean, the pipeline isolates two specific shapes for each route:

- **Display Shape:** Geometry is selected per route and headsign, using the active trip patterns and their geographic lengths so the displayed feature represents the relevant service pattern.
- **Analysis Shapes:** Departure analysis uses representative shape groups for bus routes so short-turns and branches do not silently distort the route's frequency. Rail routes and agency-specific overrides can use different shape rules.

### 4. Counting Departures
Instead of trusting the optional headway fields in GTFS feeds (which agencies often leave blank or format incorrectly), Atlas counts departures directly from `stop_times.txt`.

- **Event Parsing:** The pipeline extracts departure times for every stop on a route.
- **Grouping:** Departures are grouped by route, direction, day type, and stop.
- **Time Windows:** Departures are analyzed within defined service windows (such as Midday or PM Peak) to isolate headway variations throughout the day.

### 5. Calculating Headways
A route's frequency is calculated as the median gap (headway) between consecutive departures.

- **Why the Median:** We use the median instead of the mean (average) because it is much more resistant to outliers. For example, if a bus runs every 10 minutes all day but has one 60-minute gap for a driver shift change, the median headway remains 10 minutes, representing the typical rider experience.
- **Stop-Level Headways:** Gaps are computed at every individual stop along a route. This powers the Corridors app, which displays frequency at the passenger's boarding stop rather than a generic route average.

### 6. Assigning Frequency Tiers
Atlas uses sustained service thresholds to assign frequency tiers. It tests the analyzed gaps across each service window, allowing a small number of grace-period violations, then stores headway metrics separately for display and filtering. The current surface thresholds are:

- **≤10 minutes**
- **≤15 minutes**
- **≤20 minutes**
- **≤30 minutes**
- **≤60 minutes**
- **Infrequent:** worse than 60 minutes or no finite tier qualifies

These thresholds determine the colors and line weights shown on the map. Median headways remain useful as route and stop-level display metrics, but a median alone does not determine the tier.

### 7. Generating Output & Distribution
To maintain a serverless architecture, the pipeline converts the processed data into static files:

- **Route GeoJSON:** Contains route geometries populated with headways and frequency tiers.
- **Stops Index:** A lightweight JSON lookup of stop coordinates and names, used by the Corridors app for search.
- **Vector Tiles:** Route shapes and stops are compiled into a single `atlas.pmtiles` archive for fast rendering.
- **Storage:** All generated files are uploaded to Cloudflare R2, which serves them directly to the client.

### 8. Loading Data on the Map
The frontend client uses lazy loading to keep the application fast and responsive:

- **Viewport Loading:** The map only requests GeoJSON files for transit agencies currently visible in the user's viewport.
- **Vector Tile Queries:** MapLibre GL dynamically queries the PMTiles archive for geometries as the user pans and zooms.

---

## Exceptions and limitations

Feed-specific quirks and current data limitations are documented in [`KNOWN_ISSUES.md`](./KNOWN_ISSUES.md). The pipeline methodology stays here; the issue document records exceptions such as day/night route pairs, commuter-rail shape selection, missing shapes, and the current GTFS-Flex scope.

---

## Maintainer workflows

The command-by-command runbooks live in [`ADDING_AGENCIES.md`](./ADDING_AGENCIES.md) (onboarding), [`MAP_UPDATES.md`](./MAP_UPDATES.md) (refreshing/publishing), [`COVERAGE_GAP_DISCOVERY.md`](./COVERAGE_GAP_DISCOVERY.md) (finding candidates), and [`FIXING_ISSUES.md`](./FIXING_ISSUES.md) (scoping and validating a fix once a bug is found). This page stays focused on the methodology behind the public map.

---

[Back to Data](./DATA.md)
