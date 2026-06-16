# Roadmap

Atlas is a static GTHA frequency map: GTFS feeds → GeoJSON → Vercel Blob, rendered by a React + Leaflet frontend. No server, no database.

## Now

- Grow agency coverage outward from the Greater Golden Horseshoe, one continuous regional map.
- Bug fixes and UX polish tracked in Linear (AI team → Atlas project).

## Next: Schedule adherence (targeted)

A per-stop comparison of scheduled vs. actual headway — e.g. "this route is scheduled every 10 minutes but is actually running every 15–20 at this stop."

- **Scope**: start small. First routes are Hamilton's B-Line and Burlington Transit's Route 1 — both express/BRT-style services where adherence drift is easy to see and explain.
- **Approach**: GTFS-RT vehicle positions polled via a Vercel Cron + Function, not an always-on server. Snapshots persisted to Blob for trend detection across runs.
- **Why this shape**: Atlas previously ran a full GTFS-RT polling backend ("Ouija") on an always-on OCI VM. That VM had heavy downtime and ate more time in ops firefighting than the feature ever delivered. This round stays serverless and stays small.
- **Why it matters**: gives Atlas an analysis layer beyond a static map — relevant for transit-planning co-op applications.

## Later

- Expand schedule adherence to more routes/agencies once the first pass proves useful.

---

[Back to Home](./README.md)
