# Atlas Architecture

## R2 Buckets

Three Cloudflare R2 buckets. Public access means the browser fetches directly; private means only Vercel API functions or the pipeline can read it.

### atlas (public)

Current GTFS data served to the frontend. An agency has exactly one active
snapshot here: normally a feed with service through today, or the newest
available snapshot when no current feed can be obtained. The latter is marked
stale in the agency metadata and shown with an outdated-schedule warning.

- `atlas/{slug}.json` — route GeoJSON for each agency
- `atlas/{slug}-stops.json` — stops index
- `atlas/{slug}-corridors.json` — corridor overlap data
- `gtfs/{slug}.zip` — the one active raw GTFS snapshot for each agency
- `atlas/go-stops.json` — GO rail stops (separate extract)

Written by: `pipeline/refresh.ts`, `pipeline/process-gtfs.ts`
Read by: browser directly via `R2_PUBLIC_URL`

### atlas-archive (private)

Historical and reference data not needed at runtime. A raw ZIP is moved here
when a newer snapshot replaces the active one; service expiry alone does not
remove the active fallback from the public bucket.

- `gtfs/archive/{slug}/{snapshot-key}.zip` — replaced/expired raw GTFS snapshots; legacy date/version keys receive a source-identity suffix
- `gtfs/historical/{path-slug}/{feed-end-date}.zip` — imported local historical snapshots
- `history/{slug}/latest.json` — most recent headway snapshot for diff detection
- `history/{slug}/{feed-end-date}.json` — versioned headway snapshots (pipeline diff-detection; not read by frontend)

Written by: `pipeline/refresh.ts` (both gtfs zips and history snapshots)
Read by: `pipeline/refresh.ts` only (reads `history/{slug}/latest.json` to detect week-to-week changes)

### atlas-live (private)

Real-time GTFS-RT snapshots from the Cloudflare Worker archiver. Canary cohort is
**smaller** than the browser Live Vehicles set — see `docs/LIVE_POLLING.md` § History Archiving.

- `positions/{slug}/{YYYY-MM-DD}/{unix-seconds}.json` — vehicle-position samples (currently TTC streetcars, every minute)
- `{slug}/{YYYY-MM-DD}/{unix-seconds}.json` — trip-update delay summaries (ttc, burlington, hamilton, stm; self-gated every 5th minute)
- Both formats use the `atlas.live.v1` normalized envelope; legacy fields remain during migration.

Written by: Cloudflare Worker (`workers/gtfs-rt-archiver/`) — cron every minute + daily 04:00 UTC cleanup
Read by: `/api/live-snapshot`, `/api/live-replay`, `/api/history-adherence` (not direct browser R2)

30-day retention enforced by the Worker's daily cleanup cron.


## Live Polling: three surfaces (often conflated)

### 1. Browser on-demand (while Live is open)

Client polls `/api/live-vehicles` (and stop/adherence helpers). Route list and key gates:
`shared/livePollingConfig.ts` (`LIVE_POLLING_ROUTES`). Includes public feeds (e.g. burlington,
hamilton, ttc, edmonton, yrt, halifax) and key-gated ones (TransLink, STM, SF Muni `active`,
LA Metro parked).

### 2. Background Worker archiver

Hardcoded feed lists in `workers/gtfs-rt-archiver/src/index.ts` (not `LIVE_POLLING_ROUTES`):
trip-updates for **ttc, burlington, hamilton, stm**; vehicle positions for **ttc streetcars, burlington, hamilton, and stm**.
Writes private `atlas-live`. Expand only after canary health + contract checks.

### 3. Provider consumers (snapshot / replay)

`/api/live-snapshot` and `/api/live-replay` read `atlas-live` for Bridge and verification tools.
History UI also uses schedule-period headway diffs from `atlas-archive` (pipeline) — a different
meaning of “history” than RT delay archives.


## Data Flow: Weekly Refresh

```
  feedUrl (agency's GTFS zip)
  -> pipeline/refresh.ts
    -> parse GTFS
    -> if a newer snapshot is available: archive previous raw ZIP, write gtfs/{slug}.zip,
       and write atlas/{slug}.json (public, replaces previous)
    -> if the downloaded snapshot is stale or has unknown dates: keep/publish it
       as the active fallback and mark the agency stale
    -> if download/validation fails: keep the existing active snapshot unchanged
    -> write atlas/{slug}-stops.json    (public)
    -> write atlas/{slug}-corridors.json (public)
    -> compare vs history/{slug}/latest.json (atlas-archive)
    -> if changed: write history/{slug}/{period}.json + latest.json (atlas-archive)
```

Triggered by: GitHub Actions weekly cron (Monday), or `npm run refresh`

The active raw ZIP is the bucket-level marker for the one snapshot Atlas is
using: exactly one active snapshot lives at `atlas/gtfs/{slug}.zip`. When a
newer snapshot replaces it, the previous object is copied server-side into
`atlas-archive` before the public object is replaced. If no newer source is
available, the existing active snapshot stays public and its agency is marked
stale; the frontend, public agency directory, hidden-route inventory, and
PMTiles build all use the same active-feed filter.


## Vercel API Routes

`/api/*` routes are Vercel serverless functions — they do NOT run in the Vite dev server.
Local: `npm run dev:api` (custom tsx server; not full parity with every Node-style handler).
Production-like: `vercel dev` if preferred.

- `/api/live-vehicles` — on-demand GTFS-RT vehicle positions + delays for Live UI
- `/api/live-stop` — predicted (and TTC observed) arrivals at a stop
- `/api/live-adherence` — on-demand route adherence panel
- `/api/live-snapshot` — latest versioned canary snapshot with freshness state
- `/api/live-replay` — bounded versioned snapshot replay for validation and consumers
- `/api/history-adherence` — aggregates trip-delay archives from `atlas-live` into hourly buckets
- `/api/gtfs-rt` — legacy raw proto→JSON proxy (burlington/hamilton only)


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
