# How Atlas Handles Data

## Source data

Atlas uses GTFS (General Transit Feed Specification) — the open standard that transit agencies publish for their schedules. Each agency publishes a zip file containing stop locations, route shapes, trips, and departure times. Atlas pulls these feeds directly from agency sources, with fallback to the [Mobility Database](https://github.com/MobilityData/mobility-database-catalogs) mirror for agencies with unstable URLs.

Feeds are refreshed automatically every week. The pipeline always uses the current or nearest upcoming schedule, not expired service periods.

---

## Frequency analysis

For each route, Atlas counts how often service actually departs across each direction and day type (Weekday, Saturday, Sunday), within defined service windows. The median gap between departures is used as the route's headway — not a simple average, and not the scheduled headway from a timetable.

This matters because schedules and reality don't always match. Using median departure gaps from the raw stop_times data is more robust than trusting the published headway field, which agencies don't always fill in correctly.

Routes are assigned a frequency tier based on that median headway. The tier determines how the route is coloured on the map — from rapid (very frequent) through to infrequent or span-only service.

---

## What gets stored

Processed data is stored on Cloudflare R2 as GeoJSON. Each agency produces a route shapes file and a stops index. The frontend loads these files directly from R2 — there is no server or database between the data and the map.

Route shapes are loaded lazily as you pan the map, so only the agencies in your current viewport are fetched. The stops index for each agency is used by the Corridors app to power station search.

---

## Weekly refresh

A GitHub Actions workflow re-downloads and reprocesses every agency's feed each Monday morning. If a feed has changed, the new data is uploaded to R2 and the map reflects the updated schedule within hours — automatically, with no manual intervention required.

---

[Back to Home](./README.md)
