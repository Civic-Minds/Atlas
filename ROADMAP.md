# Roadmap

Atlas is a regional transit atlas: GTFS feeds → processed GeoJSON on Cloudflare R2, rendered by a React + Leaflet frontend. Coverage extends outward from the Greater Golden Horseshoe — Buffalo, London, Kingston, Montreal, and more on one continuous map.

The product direction is **map apps** — multiple task-specific views on the same regional data layer, switched via the app drawer (waffle icon). Each app answers a distinct question; features that are just a different filter on frequency (e.g. combined-corridor overlays) stay inside the Frequency Map.

## Now

- **Rail stops & departures (AI-52/53)**: GO rail stations and major hubs on the map; click a station for a scheduled departures board. GO feed refreshed on R2 with embedded `departures` stop properties.
- **Corridors app** (AI-104, branch `ai-104-corridors`): station-to-station lookup — merge after QA.
- Grow agency coverage outward from the core, one continuous regional map.
- Bug fixes and UX polish tracked in Linear (AI team → Atlas project).

## Map apps

| App | Status | Question |
|-----|--------|----------|
| **Frequency Map** | Live (default) | Where is service frequent or infrequent? |
| **Corridors** | In development | What runs directly between these two stations? |
| **History** | Planned | How did service change across schedule periods? |

**Bar for a new app**: does it need the map plus Atlas-processed data, and does it answer a question the Frequency Map can't answer cleanly? If not, it belongs as a panel, toggle, or filter inside Frequency.

**History** builds on schedule snapshots already written during refresh (`atlas-history/{slug}/{period}.json`, keyed by feed expiry date). Frontend timeline UI is the remaining work.

## Live data (shipped)

**GTFS-RT archiver Worker** (`workers/gtfs-rt-archiver/`) polls Burlington and Hamilton TripUpdates on a cron and writes raw `.pb` snapshots to the **`atlas-live`** R2 bucket at `{slug}/{YYYY-MM-DD}/{unix-seconds}.pb`. No parsing at capture time — storage for later analysis. Separate bucket from the main `atlas` GeoJSON bucket.

The in-app **live adherence panel** (Burlington 1/10, Hamilton 01/10) still fetches TripUpdates on demand when a covered route is selected.

## Schedule adherence (next)

Per-stop comparison of scheduled vs. actual headway — e.g. "scheduled every 10 minutes but actually running every 15–20 here."

- **Scope**: start with Hamilton B-Line and Burlington Route 1.
- **Approach**: combine on-demand TripUpdates (live panel) with archived snapshots from `atlas-live` for historical drift analysis — no always-on VM.
- **Constraint**: stays serverless and small.

## Later

- Expand schedule adherence to more routes/agencies once the first pass proves useful.
- History app UI once enough schedule snapshots have accumulated.

---

[Back to Home](./README.md)
