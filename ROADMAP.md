# Roadmap

Atlas is a regional transit atlas: GTFS feeds → processed GeoJSON on Cloudflare R2, rendered by a React + Leaflet frontend. Coverage extends outward from the Greater Golden Horseshoe — Buffalo, London, Kingston, Montreal, and more on one continuous map.


## Now

- **Corridors app** (v2.3.0): station-to-station lookup, live.
- Grow agency coverage outward from the core, one continuous regional map.
- Bug fixes and UX polish tracked in Linear (AI team → Atlas project).

## Live data (shipped)

**GTFS-RT archiver Worker** (`workers/gtfs-rt-archiver/`) polls Burlington and Hamilton TripUpdates on a cron and writes raw `.pb` snapshots to the **`atlas-live`** R2 bucket at `{slug}/{YYYY-MM-DD}/{unix-seconds}.pb`. No parsing at capture time — storage for later analysis. Separate bucket from the main `atlas` GeoJSON bucket.

The in-app **live adherence panel** (Burlington 1/10, Hamilton 01/10) still fetches TripUpdates on demand when a covered route is selected.

## Schedule adherence (next)

Per-stop comparison of scheduled vs. actual headway — e.g. "scheduled every 10 minutes but actually running every 15–20 here."

- **Scope**: start with Hamilton B-Line and Burlington Route 1.
- **Approach**: combine on-demand TripUpdates (live panel) with archived snapshots from `atlas-live` for historical drift analysis.
- **Next step**: add Neon Postgres for structured adherence events so pattern queries work (e.g. "always late on Tuesdays at this stop").

## Later

- Expand schedule adherence to more routes/agencies once the first pass proves useful.
- History app UI once enough schedule snapshots have accumulated.
- Live vehicle map across more agencies.

---

## Docs

- [Vision](docs/VISION.md)
- [Research](docs/RESEARCH.md)
- [Strategy](docs/STRATEGY.md)
- [Product Roadmap](docs/ROADMAP_PRODUCT.md)
- [Technical Roadmap](docs/ROADMAP_TECHNICAL.md)
- [Platform Roadmap](docs/ROADMAP_PLATFORM.md)
- [Agencies](docs/AGENCIES.md)

---

[Back to Home](./README.md)
