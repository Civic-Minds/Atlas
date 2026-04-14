# Atlas — Gemini Working Notes

Atlas is a transit intelligence platform. This document stores project context specifically for Gemini-based agents (Antigravity).

## Project Roadmap
We are currently wrapping up **Phase 2: Intelligence Layer**, bridging the gap between raw backend GTFS/GTFS-RT data and agency-facing performance visibility.

- Version: `0.14.0`
- Current Goal: Build out the user-facing **Performance Module** to expose internal intelligence endpoints (network pulse, bottlenecks, stop dwells, ghost buses, service audits).
- **Big Fish Experiment**: Full Fleet polling (8,000+ vehicles) moved to **Discovery Lab (Local)**; Cloud remains on **SBS-only** routes for `mtabus`. Local focus: **Manhattan**.
- **Next Up (Phase 3 Prep)**: Alerting UI (threshold management) and Board Report Export.

## External Tracking (Notion)

The following Notion databases are used for project management and health monitoring:

| Database Name | Notion ID | Purpose |
| :--- | :--- | :--- |
| **Agencies Database Atlas** | `3339563c9a49804e92fde353d1470eb4` | Live registry of all 40+ agencies. Track IDs, Status (Testing/Live), and Route Filters. |
| **AtlasLog** | (See `CLAUDE.md`) | Core development history and testing logs. |

## Key Concepts & Patterns

- **Phase 1 (Static)**: GTFS Zip ingestion into Static DB (PostgreSQL).
- **Phase 2 (Real-time)**: GTFS-RT polling + Matcher Service (`matcher.ts`) correlate GPS pings with static schedules to produce `delay_seconds`.
- **Route Filtering**: Only high-frequency or rapid trunk lines are currently being tracked for Phase 2 validation.

## Complementary Files
- `CLAUDE.md` — Contains core project paths, accuracy snapshot workflows, and general development notes for Claude.
- `CHANGELOG.md` — All Phase 2 work is being tracked in the `[Unreleased]` section.
