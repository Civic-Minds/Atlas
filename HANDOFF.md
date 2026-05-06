# Atlas Handoff — 2026-05-02 (Session 10)

## Current State

**OCI production server is live and healthy:**
- Server running at `ubuntu@40.233.99.118` via PM2 (`atlas-server`)
- Both DBs on OCI: `realtime` (vehicle positions) and `static` (GTFS — routes, stops, stop_times, trips, shapes)
- Local Postgres is decommissioned — do not use it
- Port 3001 is **firewalled externally** — always access via SSH tunnel for local dev
- **Redis is permanently disabled** — stopped, disabled from autostart, dump.rdb deleted. Do not attempt to restart it.
- **BullMQ/position-worker removed** — poller writes directly to Postgres; no queue layer.
- **`vehicle_positions_agency_time_idx`** — Composite index on `(agency_id, observed_at DESC)` built this session.

**SSH tunnel required for local dev:**
```bash
npm run tunnel   # opens ssh -L 3001:localhost:3001 -N ubuntu@40.233.99.118
```
Vite proxy points to `localhost:3001` — tunnel must be running for the dev server to hit the API. Vite may land on `5174` instead of `5173` if another project is already running on `5173`.

**IMPORTANT — server build step:**
`npm run build` at root only builds the Vite frontend. Server changes require:
```bash
cd server && npm run build && cd ..
rsync -av -e "ssh -i ~/.ssh/oracle_key" server/dist/ ubuntu@40.233.99.118:/home/ubuntu/atlas-server/dist/
ssh -i ~/.ssh/oracle_key ubuntu@40.233.99.118 "pm2 restart atlas-server"
```

**Current version: v0.20.0+**

**PM2 startup command (current):**
```bash
pm2 delete atlas-server 2>/dev/null
pm2 start /home/ubuntu/atlas-server/dist/server.js \
  --name atlas-server \
  --cwd /home/ubuntu/atlas-server \
  --node-args='--max-old-space-size=700' \
  --max-memory-restart 500M \
  --cron-restart='0 4 * * *'
pm2 save
```
`--cwd` is critical — without it dotenv loads from the wrong directory and all API keys are undefined.

## What Was Done This Session (Session 10 — 2026-05-02)

### Matching Pipeline — Root Bugs Fixed (0% → real match rates)

This session found and fixed three root-cause bugs that had prevented ANY agency from reliably matching positions for the entire lifetime of Atlas:

1. **`Promise.race` static pool connection leak** — `Promise.race` returned a timeout sentinel but the underlying DB query continued running, holding the pool connection for 82–131s. With `max: 3` and 18 agencies cold-starting simultaneously, the static pool was permanently exhausted, causing all agencies to hit `active:2` backpressure permanently. Fix: replaced `Promise.race` with `client.connect()` + `SET statement_timeout = N` in both `matcher.ts` (LRU fill, 20s) and `static-db.ts` (`getRouteScheduleAroundTime`, 7s). Postgres now actually cancels queries and releases connections after the deadline.

2. **LRU cache cleared on every agency call** — `scheduleCache` was keyed by `tripId` alone with a single module-level `lastFeedVersion`. Since each of the 18 agencies has a different `versionId`, every agency call cleared the entire shared cache. No agency could accumulate cached trips. Fix: re-keyed cache as `${versionId}:${tripId}` and removed the `lastFeedVersion` clear.

3. **Zombie queries from old `Promise.race` restarts** — Every `pm2 restart` left in-flight LRU fill queries running in Postgres indefinitely. After several restarts, 24+ zombie queries held all static pool slots. Fix: killed all with `pg_terminate_backend`; new `statement_timeout` prevents future accumulation.

**Result**: All 18+ agencies now persist positions every 30s with no persistent backpressure. Halifax shows real operational delays (+4 min late, 6 min early) instead of −90,000s.

4. **`vehicle_positions_agency_time_idx`** — `(agency_id, observed_at DESC)` added CONCURRENTLY. Benchmark queries and stop-adherence queries now use index instead of full scan.

5. **Halifax service-day rollover** — GTFS extended times (>24:00) caused `delay ≈ −86400s` for overnight trips. Fix: if `rawDelay < −43200`, add 86400 to observedSeconds.

6. **Halifax timezone** — Added `timezone: 'America/Halifax'` to agency config.

7. **`ABS(delay_seconds) < 3600` filter in stop-adherence** — Excludes stale-trip-ID readings (STA showing +3h delays).

8. **Benchmark window 24h → 6h, interval 15 → 30 min** — Was timing out at 300s on full scan; now fast with index.

9. **CLAUDE.md build docs** — Added explicit two-step server build: `cd server && npm run build && cd ..`. Root `npm run build` only builds Vite frontend.

---

## What Was Done — Session 9 (2026-04-30)

### Infrastructure — Weekly OOM / SSH Outage (Root Cause Fixed)

The server was going unreachable roughly once a week. Root cause: 1GB RAM exhausted by Postgres (~300MB) + Redis loading a 410MB RDB dump + Node.js heap → kernel OOM killer fires → sshd killed → SSH unreachable for hours.

1. **Redis permanently disabled** — `systemctl stop redis && systemctl disable redis && rm -f /var/lib/redis/dump.rdb`. Freed 300–500MB.
2. **BullMQ removed from ingestion path** — `poller.ts` no longer enqueues to Redis. `matchPositions` + DB writes now happen directly as a fire-and-forget async op with `MAX_CONCURRENT_MATCH = 2`. `position-worker.ts` / `position-queue.ts` still exist as dead code but are never imported.
3. **PM2 `--cwd` flag added** — Previous PM2 command lacked `--cwd /home/ubuntu/atlas-server`, so `dotenv/config` loaded from the wrong directory. All env vars (API keys, DB URLs) were `undefined`.
4. **PM2 memory guard + cron restart** — Added `--max-memory-restart 500M` and `--cron-restart='0 4 * * *'`.

### Matcher Hang — Static DB Queries Blocking Indefinitely

After removing Redis, discovered the matcher was permanently occupying all match slots due to slow Postgres queries on the 1GB machine:

5. **25s fallback budget** — Fallback loop in `matcher.ts` now tracks a total time budget; breaks out if exceeded rather than running 100+ per-route queries for agencies like TTC.
6. **7s per-query timeout** — `getRouteScheduleAroundTime` in `static-db.ts` now wrapped in `Promise.race` with a 7s timeout. TTC route 505 was taking ~10s per query; this prevents infinite block.
7. **Static pool capped at 3 connections** — `max: 3, connectionTimeoutMillis: 180000` prevents 18 agencies from simultaneously hammering the static DB during cold start. Queue drains within ~3 minutes at startup.
8. **`MAX_CONCURRENT_MATCH` 4 → 2** — Reduces DB pressure.
9. **`MAX_CACHE_SIZE` 500 → 3000** — With 18+ agencies × ~100 trip IDs, the old 500-entry LRU was thrashing and triggering repeated 52–82s cold fills. 3000 entries comfortably holds all active trips. Takes effect at next 4am cron restart.
10. **Matcher debug logs → structured logger** — Replaced `console.log` noise in matcher with `log.info/warn`, making PM2 out.log usable.

### Result
19/20 agencies persisting, ~100MB Node.js heap, 370MB RAM available. No OOM risk.

---

## What Was Done — Session 8 (2026-04-25)

### Matching Pipeline
1. **Halifax stop_times backfilled** — Root cause of 0% match rate: Halifax was imported March 30 before stop_times streaming existed in the importer. Re-imported 2026-04-20 via `https://gtfs.halifax.ca/Static/google_transit.zip`. 327,575 stop_times now in DB (feed version `0cb50b15`). RT trip IDs (4306xxx) differ from static (4301xxx) but route IDs match — time-based spatial fallback handles matching.
2. **Importer verification guard** — Added post-write `COUNT(*) > 0` check on stop_times after import. Now throws explicitly if stop_times produce 0 rows instead of silently creating a broken feed version.
3. **`tsconfig.scripts.json`** — New separate tsconfig for compiling `server/scripts/` (`rootDir: "."`, `outDir: "./dist-scripts"`). Compile with `npx tsc -p server/tsconfig.scripts.json`, rsync `dist-scripts/` to OCI. Used to run `import-gtfs.js` and `backfill-stop-times.js` directly on OCI.
4. **`backfill-stop-times.ts`** — New one-off script for resuming a partial stop_times write. Safe to re-run (uses `ON CONFLICT DO NOTHING`). Usage: `STATIC_DATABASE_URL=... node dist-scripts/scripts/backfill-stop-times.js <zip> <feed-version-id>`.

### Server
5. **`user_tenants` table created** on OCI realtime DB — was missing, causing every API request to hang (middleware threw without sending a response). Schema: `firebase_uid TEXT PK, agency_id TEXT, role TEXT DEFAULT 'viewer'`. Empty table = global admin access for all authenticated users.
6. **CORS fixed** — Hardcoded to `localhost:5173`; changed to allow any `localhost:*` port so Vite's auto-increment port doesn't break dev.
7. **`matching-stats` parallelized** — `calculateAgencyHealth` was called sequentially per agency in a `for` loop. Changed to `Promise.all` — all agencies now run concurrently, cutting response time from 15s+ to ~2-3s.
8. **`vehicle_positions` index building** — `CREATE INDEX CONCURRENTLY idx_vp_agency_observed ON vehicle_positions (agency_id, observed_at DESC)` started 2026-04-21. May still be building. Check with `SELECT phase FROM pg_stat_progress_create_index;` on the realtime DB. Once done, all health/matching queries will be fast.

### Frontend
9. **CommandCenter agencies load first** — Was using `Promise.all` for all 4 data calls, blocking render until slowest resolved. Now agencies load independently and render immediately; stats/diagnostics fill in after.
10. **`fetchWithAuth` timeout** — Added 10s `AbortController` timeout to all API calls. Prevents any single slow endpoint from hanging the page indefinitely.

### Docs
11. **`docs/AGENCIES.md` rewritten** — Now reflects three-tier beta structure: Tier 1 (full-network + static: Halifax, STA), Tier 2 (partial + static: TTC), Tier 3 (data collection only, no static: everyone else).

## What Was Done — Session 7 (2026-04-21)

### Matching Pipeline
1. **Halifax stop_times backfilled** — Root cause of 0% match rate: Halifax was imported March 30 before stop_times streaming existed in the importer. Re-imported 2026-04-20 via `https://gtfs.halifax.ca/Static/google_transit.zip`. 327,575 stop_times now in DB (feed version `0cb50b15`). RT trip IDs (4306xxx) differ from static (4301xxx) but route IDs match — time-based spatial fallback handles matching.
2. **Importer verification guard** — Added post-write `COUNT(*) > 0` check on stop_times after import. Now throws explicitly if stop_times produce 0 rows instead of silently creating a broken feed version.
3. **`tsconfig.scripts.json`** — New separate tsconfig for compiling `server/scripts/` (`rootDir: "."`, `outDir: "./dist-scripts"`). Compile with `npx tsc -p server/tsconfig.scripts.json`, rsync `dist-scripts/` to OCI. Used to run `import-gtfs.js` and `backfill-stop-times.js` directly on OCI.
4. **`backfill-stop-times.ts`** — New one-off script for resuming a partial stop_times write. Safe to re-run (uses `ON CONFLICT DO NOTHING`). Usage: `STATIC_DATABASE_URL=... node dist-scripts/scripts/backfill-stop-times.js <zip> <feed-version-id>`.

### Server
5. **`user_tenants` table created** on OCI realtime DB — was missing, causing every API request to hang silently. Schema: `firebase_uid TEXT PK, agency_id TEXT, role TEXT DEFAULT 'viewer'`. Empty table = global admin for all authenticated users.
6. **CORS fixed** — Was hardcoded to `localhost:5173`; now allows any `localhost:*` port.
7. **`matching-stats` parallelized** — `calculateAgencyHealth` was sequential per agency in a `for` loop. Changed to `Promise.all`.
8. **`vehicle_positions` indexes created** — `idx_vp_agency_observed (agency_id, observed_at DESC)` + 6 others already exist. All health/matching queries now use indexes instead of scanning 60M+ rows.

### Frontend
9. **CommandCenter agencies load first** — Decoupled from `Promise.all`; agencies render immediately, stats fill in after.
10. **`fetchWithAuth` 10s timeout** — Added `AbortController` timeout so a slow endpoint can't hang the page.

### Docs
11. **`docs/AGENCIES.md` rewritten** — Three-tier beta structure: Tier 1 (full-network + static: Halifax, STA), Tier 2 (partial + static: TTC), Tier 3 (data collection only: all others).

## What Was Done — Session 8 (2026-04-25)

### Server Stability
1. **OOM crash root cause identified** — Server was crashing every ~3-4 hours (39 restarts over 5 days, <20% uptime). Cause: Node.js default heap ~512MB, high allocation rate from polling 20 agencies every 30s with no DB indexes meant every `calculateAgencyHealth` query scanned 60M rows.
2. **Heap limit raised** — PM2 now starts with `--max-old-space-size=700`. Command: `pm2 delete atlas-server && pm2 start /home/ubuntu/atlas-server/dist/server.js --name atlas-server --node-args='--max-old-space-size=700' && pm2 save`.
3. **`vehicle_positions` index built** — `CREATE INDEX CONCURRENTLY idx_vp_agency_observed ON vehicle_positions (agency_id, observed_at DESC)` completed. All per-agency time-window queries now fast.

### MCP
4. **Notion MCP added** — `claude mcp add --transport http --scope user notion https://mcp.notion.com/mcp`. Connected and authorized via OAuth. Restart Claude Code to load Notion tools in a new session.

## Previous Sessions

**Session 6 (2026-04-19):**
- DEV auth race condition fixed
- Agency switcher fixed (catch block was setting viewer role)
- CommandCenter infinite loading fixed
- Simulate module wired to cloud GTFS
- CI build fixed (v0.19.1)

**Session 5 (2026-04-14):**
- Diagnosed April 1 crash (column mismatch in vehicle positions insert)

**Session 4 (2026-04-10):**
- TTC time-based fallback matcher deployed
- Fixed timezone bug and Date coercion crash
- Created `segment_metrics` and `stop_dwell_metrics` tables on OCI

## Pending / Next Steps

- **Stop-by-stop schedule adherence** — Most impactful missing backend feature for Performance. No implementation yet. This was the original goal of Session 9 before infrastructure work took over.
- **Halifax match rate verification** — stop_times populated since Session 7; time-based fallback should be resolving RT trips. Verify via match-diagnostics endpoint.
- **A1 ARM migration** — OCI ca-toronto-1 has 4 OCPUs + 24GB ARM free tier available (confirmed 0 used). Would eliminate OOM risk permanently and make static DB queries instant (Postgres fits entire stop_times table in RAM). The current fixes are sufficient but the 1GB machine is genuinely at the edge.
- **Import more agencies** — MBTA, SEPTA, OC Transpo polling but no static GTFS. Import script ready: `server/scripts/import-gtfs.ts`.
- **MetroTransit dead feed** — Persistent HTTP 404. Feed URL likely changed.
- **511 rate limiting** — SF Muni/AC Transit/VTA occasionally 429. Do not add BART/Caltrain/SamTrans without a second 511 key.
- **AtlasLog** — Backfill portfolio-worthy entries from Sessions 8–10 (see `ATLASLOG.md` for the bar). Candidates: Promise.race connection leak + LRU cache fix (Session 10), Redis/BullMQ removal + OOM root cause (Session 9). Stubs, config tweaks, and minor fixes do not belong.

## Key Paths

| Resource | Path |
|---|---|
| Frontend | `/Users/ryan/Desktop/Mag/Tools/Transit/Atlas/src/` |
| Server source | `/Users/ryan/Desktop/Mag/Tools/Transit/Atlas/server/src/` |
| OCI server | `/home/ubuntu/atlas-server/` |
| SSH | `ssh -i ~/.ssh/oracle_key ubuntu@40.233.99.118` |
| OCI realtime DB | `postgresql://ubuntu:ouija@localhost:5432/realtime` |
| OCI static DB | `postgresql://ubuntu:ouija@localhost:5432/static` |
| Server port | 3001 (firewalled externally — use tunnel) |
| Halifax static GTFS | `https://gtfs.halifax.ca/Static/google_transit.zip` |

## Deploy Workflow

```bash
# 1. Compile server
npx tsc -p server/tsconfig.json

# 2. Rsync to OCI
rsync -av -e "ssh -i ~/.ssh/oracle_key" server/dist/ ubuntu@40.233.99.118:/home/ubuntu/atlas-server/dist/

# 3. Restart
ssh -i ~/.ssh/oracle_key ubuntu@40.233.99.118 "pm2 restart atlas-server"
```

To compile and run scripts (import-gtfs, backfill-stop-times) on OCI:
```bash
npx tsc -p server/tsconfig.scripts.json
rsync -av -e "ssh -i ~/.ssh/oracle_key" server/dist-scripts/ ubuntu@40.233.99.118:/home/ubuntu/atlas-server/dist-scripts/
ssh -i ~/.ssh/oracle_key ubuntu@40.233.99.118 "STATIC_DATABASE_URL=postgresql://ubuntu:ouija@localhost:5432/static nohup node /home/ubuntu/atlas-server/dist-scripts/scripts/import-gtfs.js <zip> <slug> <name> > /tmp/import.log 2>&1 &"
```

Always compile locally — TypeScript is not installed on OCI.
