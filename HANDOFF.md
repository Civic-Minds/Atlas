# Atlas Handoff — 2026-04-10 (Session 4)

## Current State

**Production (OCI — ubuntu@40.233.99.118):**
- `server/` v0.15.0 running via pm2 as `atlas-server` (PID 293151, 18 restarts this session)
- Redis running, 21 agencies polling every 30s
- ~60M+ vehicle_positions rows and growing
- `route_last_seen` table populated and maintained by position-worker
- `segment_metrics` and `stop_dwell_metrics` tables now exist (created this session)

**TTC schedule matching — working:**
- 4.3M stop_times imported and verified in static DB (feed version 0efcc23f)
- Time-based fallback matcher deployed — TTC now produces `delay_seconds`, 25+ segment metrics, and 4 dwell metrics per 30s poll cycle
- Delay values are agency-timezone-correct (fixed UTC bug this session)

## What Was Done This Session

1. **TTC GTFS import confirmed complete** — `tail -5 /tmp/ttc-import3.log` showed 4,293,356 stop_times written. Feed effective 2026-03-15 → 2026-05-02.

2. **Diagnosed trip ID mismatch** — TTC's GTFS-RT (`bustime.ttc.ca`, Clever Devices) uses internal operational IDs (e.g. `61418020`) that never match Toronto Open Data static GTFS trip IDs (`50089164`–`50226408`). Companion GTFS at bustime.ttc.ca/gtfs requires auth. No stripping/mapping possible.

3. **Time-based fallback matcher** (`server/src/intelligence/matcher.ts`, `server/src/storage/static-db.ts`) — When primary trip_id lookup returns 0 rows, groups unmatched vehicles by route_id, queries `getRouteScheduleAroundTime()` for trips active within ±1 hour (in agency local time), and picks the best match via `score = dist/300 + timeDiff/90`. Cached under the Clever Devices trip_id for the duration of the poll cycle.

4. **Fixed Date coercion bug** — BullMQ serialises `Date` objects to ISO strings through Redis. All `.getTime()` calls on `p.observedAt` and `lastState.observedAt` now coerce with `instanceof Date` guard.

5. **Fixed timezone bug in delay/fallback** — `obs.getHours()` (UTC) was used to compare against GTFS `arrival_time` (local agency time). Replaced with `localSecondsFromMidnight(date, agencyTimezone(agency.id))` using `Intl.DateTimeFormat`.

6. **Created missing DB tables** — `segment_metrics` and `stop_dwell_metrics` didn't exist on OCI. INSERT statements were silently failing. Created both with indexes.

7. **Disabled `ouija.service` systemd unit** — The legacy Ouija server (`/home/ubuntu/ouija-server-src/dist/server.js`) was launched at boot by this systemd unit, squatting on port 3001. Stopped and disabled permanently.

## Commits This Session

- `f212d30` — Fix TTC schedule matching: time-based fallback for GTFS-RT/static trip ID mismatch

## AtlasLog Entry (pending Notion sync)

- **Title**: TTC schedule matching + boot orphan fix
- **Date**: 2026-04-11
- **Summary**: Time-based fallback matcher for agencies with GTFS-RT/static trip ID mismatch (TTC Clever Devices IDs → Toronto Open Data IDs). Fixed timezone bug in delay calc (UTC vs local agency time), Date coercion crash from BullMQ/Redis JSON serialization, and created missing `segment_metrics`/`stop_dwell_metrics` tables. Disabled `ouija.service` systemd unit permanently. TTC now producing accurate `delay_seconds` (±~40s range), 25 segment metrics and 4 dwell metrics per 30s poll cycle.

## Pending / Next Steps

- **Import more agencies** — After TTC, next candidates: MBTA, SEPTA, OC Transpo (all currently polling but no static GTFS, so delay_seconds always null). Command from `/home/ubuntu/atlas-server/`:
  `nohup node scripts/import-gtfs.js <zip> <slug> <name> [label] > /tmp/import-<slug>.log 2>&1 &`
- **511 rate limiting** — SF Muni/AC Transit/VTA occasionally 429; already at limit with 3 agencies. Do not add BART/Caltrain/SamTrans without a second 511 key.
- **Redis upgrade** — BullMQ warns about Redis 6.0.16 (min 6.2.0 recommended). Not breaking.
- **rtcsnv + mdt 403s** — Las Vegas RTC and Miami-Dade both returning HTTP 403 from goswift.ly. May need API key refresh.
- **Fallback query performance** — Each unmatched route triggers a DB query (currently ~100ms each, 7 routes for TTC = ~700ms/cycle). Consider adding index on `(feed_version_id, gtfs_route_id, arrival_time)` in stop_times if it becomes a bottleneck. Test: `EXPLAIN ANALYZE` the `getRouteScheduleAroundTime` query.
- **TTC fallback accuracy** — Fallback matches by nearest trip spatially+temporally. Works well during service hours. Accuracy degrades for routes with multiple closely-spaced trips (high-frequency periods). The `delay_delta_seconds` in segment_metrics is reliable; `delay_seconds` on individual positions has ±5min noise.

## Key Paths

- **OCI server**: `/home/ubuntu/atlas-server/`
- **SSH**: `ssh -i ~/.ssh/oracle_key ubuntu@40.233.99.118`
- **DB (realtime)**: `postgresql://ubuntu:ouija@localhost:5432/realtime`
- **DB (static)**: `postgresql://ubuntu:ouija@localhost:5432/static`
- **Server port**: 3001

## OCI Connection Note

SSH is intermittently flaky — long-running commands sometimes drop the TCP connection. Workaround: use `nohup ... &` for anything that takes >5 seconds. Short commands (echo, ps, tail) always work. Rsync occasionally needs a retry. **Always run imports with nohup, not as foreground SSH commands.**

## Schema Changes This Session (on OCI)

```sql
-- realtime DB
CREATE TABLE IF NOT EXISTS segment_metrics (
  id              BIGSERIAL PRIMARY KEY,
  agency_id       TEXT NOT NULL,
  trip_id         TEXT,
  route_id        TEXT,
  from_stop_id    TEXT,
  to_stop_id      TEXT,
  observed_seconds   INTEGER,
  scheduled_seconds  INTEGER,
  delay_delta_seconds INTEGER,
  observed_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_sm_agency_observed ON segment_metrics (agency_id, observed_at DESC);

CREATE TABLE IF NOT EXISTS stop_dwell_metrics (
  id            BIGSERIAL PRIMARY KEY,
  agency_id     TEXT NOT NULL,
  trip_id       TEXT,
  route_id      TEXT,
  stop_id       TEXT,
  dwell_seconds INTEGER,
  observed_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_sdm_agency_observed ON stop_dwell_metrics (agency_id, observed_at DESC);

-- systemd (not SQL)
-- sudo systemctl stop ouija.service && sudo systemctl disable ouija.service
```
