# Notion Integration Registry

This document tracks the Notion databases and properties used for Atlas NextGen's external intelligence and development logging.

## Core Databases

| Name | ID | Purpose | URL |
| :--- | :--- | :--- | :--- |
| **Agencies Database Atlas** | `3339563c9a49804e92fde353d1470eb4` | Live registry of all 40+ agencies used by the OCI production backend for health and status sync. | [Link](https://www.notion.so/3339563c9a49804e92fde353d1470eb4) |
| **AtlasLog** | `3589563c9a49804ab8b6e78f455abb8c` | Portfolio tracker — resume-worthy technical work only. See `ATLASLOG.md` for rules. | [Link](https://www.notion.so/3589563c9a49804ab8b6e78f455abb8c) |
| **AgenciesLog** | `3589563c9a4980a4a9ede5eb76317085` | Stable structural registry of tracked agencies, slugs, coarse status, data types, and durable notes. | [Link](https://www.notion.so/3589563c9a4980a4a9ede5eb76317085) |
| **UptimeDatabase** | `3589563c9a49805a8b5bc98b59c7dbbe` | Human-readable OCI uptime snapshots. Each row is a point-in-time check, not a live dashboard. | [Link](https://www.notion.so/3589563c9a49805a8b5bc98b59c7dbbe) |

## Data Mapping Schema

### Agencies Database Atlas
Used by `server/src/intelligence/notion-sync.ts` to push real-time health and performance metrics.

- **Primary Key**: `ID` (Rich Text) — Matches the `agencyId` slug (e.g., `ttc`, `mtabus`).
- **Status Mapping**:
  - `Live`: Agency is successfully returning GTFS-RT positions and has > 0 active vehicles.
  - `Down`: Agency position poll failed or returned an empty set.
- **Performance**: `Performance` (Number) — Latest aggregate AHW (Average Headway) reliability score (0-100).
- **Notes**: `Notes` (Rich Text) — Contains sync timestamp, vehicle occupancy count, and last error message.

## Automated Sync (Intelligence Layer)

The `syncAgencyToNotion` function is triggered by the position-poll worker.
- **Source**: `server` on OCI production
- **Target**: Notion Cloud (Enterprise Registry)
- **Required**: `NOTION_TOKEN` environment variable must be set in the OCI production `.env`.

> [!NOTE]
> If the MCP Notion bridge is unresponsive, these IDs serve as fallback for manual updates and API debugging.

## Manual Ops Logging

### AgenciesLog
- Use for stable agency registry data, not transient live incidents.
- Good fit: tracked agency name, slug, coarse status, data coverage, durable notes.
- Bad fit: minute-by-minute runtime state or one-off outages.

### UptimeDatabase
- Use for point-in-time OCI health snapshots.
- `Name` should be a timestamped title such as `2026-05-06 18:17 OCI Check`.
- `Running`, `Not Running`, and `Issues` should be simple comma-separated agency lists.
- Leave `Running`, `Not Running`, or `Issues` blank if there is nothing to report.
- Do not write placeholders like `none`, `n/a`, or `unknown`.
