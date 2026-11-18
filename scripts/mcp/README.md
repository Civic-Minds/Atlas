# Atlas Studio for AI assistants (MCP server, private, local)

Part of Atlas Studio, the planner toolkit (Ryan, 2026-11-17). A read-only MCP server that lets Claude on this Mac answer planner questions from Atlas's own data (CIV-1650). It runs over stdio, reads files on disk, and fetches, uploads and writes nothing. It is not deployed anywhere.

## Setup

Paths below are for the main checkout. To replace the earlier `atlas` entry in Claude Code, first run `claude mcp remove atlas -s user`; in Claude Desktop, rename the `atlas` key. Both setups call `node` by its full path, because Claude Desktop starts servers without Homebrew on `PATH`, and `tsx`'s own launcher then can't find `node`. The server finds its data from its own file location, so the folder it starts in doesn't matter.

**Claude Code** (every project, `-s user`):

```bash
claude mcp add -s user atlas-studio -- /opt/homebrew/bin/node /Users/ryan/Developer/Code/Platforms/Atlas/node_modules/tsx/dist/cli.mjs /Users/ryan/Developer/Code/Platforms/Atlas/scripts/mcp/atlas-mcp.ts
```

**Claude Desktop**: add this to `~/Library/Application Support/Claude/claude_desktop_config.json`, merged into any `mcpServers` already there, then quit and reopen Claude Desktop:

```json
{
  "mcpServers": {
    "atlas-studio": {
      "command": "/opt/homebrew/bin/node",
      "args": [
        "/Users/ryan/Developer/Code/Platforms/Atlas/node_modules/tsx/dist/cli.mjs",
        "/Users/ryan/Developer/Code/Platforms/Atlas/scripts/mcp/atlas-mcp.ts"
      ]
    }
  }
}
```

## Tools

| Tool | Answers |
|---|---|
| `list_agencies` | Which agencies it covers, by name, city or region |
| `route_frequency` | A route's frequency in each period on a day type, with first and last trips; with a time window, hour by hour for each branch |
| `routes_at_frequency` | An agency's routes that run every N minutes or better in a period |
| `compare_agencies` | For several agencies, how many routes run every N minutes or better in a period |
| `trip_time` | Scheduled trip time between two stops, per route, by the hour the trip leaves |
| `combined_frequency` | Every route between two stops, and how often a trip leaves on any of them combined |
| `schedule_changes` | Frequency changes between two schedules, where Studio has built the comparison |

`waitMinutes` in the frequency tools is the typical wait on the route's least frequent part (its slowest branch or direction): the number the map colours and filters the route by. A range like "every 5–16 min" means every 5 on the busiest part of the route and every 16 on the quietest.

The standing test questions and every run's results: [TEST-LOG.md](TEST-LOG.md). Rerun them after every change to the server.

## Data

- **Frequencies.** Each agency's published route file. The server reads the newest release cache first (`tmp/agency-pages-cache/<release>/`, written by `build-agency-page-summaries.ts`), then local dry-run output (`tmp/process-preview/<slug>/`). `ATLAS_MCP_DATA_DIR` points it at another folder. Every number comes from the map's own functions: `routeListFilterDisplay`, `routeListDisplay`, `routeRuns` and the hourly chart values.
- **Trip times and combined frequency.** The agency's schedule file that Atlas processed (`Atlas-worktrees/_feeds/<slug>/`, newest; `ATLAS_MCP_FEEDS_DIR` overrides). It is read the way processing reads it (`pipeline/stopToStop.ts`): same week, same services, near-duplicate trips dropped, same representative weekday. Trip times are summarized with the running-time rules (`runningTimeSummary`). Combined frequency uses the stop-pool rule the map uses at a stop (`pooledReadingInWindow`).
- **Public agencies only.** It answers only for agencies in `public/data/catalog-public.json`.
- **Schedule changes.** These come from Studio's comparison files (`tmp/studio/<slug>-before-after.json`), ranked by the shared rule (`shared/frequencyChange.ts`).
