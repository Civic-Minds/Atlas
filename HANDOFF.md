# Atlas Handoff — 2026-05-12 (Session 11)

## Current State

**This is the Reboot.** The old prototype (v0.15 era) is archived in `/v0`. The current codebase is a clean rebuild with a new DB schema and a map-first, mini-app architecture.

**OCI production server is live:**
- Server running at `ubuntu@40.233.99.118` via PM2 (`atlas-server`)
- Static DB on OCI: new schema — `agency_accounts`, `feed_versions`, `gtfs_agencies`, `routes`, `route_shapes`, `route_frequency_results`, etc.
- Realtime DB no longer used (new architecture is static-analysis-first)
- Port 3001 is firewalled externally — always access via SSH tunnel for local dev
- **PM2 log rotation installed**: `pm2-logrotate` at 20MB cap, 3 rotations, compressed

**SSH tunnel required for local dev:**
```bash
npm run tunnel   # opens ssh -L 3001:localhost:3001 -N ubuntu@40.233.99.118
```
Vite proxy points to `localhost:3001` — tunnel must be running for the dev server to hit the API.

**IMPORTANT — server build step:**
Server source is `server/src/server.ts`. Compile and deploy:
```bash
cd server && npx tsc && cd ..
rsync -av -e "ssh -i ~/.ssh/oracle_key" server/dist/ ubuntu@40.233.99.118:/home/ubuntu/atlas-server/dist/
ssh -i ~/.ssh/oracle_key ubuntu@40.233.99.118 "pm2 restart atlas-server"
```
Server tsconfig outputs CommonJS to `server/dist/`. DO NOT change `module` to ESNext — OCI's PM2 invocation doesn't have `"type": "module"` in the server's package.json.

**Current version: v0.21.0**

---

## Architecture (Reboot)

### Frontend (`src/`)
- **`main.tsx`** — BrowserRouter root
- **`App.tsx`** — layout shell: header (logo + mini-app nav + agency switcher) + `<Outlet />`
- **`apps/Interval.tsx`** — Mini-App 01: frequency map. Route shapes colored by headway tier.
- **`store/atlas.ts`** — Zustand store: `agencies`, `selectedAgency`, `center`
- Routes: `/` → redirect → `/interval`. `/live` and `/reliability` are nav stubs (coming soon).

### Backend (`server/src/server.ts`)
Minimal Express server, two endpoints:
- `GET /api/agencies` — reads `agency_accounts`
- `GET /api/shapes/:agency` — route shapes + frequency tier + route names (joins `routes`, `route_frequency_results`)
- `GET /api/health`

### Static DB (OCI)
New schema. Key tables:
| Table | Contents |
|---|---|
| `agency_accounts` | slug, display_name, country_code, region |
| `feed_versions` | id, gtfs_agency_id, is_current |
| `gtfs_agencies` | id, agency_slug |
| `routes` | gtfs_route_id, route_short_name, route_long_name, route_type, route_color |
| `route_shapes` | gtfs_route_id, direction_id, geom (PostGIS) |
| `route_frequency_results` | gtfs_route_id, direction_id, day_type, tier, base_headway |
| `stops`, `stop_times`, `trips`, `calendar_services`, etc. | Standard GTFS |

**4 agencies imported**: Halifax Transit, NYC MTA Subway, Spokane Transit Authority, Toronto Transit Commission.  
**5,901 route shapes** and **5,901 frequency results** in DB.

---

## What Was Done This Session (Session 11 — 2026-05-12)

### Infrastructure
1. **OCI disk was 100% full** — Postgres could not start. Fixed by vacuuming systemd journal (freed 1.1GB), truncating PM2 out-log, removing old GTFS zips (`toronto.zip`, `ttc-gtfs.zip`) and stale `dist/` folder from home.
2. **PM2 log rotation** — Installed `pm2-logrotate`: 20MB max, 3 retained, compressed. Will prevent recurrence.
3. **New server tsconfig** — Added `server/tsconfig.json` (CommonJS, rootDir src, outDir dist). Server now compiles cleanly.

### Frontend
4. **React Router wired up** — `main.tsx` wraps in `BrowserRouter`. `App.tsx` is now the layout shell with an `<Outlet />`. Mini-app nav in the header has `NavLink` for live apps and greyed-out spans for coming-soon ones.
5. **Zustand store** (`src/store/atlas.ts`) — agencies, selectedAgency, and map center. `selectAgency` updates center from the `AGENCY_CENTERS` lookup. Header fetches agencies once and stores them here; Interval reads from the store.
6. **Interval extracted** to `src/apps/Interval.tsx` — App.tsx no longer contains any map logic.
7. **`ChangeView` bug fixed** — was calling `map.setView()` on every render; now `useEffect` fires only when center lat/lng change.
8. **Hardcoded localhost URLs removed** — all fetches now use `/api/...` (Vite proxy handles it).
9. **Loading overlay** — spinner + label shown while shapes are fetching.
10. **Route names in tooltip** — shapes endpoint LEFT JOINs `routes`; tooltip now shows `routeShortName` + `routeLongName` instead of raw `gtfs_route_id`.

---

## Pending / Next Steps

- **`/live` mini-app** — live vehicle positions on the map. Needs a poller (or manual data load) and a `GET /api/live/:agency` endpoint. The old realtime DB / GTFS-RT polling infrastructure is archived in `v0/`.
- **`/reliability` mini-app** — schedule adherence visualization. Needs matched trip data (delay_seconds per stop/trip).
- **More agencies** — import script at `server/scripts/` (needs to be re-created for new schema). MBTA, TriMet, OC Transpo are candidates.
- **A1 ARM migration** — OCI ca-toronto-1 has 4 OCPUs + 24GB ARM free tier (0 used). Would give much more disk headroom. Current 45GB boot volume is the bottleneck.
- **Disk health** — after this session's cleanup the disk is at ~97% (1.4GB free). The 111MB `ouija-server-src` folder in `/home/ubuntu` is old and can be deleted if not needed. Consider the ARM migration to get proper headroom.

## Key Paths

| Resource | Path |
|---|---|
| Frontend | `/Users/ryan/Desktop/Mag/Tools/Transit/Atlas/src/` |
| Server source | `/Users/ryan/Desktop/Mag/Tools/Transit/Atlas/server/src/` |
| OCI server | `/home/ubuntu/atlas-server/` |
| SSH | `ssh -i ~/.ssh/oracle_key ubuntu@40.233.99.118` |
| OCI static DB | `PGPASSWORD=ouija psql -h 127.0.0.1 -U ubuntu -d static` |
| Server port | 3001 (firewalled externally — use tunnel) |
