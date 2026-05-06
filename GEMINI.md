# Atlas — Gemini Working Notes

Atlas is a transit intelligence platform. This document stores project context specifically for Gemini-based agents (Antigravity).

## Project Roadmap
We are currently wrapping up **Phase 2: Intelligence Layer**, bridging the gap between raw backend GTFS/GTFS-RT data and agency-facing performance visibility.

- Version: `0.14.0`
- Current Goal: Build out the user-facing **Performance Module** to expose internal intelligence endpoints (network pulse, bottlenecks, stop dwells, ghost buses, service audits).
- **Production Runtime**: Realtime GTFS-RT ingestion runs on OCI. Do not assume live vehicle data depends on a local machine.
- **Historical Note**: Older local "Discovery Lab" / Manhattan full-fleet experiments are not the current production runtime path.
- **Next Up (Phase 3 Prep)**: Alerting UI (threshold management) and Board Report Export.

## OCI Production Server

See [`docs/SERVER.md`](./docs/SERVER.md) for SSH access, DB URLs, deploy workflow, and PM2 command.

## External Tracking (Notion)

The following primary Notion databases are used for project management and health monitoring. See [NOTION_REGISTRY.md](docs/NOTION_REGISTRY.md) for full schema details and mapping logic.

| Database Name | Notion ID | Purpose |
| :--- | :--- | :--- |
| **Agencies Database Atlas** | `3339563c9a49804e92fde353d1470eb4` | Live registry of all 40+ agencies. Track IDs, Status (Testing/Live), and Route Filters. |
| **AtlasLog** | `3589563c9a49804ab8b6e78f455abb8c` | Portfolio tracker — resume-worthy technical work only. See [`ATLASLOG.md`](./ATLASLOG.md) for rules. |


## Key Concepts & Patterns

- **Phase 1 (Static)**: GTFS Zip ingestion into Static DB (PostgreSQL).
- **Phase 2 (Real-time)**: GTFS-RT polling + Matcher Service (`matcher.ts`) correlate GPS pings with static schedules to produce `delay_seconds`.
- **Route Filtering**: Only high-frequency or rapid trunk lines are currently being tracked for Phase 2 validation.

## Complementary Files
- `CLAUDE.md` — Contains core project paths, accuracy snapshot workflows, and general development notes for Claude.
- `CHANGELOG.md` — All Phase 2 work is being tracked in the `[Unreleased]` section.
