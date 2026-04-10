# Atlas Handoff — 2026-04-10 (Session 3)

## Current State

**Production (OCI — ubuntu@40.233.99.118):**
- `server/` v0.15.0 running via pm2 as `atlas-server` (PID 278997+, 8 restarts this session)
- Redis running, 21 agencies polling every 30s
- ~60M+ vehicle_positions rows and growing
- `route_last_seen` table now populated and maintained by position-worker

**TTC GTFS import — in progress:**
- Script running with nohup (PID 278997 at session start)
- Main data committed: 230 routes, 9,393 stops, 135,534 trips, 1,091 analysis results
- stop_times writing ~10k rows every 2 seconds (was at 180k when session ended)
- Log at `/tmp/ttc-import3.log` on OCI
- To check: `ssh -i ~/.ssh/oracle_key ubuntu@40.233.99.118 "tail -5 /tmp/ttc-import3.log"`
- Once done: `delay_seconds` should appear on TTC vehicles in pm2 logs

## What Was Done This Session

1. **Silent Routes tab in Pulse** — New third tab surfaces routes dark for 15+ minutes that had vehicles in the last 24h. Severity colour-coding (amber/orange/red) based on minutes since last seen. Auto-refreshes every 60s. Drill-through to 7-day heatmap.

2. **`route_last_seen` summary table** — Created in realtime DB. Position-worker upserts `(agency_id, route_id, last_seen)` after each job with `GREATEST()` conflict resolution. Replaced a naive DISTINCT ON query that took **3m 44s** on 60M rows. New endpoint is sub-millisecond.

3. **Network Overview auto-refresh** — Refreshes every 30s without clearing the table (no flicker).

4. **`circuity_index` column migration** — Added missing column to `route_frequency_results` in static DB. Was blocking all GTFS imports at the analysis-write step with a silent rollback.

5. **Boot-time orphan server killed** — Old `node dist/server.js` (PID 921, started at boot) was squatting on port 3001. pm2 instance was binding to nothing — HTTP dead, BullMQ worker running normally. Killed orphan; pm2 now owns port 3001.

6. **TTC import fixed and relaunched (run 3)** — Run 1 died from SSH kill. Run 2 died from missing `circuity_index`. Run 3 running with nohup, main data committed.

## Commits This Session

- `bed78c4` — Add Silent Routes tab to Pulse, route_last_seen summary table, Network Overview auto-refresh

## Pending / Next Steps

- **Wait for TTC stop_times to finish** — check `/tmp/ttc-import3.log` for `"stop_times written"` completion message. Then confirm `delay_seconds` appears on TTC vehicles in pm2 logs.
- **Fix boot-time orphan permanently** — that `node dist/server.js` at PID 921 started at boot. Find and disable whatever launches it (probably a systemd service or `/etc/rc.local`). Otherwise it'll come back after a reboot.
  - Check: `systemctl list-units --type=service | grep node` or `cat /etc/rc.local`
- **Import more agencies** — after TTC: MBTA, SEPTA, OC Transpo. Command from `/home/ubuntu/atlas-server/`:
  `node scripts/import-gtfs.js <zip> <slug> <name> [label]`
- **511 rate limiting** — SF Muni/AC Transit/VTA occasionally 429; already at limit with 3 agencies. Do not add BART/Caltrain/SamTrans without a second 511 key.
- **Redis upgrade** — BullMQ warns about Redis 6.0.16 (min 6.2.0 recommended). Not breaking.
- **rtcsnv + mdt 403s** — Las Vegas RTC and Miami-Dade both returning HTTP 403 from goswift.ly. May need API key refresh.

## Key Paths

- **OCI server**: `/home/ubuntu/atlas-server/`
- **SSH**: `ssh -i ~/.ssh/oracle_key ubuntu@40.233.99.118`
- **TTC import log**: `/tmp/ttc-import3.log` on OCI
- **DB (realtime)**: `postgresql://ubuntu:ouija@localhost:5432/realtime`
- **DB (static)**: `postgresql://ubuntu:ouija@localhost:5432/static`
- **Server port**: 3001 (confirmed via `ss -tlnp`)

## OCI Connection Note

SSH is intermittently flaky — long-running commands sometimes drop the TCP connection. Workaround: use `nohup ... &` for anything that takes >5 seconds. Short commands (echo, ps, tail) always work. Rsync occasionally needs a retry. **Always run imports with nohup, not as foreground SSH commands.**

## Schema Changes This Session (on OCI)

```sql
-- realtime DB
CREATE TABLE route_last_seen (
  agency_id TEXT NOT NULL,
  route_id  TEXT NOT NULL,
  last_seen TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (agency_id, route_id)
);
CREATE INDEX idx_rls_agency_last_seen ON route_last_seen (agency_id, last_seen DESC);

-- static DB
ALTER TABLE route_frequency_results ADD COLUMN IF NOT EXISTS circuity_index numeric(8,4);
```
