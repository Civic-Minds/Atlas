# Atlas Studio MCP, hosted pilot (CIV-1840)

A Cloudflare Worker that serves Atlas Studio's published-data tools (`scripts/mcp/tools.ts`: list, rank, route frequency, routes at a frequency, compare, routes near, route history, routes by hours, schedule changes) over MCP's Streamable HTTP, read-only. **First test deployment (2026-11-18):** `https://atlas-studio-mcp.rhanna-334.workers.dev` (workers.dev only), from `wrangler.pilot-test.jsonc`, with D1 `atlas-studio-mcp` and the `ADMIN_TOKEN` secret (kept in `~/Developer/Credentials/Atlas Studio MCP admin for Atlas.env`). The split files for eight agencies ship inside the Worker as static assets (`test-data/`, built by `scripts/mcp/splitRelease.ts`, git-ignored; nothing is in R2), so only those agencies answer. Invocation logs are off because the link carries the token. Everything below can also be run locally with `wrangler dev`.

## How it works

- **Data:** reads the split release files (`shared/mcpSplitStore.ts`) from `<DATA_ORIGIN>/atlas/releases/<releaseId>/mcp/`, found through the release pointer the map reads (`/atlas/release.json`, re-read every minute), so it follows each release by itself. Files of one release are cached at the edge for a day. The files are built by `scripts/mcp/splitRelease.ts` and ride the next batched data rebuild (an upload to R2 is the manager's call).
- **Private link per tester:** `POST /t/<token>/mcp`. Only a hash of the token is stored; the link is shown once when the tester is made. Revoking stops the link at once.
- **Fair use:** 30 calls a minute per tester (rate-limit binding, approximate and per location) and `DAILY_CALL_CAP` calls a day (300 until the manager sets it), counted from the log.
- **Log (Ryan, 2026-11-18):** every call is stored with its arguments, the optional `question` the assistant fills in, the answer returned, the time it took and the release. It is for improving the tools and data only. Every tool takes the optional `question`; the tools ignore it.
- **Delete paths per tester:** `DELETE /admin/testers/<name>/log` removes their log; `DELETE /admin/testers/<name>` removes the tester and the log.

## Admin (needs `Authorization: Bearer $ADMIN_TOKEN`)

| Call | Does |
|---|---|
| `POST /admin/testers {"name":"..."}` | Makes a tester and returns their link, once |
| `GET /admin/testers` | Lists testers with call counts |
| `POST /admin/testers/<name>/revoke` | Stops their link |
| `GET /admin/testers/<name>/log?limit=100` | Their calls, newest first |
| `DELETE /admin/testers/<name>/log` | Deletes their log |
| `DELETE /admin/testers/<name>` | Deletes the tester and their log |

## Run it locally

All local: no deploy, and no Cloudflare KV, D1 or R2 writes (`wrangler dev --local` keeps state in `.wrangler/`, which git ignores).

```bash
cd workers/atlas-mcp
printf 'ADMIN_TOKEN=local-only\nMCP_DATA_BASE=http://127.0.0.1:5311\n' > .dev.vars   # git ignores it
# 1. build the split files for a few agencies (or a full set) into a folder and serve it
ATLAS_ROOT=<main checkout> nice -n 15 npx tsx ../../scripts/mcp/splitRelease.ts /tmp/mcp-split TTC "Hamilton Street Railway"
python3 -m http.server 5311 --bind 127.0.0.1 --directory /tmp/mcp-split &
# 2. the local database and the Worker
npx wrangler@4.164.0 d1 migrations apply atlas-studio-mcp --local
npx wrangler@4.164.0 dev --local --port 5312
# 3. a tester, then the golden answers through the Worker
curl -X POST localhost:5312/admin/testers -H 'Authorization: Bearer local-only' -d '{"name":"Me"}'
node ../../scripts/mcp/goldenWorker.mjs <link from step 3> <golden file>
```

`MCP_DATA_BASE` (local only) replaces the release pointer with a folder served over HTTP. A Worker restart is needed after rebuilding the files: the tools keep the release they loaded.

## Before the real deploy (the manager decides each)

- The D1 database exists (id in both configs) and is migrated. Choose the rate-limit `namespace_id` (a placeholder is in the config) and the real `DAILY_CALL_CAP`.
- Switch from `wrangler.pilot-test.jsonc` (bundled files) to `wrangler.jsonc` (reads the release on R2) once the files are uploaded.
- Measured CPU per call on the deployed Worker, cold: 30–84 ms (route_history 84, rank_agencies 76, TTC route 52 82, TTC 29 32, list_agencies 30); warm calls are far less. The free plan's limit is 10 ms per request; all calls returned ok, so confirm which plan the account is on. To fit 10 ms: History per agency, a slimmer ranking index, a slimmer catalog.
- Upload the split files to `atlas/releases/<id>/mcp/` with the next data rebuild; History (8.4 MB) and the ranking index (4.9 MB) are each read whole, so split History per agency if memory on a busy isolate becomes a problem.
- The pilot note must say requests are logged (what the log keeps is above).
- `npm run typecheck:mcp-worker` checks the Worker and the MCP files; `npx wrangler@4.164.0 types --include-runtime=false` refreshes `worker-configuration.d.ts` after a config change.
