# Atlas NextGen

R&D initiative to evolve Atlas from a static GTFS analysis tool into a live transit intelligence platform — one that knows not just what the schedule *says*, but what the network actually *does*.

## The Objective

The backend's primary goal is to close the gap between the schedule and reality. This is achieved by continuously ingesting GTFS-RT vehicle positions across agencies, storing every observation, and mining that history for on-time performance, actual headway, and service reliability patterns.

---

## What Exists

| Component | Project | Status |
|-----------|---------|--------|
| GTFS-RT polling + anomaly detection | Bridge | Working |
| GTFS-RT routing + position awareness | Headway | Working |
| Static GTFS frequency analysis | Atlas (Strategy) | Working |
| GTHA coverage pipeline | Research/gtha-frequent-transit | Working |
| Multi-agency GTFS ingestion | Research/gtha-frequent-transit | Working |
| Persistent backend (Node/Express/Postgres) | Atlas NextGen `server/` | **Live** |
| Historical vehicle position store | Atlas NextGen `server/` | **Live** |
| Multi-agency ingestion (15 agencies) | Atlas NextGen `server/` | **Live** |
| Trip-matching logic | — | Not started |
| OTP analysis layer | — | Not started |

---

## Phase 1 — Persistence Layer

- [x] Design Postgres schema for vehicle position snapshots
- [x] Build ingestion layer: continuous GTFS-RT polling every 30s, writing to DB
- [x] Structured ingestion health log (success/failure per agency per poll)
- [x] Multi-agency support: 13 agencies live across US and Canada
- [ ] Trip-matching logic: observed position → scheduled trip → on-time delta
- [ ] REST API layer: endpoints for the frontend to query positions, OTP, and headway history
- [ ] Data retention policy: define pruning/archival window for raw position snapshots

---

## Phase 2 — Intelligence Layer

- [ ] OTP aggregation: per-route, per-stop, per-time-of-day breakdowns
- [ ] Schedule adherence scoring: route-level reliability score agencies can act on
- [ ] Actual headway calculation from vehicle position history
- [ ] Runtime analysis: identify scheduled segments that are consistently over/under
- [ ] Bunching detection: collapse events where headway doubles or triples
- [ ] Ghost bus detection: scheduled trips with no observed vehicle in the feed
- [ ] Feed health scoring: systematic reliability rating per agency (not just raw logs)
- [ ] Coverage analysis integration from Research pipeline

---

## Phase 3 — Atlas Frontend Integration

- [ ] Replace static GTFS-only views with live + historical data
- [ ] OTP map layer: routes coloured by actual performance
- [ ] Headway reliability view: actual vs. scheduled per corridor
- [ ] Coverage view: walkshed + population overlay
- [ ] Agency benchmarking dashboard

---

## Phase 4 — Multi-Agency + Commercial

- [ ] Pending agency unlocks: SF Muni (511 key), LA Metro + Las Vegas RTC + Miami-Dade (Swiftly key), Foothill Transit Silver Streak (IP whitelist), King County Metro (OBA key), Madison Metro (API key)
- [ ] GTHA agency expansion: MiWay, YRT, Brampton Transit, Hamilton Street Railway
- [ ] Custom JSON feed adapter: support agencies (e.g. CTA Chicago) that provide vehicle positions in non-protobuf JSON formats rather than standard GTFS-RT
- [ ] TimescaleDB migration: replace plain Postgres with TimescaleDB for scalable time-series queries
- [ ] Role-based access: agency sees only their own data + regional benchmarks
- [ ] Subscription model: agency-facing dashboard at ~$500/month
- [ ] Builder-side admin tools for data pipeline management

---

[Back to Roadmap](../ROADMAP.md)
