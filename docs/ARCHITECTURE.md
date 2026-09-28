# Atlas Architecture

## R2 Buckets

Three Cloudflare R2 buckets. Public access means the browser fetches directly; private means only Vercel API functions or the pipeline can read it.

### atlas (public)

Current static GTFS data served to the frontend.

- `atlas/{slug}.json` — route GeoJSON for each agency
- `atlas/{slug}-stops.json` — stops index
- `atlas/{slug}-corridors.json` — corridor overlap data
- `atlas/go-stops.json` — GO rail stops (separate extract)

Written by: `pipeline/refresh.ts`, `pipeline/process-gtfs.ts`
Read by: browser directly via `R2_PUBLIC_URL`

### atlas-archive (private)

Historical and reference data not needed at runtime.

- `gtfs/archive/{slug}/{feed-end-date}.zip` — raw GTFS zip snapshots, one per feed version
- `history/{slug}/latest.json` — most recent headway snapshot for diff detection
- `history/{slug}/{feed-end-date}.json` — versioned headway snapshots (pipeline diff-detection; not read by frontend)

Written by: `pipeline/refresh.ts` (both gtfs zips and history snapshots)
Read by: `pipeline/refresh.ts` only (reads `history/{slug}/latest.json` to detect week-to-week changes)

### atlas-live (private)

Private storage reserved for real-time GTFS-RT snapshots. The archive is currently
paused and no new snapshots are being written. The existing objects are retained,
but the hosted snapshot/replay API is not present in the current checkout.

- `positions/{slug}/{YYYY-MM-DD}/{unix-seconds}.json` — vehicle-position samples for the five archive agencies, every minute
- `{slug}/{YYYY-MM-DD}/{unix-seconds}.json` — trip-update delay summaries for the five archive agencies, every 5 minutes
- The archived formats use the `atlas.live.v1` normalized envelope where snapshots exist.

Previously written by five small Cloudflare Workers sharing `workers/gtfs-rt-archiver/src/index.ts`.
`/api/history-adherence` can read the archive; the former live snapshot/replay routes
are not currently in this checkout.

30-day retention enforced by the bucket's R2 lifecycle rules.


## Live Polling: current and planned surfaces

### 1. Live UI and feed configuration (currently gated off)

The Live Vehicles UI and agency feed configuration remain in the repository, but the
feature is disabled unless `VITE_LIVE_ENABLED=true`. The former `/api/live-vehicles`
polling route and related live endpoints are not present in the current checkout.
Route configuration and feed credentials remain in `shared/livePollingConfig.ts`.

### 2. Background Worker archiver (paused)

Hardcoded feed lists live in `shared/liveArchiveFeeds.ts` (not `LIVE_POLLING_ROUTES`).
The five legacy archive Workers are deployed without active Cron Triggers, so they no
longer write new snapshots to `atlas-live`. They covered trip updates and vehicle
positions for **ttc, burlington, hamilton, halifax, and stm**. Any replacement should
be designed after local validation and a new canary contract.

### 3. Future provider consumers (snapshot / replay)

Bridge and verification tools will need a restored snapshot/replay provider before
they can consume `atlas-live` through a stable API.
History UI also uses schedule-period headway diffs from `atlas-archive` (pipeline) — a different
meaning of “history” than RT delay archives.


## Data Flow: Weekly Refresh

```
feedUrl (agency's GTFS zip)
  -> pipeline/refresh.ts
    -> parse GTFS
    -> write atlas/{slug}.json          (public, replaces previous)
    -> write atlas/{slug}-stops.json    (public)
    -> write atlas/{slug}-corridors.json (public)
    -> write gtfs/archive/{slug}/*.zip  (atlas-archive, append)
    -> compare vs history/{slug}/latest.json (atlas-archive)
    -> if changed: write history/{slug}/{period}.json + latest.json (atlas-archive)
```

Triggered by: GitHub Actions weekly cron (Monday), or `npm run refresh`


## Vercel API Routes

`/api/*` routes are Vercel serverless functions — they do NOT run in the Vite dev server.
Local: `npm run dev:api` (custom tsx server; not full parity with every Node-style handler).
Production-like: `vercel dev` if preferred.

- `/api/history-adherence` — aggregates trip-delay archives from `atlas-live` into hourly buckets


## Environment Variables

| Variable | Used by | Purpose |
|---|---|---|
| R2_ACCOUNT_ID | pipeline, api/* | Cloudflare account |
| R2_ACCESS_KEY_ID | pipeline, api/* | R2 credentials |
| R2_SECRET_ACCESS_KEY | pipeline, api/* | R2 credentials |
| R2_BUCKET_NAME | pipeline | `atlas` bucket name |
| R2_PUBLIC_URL | frontend, pipeline, api/* | Public base URL for atlas bucket |
| R2_ARCHIVE_BUCKET_NAME | pipeline | `atlas-archive` bucket name |
| R2_LIVE_BUCKET_NAME | api/* live archive routes | `atlas-live` bucket name |
| TRANSLINK_API_KEY | api/live-* (TransLink) | TransLink GTFS-RT |
| STM_API_KEY | api/live-*; Worker archiver | STM GTFS-RT |
| MUNI_511_API_KEY | api/live-* (sfmta) | 511 SF Bay (Muni Metro) |
| SWIFTLY_API_KEY | api/live-* (lacmta, parked) | Swiftly — not active until UI/API unparked |
