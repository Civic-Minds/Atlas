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

Real-time GTFS-RT trip delay snapshots from the Cloudflare Worker archiver.

- `{slug}/{YYYY-MM-DD}/{unix-seconds}.json` — compact trip delay JSON, written every 5 minutes

Written by: Cloudflare Worker (`workers/gtfs-rt-archiver/`) — currently archives Burlington and Hamilton only
Read by: `api/history-adherence.ts` (Vercel serverless function), which aggregates these into the History tab view

30-day retention enforced by the Worker's daily cleanup cron.


## Live Polling: Two Separate Systems

These are independent and often confused.

### 1. Client-side live polling (frontend, on-demand)

When a user opens the app and clicks a live-tracked route, `useLiveAdherence.ts` polls the agency's GTFS-RT TripUpdates feed directly from the browser every ~30 seconds. Active only while the app is open and a live route is selected.

Configured in: `shared/livePollingConfig.ts` (LIVE_POLLING_ROUTES)
Current routes: Burlington 1+10, Hamilton 01+10, Edmonton 004, YRT VIVA Blue, Halifax 1, TTC 503, TTC 504, TransLink 099 (key-gated), STM 55 (key-gated)

This powers the "Live" badge and schedule adherence cards in the sidebar.

### 2. Background archiving (Cloudflare Worker, always-on)

The Cloudflare Worker (`workers/gtfs-rt-archiver/`) runs every 5 minutes and writes compact trip summaries to `atlas-live`. This is what the History tab reads — it shows patterns across days and weeks, not just the current moment.

Currently archives: Burlington, Hamilton
Does NOT archive: all other live-polled routes

This means the History tab only has data for Burlington and Hamilton. All other routes show "no data" in the History view even though they have client-side live polling.


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

`/api/*` routes are Vercel serverless functions — they do NOT run in the Vite dev server. Use `vercel dev` to test them locally.

- `/api/live-adherence` — proxies GTFS-RT feeds for live route polling (injects API keys from env vars for key-gated feeds)
- `/api/history-adherence` — reads from `atlas-live`, aggregates trip delay snapshots into hourly buckets for the History tab


## Environment Variables

| Variable | Used by | Purpose |
|---|---|---|
| R2_ACCOUNT_ID | pipeline, api/* | Cloudflare account |
| R2_ACCESS_KEY_ID | pipeline, api/* | R2 credentials |
| R2_SECRET_ACCESS_KEY | pipeline, api/* | R2 credentials |
| R2_BUCKET_NAME | pipeline | `atlas` bucket name |
| R2_PUBLIC_URL | pipeline | Public base URL for atlas bucket |
| R2_ARCHIVE_BUCKET_NAME | pipeline | `atlas-archive` bucket name |
| R2_LIVE_BUCKET_NAME | api/history-adherence | `atlas-live` bucket name |
| TRANSLINK_API_KEY | api/live-adherence | TransLink 099 B-Line |
| STM_API_KEY | api/live-adherence | STM 55 |
