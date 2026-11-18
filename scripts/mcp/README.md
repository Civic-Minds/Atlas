# Atlas MCP server (private, local)

A read-only MCP server that lets Claude on this Mac answer planner questions from Atlas's own processed data (CIV-1650). It runs over stdio, reads files on disk, and fetches, uploads and writes nothing. It is not deployed anywhere.

## Setup

From the Atlas checkout:

```bash
claude mcp add atlas -- "$PWD/node_modules/.bin/tsx" "$PWD/scripts/mcp/atlas-mcp.ts"
```

## Tools

| Tool | Answers |
|---|---|
| `list_agencies` | Which agencies it can answer for, with schedule end date and last check |
| `route_frequency` | A route's frequency in each period on a day type, as the map shows it, plus first and last trips |
| `routes_at_frequency` | An agency's routes that run every N minutes or better in a period |
| `compare_agencies` | For several agencies, how many routes run every N minutes or better in a period |
| `schedule_changes` | Frequency changes between two schedules, where Studio has built the comparison |

## Data

- **Route files.** It reads each agency's processed route file. It takes the newest release cache (`tmp/agency-pages-cache/<release>/`, written by `build-agency-page-summaries.ts`) first, then local dry-run output (`tmp/process-preview/<slug>/`). `ATLAS_MCP_DATA_DIR` points it at another folder.
- **Public agencies only.** It answers only for agencies in `public/data/catalog-public.json`.
- **Same calculation as the map.** Every number comes from the map's own shared functions: `routeListFilterDisplay`, `routeListDisplay`, `routeRuns` and `frequencyChange`.
- **Schedule changes.** These come from Studio's comparison files (`tmp/studio/<slug>-before-after.json`).
