# Atlas architecture

## R2 buckets

Three production Cloudflare R2 buckets. Public access means the browser fetches directly; private means only Vercel API functions or the pipeline can read it. A separate non-production `atlas-staging` bucket mirrors the public key layout for rehearsals and beta-only agencies (see [Staging R2](operations/STAGING.md)).

### atlas (public)

Static GTFS-derived data served to the frontend.

Verified data releases (what deployed builds read):

- `atlas/release.json` — pointer to the current verified release
- `atlas/releases/{releaseId}/atlas.pmtiles` and `atlas-overview.pmtiles` — map tiles for that release
- `atlas/releases/{releaseId}/agencies/` — agency route and stop snapshots built in the same run as the tiles
- `atlas/releases/{releaseId}/manifest.json` — release manifest

Deployed builds only use a release whose tiles and agency data were built together; they do not fall back to the unversioned per-agency files below (local development still can). Map tiles are served through `/api/atlas-pmtiles`, which refuses requests without a valid `release_id`.

Per-agency working artifacts (inputs to each release build):

- `atlas/{slug}.json` — route GeoJSON
- `atlas/{slug}-stops.json` — stops index
- `atlas/{slug}-corridors.json` — corridor overlap data
- `atlas/{slug}-trips.json`, `atlas/{slug}-stops-meta.json` — trip and stop metadata
- `atlas/live-polling/{slug}.json` — live-polling sidecar, when the feed produces one
- `atlas/go-stops.json` — GO rail stops (separate extract, `pipeline/extract-go-stops.ts`)

Shared indexes: `atlas/agencies.json`, `atlas/hidden-routes.json`, `atlas/feed-refresh-meta.json`, `atlas/night-service.json`, `atlas/frequent-service.json`, `atlas/history-config.json`.

Written by: `pipeline/refresh.ts`, `pipeline/process-gtfs.ts`, `pipeline/restore-active-feeds.ts`, `pipeline/reprocess-derived-artifacts.ts --write` (per-agency artifacts); `pipeline/build-pmtiles.ts` (immutable release); `pipeline/publish-data-release.ts` (`release.json` pointer, only after checks pass); `pipeline/build-history.ts` (`history-config.json`)
Read by: browser directly via `VITE_R2_PUBLIC_URL` (default `https://data.transitatlas.fyi`), plus `/api/atlas-pmtiles` for tiles

Standalone tile uploads (`upload-pmtiles`, non-dry-run `build-pmtiles-incremental`) write the legacy root `atlas.pmtiles` outside any release and refuse to run without `--allow-unpaired-pmtiles-upload`. Publish through the release flow instead (`npm run refresh-release`, or `build-pmtiles` → `verify-pmtiles-remote` → `build-history` → `publish-data-release`).

### atlas-archive (private)

Historical and reference data not needed at runtime.

- `gtfs/archive/{slug}/{feed-end-date-or-version}-{hash}.zip` — raw GTFS zip snapshots, one per distinct feed file (older objects keep legacy names)
- `gtfs/archive/{slug}--supplemental-{n}/{feed-end-date-or-version}-{hash}.zip` — raw supplemental feed zips (for example separate rail feeds)
- `history/{slug}/latest.json` — most recent per-route headways, the baseline for change detection
- `history/{slug}/{routeShortName}/{period}.json` — per-route headway snapshots, written only when that route's headway changes
- `history/{slug}/coverage.json` — optional coverage metadata (covered years, `materializeAllPeriods`)
- `stops-meta/{slug}/latest.json` and `stops-meta/{slug}/{period}.json` — stop snapshots used for stop-change audits

Written by: `pipeline/refresh.ts` (zips, history, and stop snapshots); history backfill scripts (`pipeline/backfill-*-history.ts`)
Read by: `pipeline/refresh.ts` (history and stop baselines), `pipeline/build-history.ts` (history tree), `pipeline/reprocess-derived-artifacts.ts` (archived zips; picks the newest service date and fails closed when it cannot tell which zip is current — see [Data reprocessing](operations/DATA_REPROCESSING.md))

### atlas-live (private)

Private storage reserved for real-time GTFS-RT snapshots. The archive is currently
paused and no new snapshots are being written. Existing objects are retained until
the bucket’s 30-day lifecycle removes them. Snapshot/replay for Live UI needs a
restored provider contract before Live can be re-enabled.

- `positions/{slug}/{YYYY-MM-DD}/{unix-seconds}.json` — vehicle-position samples for the five archive agencies, every minute
- `{slug}/{YYYY-MM-DD}/{unix-seconds}.json` — trip-update delay summaries for the five archive agencies, every 5 minutes
- The archived formats use the `atlas.live.v1` normalized envelope where snapshots exist.

Previously written by five small Cloudflare Workers sharing `workers/gtfs-rt-archiver/src/index.ts`.
`/api/history-adherence` can read the archive; the former live snapshot/replay routes
are no longer in the repository.

30-day retention enforced by the bucket's R2 lifecycle rules.


## Live polling: current and planned surfaces

### 1. Live UI and feed configuration (currently gated off)

The Live Vehicles UI and agency feed configuration remain in the repository, but the
feature is disabled unless `VITE_LIVE_ENABLED=true`. `api/live-vehicles.ts` is still
deployed as a function (every file in `api/` is), but nothing in the app calls it while
Live is gated off.
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


## Data flow: feed refresh and release

```
feedUrl (agency's GTFS zip, plus any supplemental feeds)
  -> pipeline/refresh.ts
    -> parse GTFS (main + supplemental feeds merged)
    -> write atlas/{slug}.json, -stops, -corridors, -trips, -stops-meta (public, replaces previous)
    -> write gtfs/archive/{slug}/*.zip and {slug}--supplemental-{n}/*.zip (atlas-archive, append)
    -> compare vs history/{slug}/latest.json (atlas-archive)
    -> for changed routes: write history/{slug}/{routeShortName}/{period}.json; always rewrite latest.json
  -> pipeline/build-pmtiles.ts          (upload immutable atlas/releases/{releaseId}/)
  -> verify tiles                        (verify-pmtiles-remote in refresh-release; verify-pmtiles-coverage in the workflow)
  -> pipeline/build-history.ts           (atlas/history-config.json)
  -> pipeline/publish-data-release.ts    (move atlas/release.json only if every check passed)
```

Triggered by: the `refresh-feeds.yml` GitHub Actions workflow (Mondays 06:00 UTC, temporarily paused; also manual dispatch), or manually with `npm run refresh-release -- <slug>`. Plain `npm run refresh` only rebuilds per-agency artifacts; it does not publish a new release.


## Vercel API routes

Every file in `api/` is deployed as a Vercel function at `/api/{name}`; they do not run in the Vite dev server.
Local: `npm run dev:api` (custom tsx server on port 5001; only registers `live-vehicles`, `history-adherence`, `carto-tiles`, and `privacy-region`).
Production-like: `vercel dev` if preferred.

Used by the deployed app:
- `/api/atlas-pmtiles` — serves map tiles for a verified release (`release_id` required)
- `/api/carto-tiles` — basemap tile proxy (keeps `CARTO_BASEMAP_API_KEY` server-side)
- `/api/geo` — approximate location fallback from Vercel's edge headers
- `/api/version` — current build ID for the app-update banner
- `/api/privacy-region` — country lookup for the analytics consent prompt (rewritten in `vercel.json` to `/api/geo?mode=privacy-region`)

Deployed but not called by the app right now: `live-vehicles` (Live is off) and `history-adherence` (aggregates trip-delay archives from `atlas-live` into hourly buckets; rewritten explicitly in `vercel.json`). `vercel.json` also proxies `/beta-data/*` to the staging bucket for beta-only agencies.


## Environment variables

| Variable | Used by | Purpose |
|---|---|---|
| R2_ACCOUNT_ID | pipeline, api/* | Cloudflare account |
| R2_ACCESS_KEY_ID | pipeline, api/* | R2 credentials |
| R2_SECRET_ACCESS_KEY | pipeline, api/* | R2 credentials |
| R2_BUCKET_NAME | pipeline | `atlas` bucket name |
| R2_PUBLIC_URL | pipeline, Vite dev proxy | Public base URL for atlas bucket |
| VITE_R2_PUBLIC_URL | frontend | Public data URL; defaults to `https://data.transitatlas.fyi` (Vite dev uses a same-origin `/atlas-data` proxy) |
| VITE_BETA_R2_PUBLIC_URL | frontend (beta) | Override for the `/beta-data` staging proxy target |
| R2_ARCHIVE_BUCKET_NAME | pipeline | `atlas-archive` bucket name |
| R2_LIVE_BUCKET_NAME | api/* live archive routes | `atlas-live` bucket name |
| TRANSLINK_API_KEY | api/live-* (TransLink) | TransLink GTFS-RT |
| STM_API_KEY | api/live-*; Worker archiver | STM GTFS-RT |
| MUNI_511_API_KEY | api/live-* (sfmta); pipeline (511-hosted static feeds, e.g. lavta) | 511 SF Bay |
| SWIFTLY_API_KEY | api/live-* (lacmta, parked) | Swiftly — not active until UI/API unparked |
| CARTO_BASEMAP_API_KEY | api/carto-tiles | Basemap tile key; keep private |
| VITE_GA_MEASUREMENT_ID | frontend | Google Analytics 4 measurement ID |
| ATLAS_ENV / ATLAS_ENV_FILE | pipeline | `ATLAS_ENV=staging` loads `.env.staging`; default is `.env.local` |

Feature and mode flags (`VITE_ATLAS_MODE`, `VITE_*_ENABLED`) are documented in [Feature flags](FEATURE_FLAGS.md). `.env.example` lists every variable.
