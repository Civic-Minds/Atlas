# The Atlas Pipeline: How We Calculate Transit Frequency

This document describes the methodology used by the Atlas data processing pipeline to turn raw General Transit Feed Specification (GTFS) schedule feeds into the frequency layers rendered on the map.

By standardizing feed schedules across different transit agencies, this pipeline produces a unified, regional transit frequency map.

---

## Technical Methodology

### 1. Fetching the Feeds
The pipeline downloads each agency's GTFS feed from its official source URL. If an official URL is rate-limited or unstable, the pipeline falls back to a stable mirror hosted on the [Mobility Database](https://mobilitydatabase.org/).

- **Update Frequency:** Feeds are checked and re-downloaded automatically every week.
- **Mirroring:** We use Mobility Database mirrors for agencies with unstable feeds to ensure the weekly refresh is reliable.

### 2. Active Schedule Detection
GTFS feeds often package historical, current, and future service periods together. The pipeline checks the calendar dates inside the feed and programmatically determines which schedule is currently active.

- **Resolution:** It looks for active dates closest to the execution day to ensure the map shows what is actually running now, rather than an expired or future schedule.
- **Service Types:** Departures are split into Weekday, Saturday, and Sunday schedules.

### 3. Route Shape Selection
Transit routes often have multiple routing variants, such as branches, short-turns, or trips to the garage. To keep the map clean, the pipeline isolates two specific shapes for each route:

- **Display Shape:** The pipeline selects the shape variant with the longest geographical path to display on the map. This ensures the full extent of the route is visible.
- **Headway Shape:** For counting departures, the pipeline selects the shape corresponding to the most common trip pattern (the trunk line). This prevents short-turns from skewing the frequency calculation.

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
Calculated median headways are mapped to qualitative frequency tiers. These tiers determine the colors and line weights shown on the map:

| Tier | Headway Range | Description |
|------|---------------|-------------|
| Rapid | $\le 10$ min | High-frequency trunk |
| Frequent | $11 - 15$ min | Turn-up-and-go service |
| Regular | $16 - 30$ min | Standard scheduled service |
| Moderate | $31 - 60$ min | Low-frequency service |
| Infrequent | $> 60$ min | Minimal coverage service |

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

## Edge Cases & Exceptions

- **Day/Night Route Splits:** Some agencies publish separate route IDs for day and night variants of the same corridor. The pipeline merges these and selects the lower headway variant to show them as a single route on the map.
- **Commuter Rail Shape Overrides:** For rail lines, the pipeline locks both the display and analytical shapes to the longest variant. This ensures that short-turns do not truncate the rail lines on the map.
- **GTFS-Flex (On-Demand Transit):** We do not process demand-responsive transit zones yet because GTHA agencies do not publish GTFS-Flex data. This will be added once feeds adopt the spec.

---

## Operational Workflows

### Protocol A: Integrating a New Transit Agency
To manually add an agency to Atlas:

1. Obtain the GTFS ZIP download link (preferring a stable agency URL or Mobility Database link).
2. Process the feed:
   ```bash
   npm run process -- <feed-url-or-local-zip> <slug> "[Display Name]" "[lat,lon]"
   ```
3. Add or edit the agency source file in `config/agencies/<slug>.json`:
   - Configure `region`, `feedUrl`, `mdbFeedUrl`, and `bbox` (bounding box).
   - Note: Artifact URLs are derived from the slug at runtime; do not hardcode them.
4. Generate the runtime index:
   ```bash
   npm run build:agency-index
   ```
5. Run the refresh script to pull supplemental feeds and setup history config:
   ```bash
   npm run refresh -- <slug> --force
   ```
6. Commit the source agency file and regenerated `public/data/index.json`.

### Protocol B: Querying the Mobility Database
To search for an agency in the Mobility Database catalog:
```bash
npm run find-mdb -- "[search query]" <slug> "[lat,lon]"
# Example:
npm run find-mdb -- "Hamilton Street Railway" hamilton "43.25,-79.87"
```

### Protocol C: Coverage Gap Discovery
To locate missing transit agencies by cross-referencing global catalogs against existing coverage:
```bash
# General discovery:
npm run discover-gaps

# Filtered by region or population:
npm run discover-gaps -- --region Ontario --limit 20
npm run discover-gaps -- --min-pop 100000
```
This script identifies uncovered feeds, ranks them by metropolitan population, and writes candidates to `tmp/gap-candidates.json`.

### Protocol D: Batch Processing
Because rebuilding PMTiles is resource-intensive, process new agencies in batches:
1. Identify candidates using **Protocol C**.
2. Run `npm run process` for each candidate.
3. Add the new entries under `config/agencies/`, then run `npm run build:agency-index`.
4. Refresh all new slugs in a single command:
   ```bash
   npm run refresh -- slug1 slug2 slug3 --force
   ```
5. Rebuild the PMTiles archive:
   ```bash
   npm run build-pmtiles
   ```
6. Upload the new `atlas.pmtiles` file to the Cloudflare R2 bucket.
7. Record the additions in `CHANGELOG.md` and mark backlog items `done` in `docs/AGENCY_BACKLOG.md`.
