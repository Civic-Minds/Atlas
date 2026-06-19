# Roadmap

Atlas is a regional transit atlas: GTFS feeds → processed GeoJSON on Cloudflare R2, rendered by a React + Leaflet frontend. Coverage extends outward from the Greater Golden Horseshoe — Buffalo, London, Kingston, Montreal, and more on one continuous map.

The product direction is **map apps** — multiple task-specific views on the same regional data layer, switched via the app drawer (waffle icon). Each app answers a distinct question; features that are just a different filter on frequency (e.g. combined-corridor overlays) stay inside the Frequency Map.

## Now

- **Corridors app** (AI-104, branch `ai-104-corridors`): station-to-station lookup — find all direct routes connecting two stops, grouped by route with branch headsigns and headway at the destination stop. Pipeline emits per-agency stop indexes (`{slug}-stops.json`); not yet merged to `main`.
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

## Schedule adherence

Per-stop comparison of scheduled vs. actual headway — e.g. "scheduled every 10 minutes but actually running every 15–20 here."

- **Shipped (partial)**: on-demand GTFS-RT TripUpdates for Burlington 1/10 and Hamilton 01/10; live adherence card in the route panel when a covered route is selected.
- **In progress**: GTFS-RT archiver Worker (AI-98) captures raw TripUpdates snapshots to R2 every 5 minutes for later analysis — no parsing at capture time.
- **Next**: expand route coverage once the first pass proves useful; consider richer analysis from archived RT data.
- **Constraint**: stays serverless and small. Atlas previously ran a full GTFS-RT polling backend on an always-on VM; that ate more ops time than it delivered.

## Later

- History app UI once enough schedule snapshots have accumulated.
- Broader schedule-adherence coverage across routes and agencies.

---

[Back to Home](./README.md)
