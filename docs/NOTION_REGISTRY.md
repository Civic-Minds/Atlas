# Notion Integration Registry

This document tracks the Notion databases and properties used for Atlas NextGen's external intelligence and development logging.

## Core Databases

| Name | ID | Purpose | URL |
| :--- | :--- | :--- | :--- |
| **Agencies Database Atlas** | `3339563c9a49804e92fde353d1470eb4` | Live registry of all 40+ agencies used by the OCI production backend for health and status sync. | [Link](https://www.notion.so/3339563c9a49804e92fde353d1470eb4) |
| **AtlasLog** | `3589563c9a49804ab8b6e78f455abb8c` | Portfolio tracker — resume-worthy technical work only. See `ATLASLOG.md` for rules. | [Link](https://www.notion.so/3589563c9a49804ab8b6e78f455abb8c) |

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
