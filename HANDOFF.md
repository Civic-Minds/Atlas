# Atlas Handoff — 2026-04-14 (Session 5)

## Current State

**Local lab mode (switched from OCI — OCI was unresponsive):**
- `server/` running locally via `node dist/server.js` (PID 86813, started this session)
- `DATABASE_URL` points to `postgresql://localhost/atlas_lab` (~14M vehicle_positions rows)
- Redis running locally on port 6379
- Agencies polling every 30s — confirmed working (Halifax, others initializing)
- Notion sync disabled (no `NOTION_TOKEN` in lab .env — expected)

**Known active issues:**
- `mdt` 403 from goswift.ly — pre-existing, Swiftly key may need refresh
- Shape column error in matcher — pre-existing, unrelated to this session's fix
- `rtcsnv` may also be 403 (same Swiftly key)

## Critical Workflow Note

**Always SSH into OCI first.** The real server is on OCI — `ssh -i ~/.ssh/oracle_key ubuntu@40.233.99.118`. Local files, local `.env`, and local process lists do not reflect production state. Run `pm2 status` on OCI before diagnosing anything. Deploy fixes by rsyncing compiled `dist/` files (TypeScript is not installed on OCI — compile locally first).

## What Was Done This Session

1. **Diagnosed April 1 crash** — Server had been down since 2026-04-01T03:39:19Z. All agencies crashed with "bind message supplies X parameters, but prepared statement requires Y". Root cause: the compiled `dist/` at that time used 13 columns per row in `insertVehiclePositions`, but 3 columns had been added to the schema (`is_detour`, `dist_from_shape`, `match_confidence`) without a rebuild. Concurrent BullMQ workers sent batches with different row counts, and Postgres's unnamed prepared statement got overwritten mid-pipeline.

2. **Confirmed dist was already rebuilt** — `dist/` was last compiled 2026-04-10/11, now uses 16 columns matching the schema. No code changes needed.

3. **Switched to local Postgres** — `.env` already pointed to `atlas_lab` on localhost (OCI was listed as unresponsive in the env file). Local Postgres confirmed running with 13.9M rows.

4. **Started server** — `node dist/server.js` launched, polling confirmed active within first poll cycle.

## Previous Session (2026-04-10, Session 4)

- TTC time-based fallback matcher deployed (Clever Devices trip IDs → Open Data static GTFS)
- Fixed timezone bug (UTC vs local agency time in delay calc)
- Fixed Date coercion crash from BullMQ/Redis JSON serialization
- Created `segment_metrics` and `stop_dwell_metrics` tables on OCI
- Disabled `ouija.service` systemd unit (was squatting on port 3001 at boot)
- Commit: `f212d30`

## Pending / Next Steps

- **Shape column error** — Matcher throws `errorMissingColumn` referencing `t.shape_id` in a static DB query. Needs investigation (`server/src/intelligence/matcher.ts` or `static-db.ts`).
- **OCI status** — OCI was unresponsive as of last .env update. Verify whether it's back up before next production session. SSH: `ssh -i ~/.ssh/oracle_key ubuntu@40.233.99.118`
- **Import more agencies** — MBTA, SEPTA, OC Transpo polling but no static GTFS (delay_seconds always null).
- **511 rate limiting** — SF Muni/AC Transit/VTA occasionally 429. Do not add BART/Caltrain/SamTrans without a second 511 key.
- **rtcsnv + mdt 403s** — Las Vegas RTC and Miami-Dade returning HTTP 403 from goswift.ly. May need API key refresh.
- **Redis upgrade** — BullMQ warns about Redis 6.0.16 (min 6.2.0 recommended). Not breaking.
- **Fallback query performance** — Each unmatched route triggers a DB query (~100ms each, 7 routes for TTC = ~700ms/cycle). Consider index on `(feed_version_id, gtfs_route_id, arrival_time)` in stop_times if it becomes a bottleneck.

## Key Paths

- **Local server**: `/Users/ryan/Desktop/Mag/Tools/Transit/Atlas/server/`
- **Local DB**: `postgresql://localhost/atlas_lab` (realtime), `postgresql://localhost/atlas_static` (static)
- **OCI server**: `/home/ubuntu/atlas-server/`
- **SSH**: `ssh -i ~/.ssh/oracle_key ubuntu@40.233.99.118`
- **OCI DB (realtime)**: `postgresql://ubuntu:ouija@localhost:5432/realtime`
- **OCI DB (static)**: `postgresql://ubuntu:ouija@localhost:5432/static`
- **Server port**: 3001

## OCI Connection Note

SSH is intermittently flaky — long-running commands sometimes drop the TCP connection. Workaround: use `nohup ... &` for anything that takes >5 seconds. **Always run imports with nohup, not as foreground SSH commands.**
