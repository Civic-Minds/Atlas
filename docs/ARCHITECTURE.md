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

Real-time GTFS-RT snapshots from the Cloudflare Worker archiver. The current
canary cohort is deliberately limited to the feeds already used for live testing.

- `positions/{slug}/{YYYY-MM-DD}/{unix-seconds}.json` — versioned vehicle-position snapshots
- `{slug}/{YYYY-MM-DD}/{unix-seconds}.json` — versioned trip-update snapshots
- Both formats use the `atlas.live.v1` normalized envelope; legacy fields remain during migration.

Written by: Cloudflare Worker (`workers/gtfs-rt-archiver/`)
Read by: Atlas provider APIs (`/api/live-snapshot` and `/api/live-replay`) and the
existing History aggregation. Replay supports bounded `start`, `end`, `offset`, and
`limit` queries. Consumers must use those APIs rather than private R2.

30-day retention enforced by the Worker's daily cleanup cron.


## Live Polling: Provider and consumer surfaces

These are independent and often confused.

### 1. Atlas provider polling and archiving

The Worker polls the configured canary feeds and writes normalized snapshots to R2. It
does not expand coverage until feed health, schema validation, replay, and consumer
verification pass for the existing cohort.

Configured in: `shared/livePollingConfig.ts` (LIVE_POLLING_ROUTES)
Current routes: Burlington 1+10, Hamilton 01+10, Edmonton 004, YRT VIVA Blue, Halifax 1, TTC 503, TTC 504, TransLink 099 (key-gated), STM 55 (key-gated)

### 2. Atlas consumers

Atlas serves current data with `/api/live-snapshot` and bounded historical data with
`/api/live-replay`. Bridge consumes those contracts and owns bunching, gap, dwell,
recommendation, policy, approval, and webhook behavior.

The frontend may retain its route-specific on-demand adherence behavior while it is
migrated to the same provider contract; it is not a second owner of GTFS-RT ingestion.


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

- `/api/live-adherence` — legacy/on-demand adherence surface during migration
- `/api/live-snapshot` — latest versioned canary snapshot with freshness state
- `/api/live-replay` — bounded versioned snapshot replay for validation and consumers
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
