# Pipeline

How a transit agency's schedule becomes a layer on the Atlas map.

---

## 1. Fetch

Atlas pulls each agency's GTFS feed from the source — either the agency's own download URL or a stable mirror from the [Mobility Database](https://github.com/MobilityData/mobility-database-catalogs) when the official URL is unreliable. Feeds are re-downloaded automatically every week.

## 2. Detect the active schedule

GTFS feeds often contain future or expired service periods alongside the current one. The pipeline determines which service period is actually active — using the nearest date within a window of the current date that has scheduled service — so the map always reflects what's running now, not a past or future timetable.

## 3. Build route shapes

For each route, the pipeline selects the representative shape for display (the longest branch, to show full geographic extent) and the representative shape for frequency analysis (the most common trip pattern, to avoid letting short-turn trips distort the headway calculation). These can differ: a subway line that runs mostly end-to-end but occasionally short-turns still needs to show the full line on the map.

## 4. Count departures

For each route direction and day type (Weekday, Saturday, Sunday), the pipeline counts how often service departs across each stop within defined service windows. Rather than trusting the published headway field — which agencies often leave blank or fill in incorrectly — Atlas derives headway from the actual departure times in stop_times.

## 5. Calculate headway

The median gap between consecutive departures is used as the route's headway. Median is more stable than average: a route that runs every 10 minutes all day except for one 45-minute gap caused by a tripper trip will still show as a 10-minute route, not an inflated average.

Per-stop headways are also computed, because frequency varies along a route. An express route might serve downtown stops every 5 minutes but outlying terminals every 20. The per-stop values power the Corridors app (which shows headway at the destination stop, not the route average) and the frequency filter (which shows a route if any part of it meets the threshold).

## 6. Assign a frequency tier

Each route gets a tier based on its median headway — from rapid (very frequent service) through to infrequent or span-only (routes that only run outside the main service window). The tier determines the colour on the map.

## 7. Generate output

The pipeline produces two files per agency:

- **Route shapes** — a GeoJSON file with one feature per route direction per day type, carrying headway, tier, stop order, and per-stop frequency data
- **Stops index** — a lookup of stop IDs to names and coordinates, used by the Corridors app for station search

Both are uploaded to Cloudflare R2. The map fetches them directly — no server sits in between.

## 8. Load on the map

The frontend loads agency data lazily as you pan — only the agencies within your current viewport are fetched. This keeps the initial load fast regardless of how many agencies are in the system.

---

[Back to Home](./README.md)
