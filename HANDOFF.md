# Atlas Handoff — 2026-04-19 (Session 6)

## Current State

**OCI production server is live and healthy:**
- Server running at `ubuntu@40.233.99.118` via PM2 (`atlas-server`, PID ~692391)
- Both DBs on OCI: `realtime` (vehicle positions) and `static` (GTFS — routes, stops, stop_times, trips, shapes)
- Local Postgres is decommissioned — do not use it
- Port 3001 is **firewalled externally** — always access via SSH tunnel for local dev

**SSH tunnel required for local dev:**
```bash
npm run tunnel   # opens ssh -L 3001:localhost:3001 -N ubuntu@40.233.99.118
```
Vite proxy points to `localhost:3001` — tunnel must be running for the dev server to hit the API.

**Current version: v0.19.1**

## What Was Done This Session

### Frontend
1. **DEV auth race condition fixed** — All pages were loading blank because `isAuthenticated: true` but `user: null` in DEV mode caused `fetchWithAuth` to send no token → 401 everywhere. Fix: keep DEV bypass but start `role: null` (not `'admin'`); `isAdmin` is false until Firebase resolves. Data fetches gate on `user` being set.
2. **Agency switcher fixed** — Was appearing then vanishing because the `useAuthStore` catch block set `role: 'viewer'` on any `/api/me` failure, stripping admin status. Fallback now sets `role: 'admin'`.
3. **CommandCenter infinite loading fixed** — `loading` initialized to `true` but effect returned early when `user: null`. Now starts `false`, only activates when fetch begins. Also gates the whole fetch on `user` being set.
4. **Alerts page redirect removed** — Was silently redirecting to `/` when no agency selected. Now shows a helpful empty state.
5. **NetworkScreener wired to nav switcher** — Now reads `viewAsAgency` from `useViewAs`, auto-runs screener on change. Admin default is blank (no hardcoded agency).
6. **Simulate module wired to cloud GTFS** — Removed dependency on local GTFS uploads. `SimulatorContext` now fetches routes and stops from OCI static DB via two new server endpoints. Representative trip = longest stop-sequence trip for direction_id=0. Shape coords flipped from GeoJSON `[lon,lat]` to Leaflet `[lat,lon]`.
7. **CI build fixed (v0.19.1)** — 7 TypeScript errors resolved: duplicate `useViewAs` import, `CatalogRoute` imported from wrong module, missing `routeLongName` on `AnalysisResult`, missing scoring fields on `CatalogRoute`, missing lucide icon imports (`Bus`, `Database`, `Zap`).

### Server
- **`MAX_VEHICLE_CACHE` raised** from 2,000 → 10,000 (prevents constant eviction for large agencies like MTA)
- **Simulate endpoints added** to `import-routes.ts`:
  - `GET /api/import/agencies/:slug/simulate/routes` — route list for Simulator
  - `GET /api/import/agencies/:slug/simulate/route/:routeId` — full stop sequence + shape
- **Debug artifacts removed** — `/api/whoami` endpoint and `console.log('[ME]')` line

## Previous Sessions

**Session 5 (2026-04-14):**
- Diagnosed April 1 crash (column mismatch in vehicle positions insert)
- Confirmed dist was rebuilt; OCI server restarted

**Session 4 (2026-04-10):**
- TTC time-based fallback matcher deployed
- Fixed timezone bug and Date coercion crash
- Created `segment_metrics` and `stop_dwell_metrics` tables on OCI

## Pending / Next Steps

- **Stop-by-stop schedule adherence** — Most impactful missing backend feature for the Performance module. No implementation yet.
- **Predict module** — Needs a census data pipeline. Separate project, not started.
- **Audit/Verifier module** — Local GTFS upload still works but is hidden from the main nav. Decision pending: keep as power-user tool, repurpose, or remove.
- **Import more agencies** — MBTA, SEPTA, OC Transpo are polling but have no static GTFS (delay_seconds always null).
- **511 rate limiting** — SF Muni/AC Transit/VTA occasionally 429. Do not add BART/Caltrain/SamTrans without a second 511 key.
- **rtcsnv + mdt 403s** — Las Vegas RTC and Miami-Dade returning HTTP 403 from goswift.ly.
- **AtlasLog** — Notion MCP was unavailable during this session; log entries for this session still need to be added.

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

## Deploy Workflow

```bash
# 1. Compile server
npx tsc -p server/tsconfig.json

# 2. Rsync to OCI
rsync -av -e "ssh -i ~/.ssh/oracle_key" server/dist/ ubuntu@40.233.99.118:/home/ubuntu/atlas-server/dist/

# 3. Restart
ssh -i ~/.ssh/oracle_key ubuntu@40.233.99.118 "pm2 restart atlas-server"
```

Always compile locally — TypeScript is not installed on OCI.
