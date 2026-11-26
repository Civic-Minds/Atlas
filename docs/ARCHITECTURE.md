# Atlas architecture

## R2 buckets

Four production Cloudflare R2 buckets. Public access means the browser fetches directly; private means only Vercel API functions, Workers or the pipeline can read it. A separate non-production `atlas-staging` bucket mirrors the public key layout for rehearsals and beta-only agencies (see [Staging R2](operations/STAGING.md)).

Inventory on 2026-11-26 (CIV-2995, a list-only count):

| Bucket | Objects | Size | Biggest prefixes |
|---|---:|---:|---|
| `atlas` (public) | 270,784 | 65.7 GB | `atlas/runs/` 49.7 GB, `atlas/releases/` 10.4 GB, per-agency files 1.9 GB, root `atlas.pmtiles` 1.6 GB, `gtfs/` 1.5 GB |
| `atlas-archive` (private) | 33,713 | 14.9 GB | `gtfs/archive/` 9.4 GB, `gtfs/historical/` 4.7 GB, `stops-meta/` 0.4 GB |
| `atlas-live` (private) | 147,110 | 4.8 GB | `positions/` 3.7 GB, `live/` 0.8 GB |
| `atlas-mcp-live` (private) | 428 | 0.2 GB | Studio's and the hosted MCP's Live files |
| `atlas-staging` | 2,908 | 0.35 GB | `gtfs/archive/`, `atlas/on-demand/`, `history/` |

Three leftovers in `atlas` are waiting on Ryan's OK to delete (CIV-2995): the unpruned `atlas/runs/` folders, the frozen public `gtfs/{slug}.zip` copies and the root `atlas.pmtiles`.

### atlas (public)

Static GTFS-derived data served to the frontend.

Verified data releases (what deployed builds read):

- `atlas/release.json` — pointer to the current verified release
- `atlas/releases/{releaseId}/atlas.pmtiles` and `atlas-overview.pmtiles` — map tiles for that release
- `atlas/releases/{releaseId}/agencies/` — agency route and stop snapshots built in the same run as the tiles
- `atlas/releases/{releaseId}/manifest.json` — release manifest

Deployed builds only use a release whose tiles and agency data were built together; they do not fall back to the unversioned per-agency files below (local development still can). Deployed builds read the release's map tiles (`pmtilesKey`, `overviewPmtilesKey`) straight from `https://data.transitatlas.fyi`; with no verified release they request a key that 404s, so no routes draw. Tiles must not go through a Vercel function: that used up the Fast Origin Transfer allowance.

Per-agency working artifacts (inputs to each release build):

- `atlas/{slug}.json` — route GeoJSON
- `atlas/{slug}-stops.json` — stops index
- `atlas/{slug}-corridors.json` — corridor overlap data
- `atlas/{slug}-trips.json`, `atlas/{slug}-stops-meta.json` — trip and stop metadata
- `atlas/live-polling/{slug}.json` — live-polling sidecar, when the feed produces one
- `atlas/go-stops.json` — GO rail stops (separate extract, `pipeline/extract-go-stops.ts`)

Shared indexes: `atlas/agencies.json`, `atlas/hidden-routes.json`, `atlas/feed-refresh-meta.json`, `atlas/night-service.json`, `atlas/history-config.json`.

Other prefixes:

- `atlas/runs/{runId}/`: a cloud rebuild's staged agency files (CIV-522; [Data reprocessing](operations/DATA_REPROCESSING.md)), about 1.5 GB per run. Nothing prunes them: 32 runs (2026-10-30 to 11-23) on 2026-11-26.
- `atlas/search/stops/`, `atlas/search/pages/`: the content-addressed search index; `pipeline/prune-search-index.ts` deletes files no kept release names (CIV-1056).
- `atlas/history-v2-shapes/{slug}.json`: History's route shapes, written by `pipeline/build-history.ts`.
- `atlas/live/`, `atlas/live-polling/`: a few Live files (12 and 10 objects).
- `gtfs/{slug}.zip`: frozen public copies of raw feeds from before 2026-08-15 (466 files). Nothing reads them (`pipeline/audit-active-feeds.ts` lists them as leftovers); the private archive holds every zip.

Written by: `pipeline/refresh.ts`, `pipeline/process-gtfs.ts`, `pipeline/restore-active-feeds.ts`, `pipeline/reprocess-derived-artifacts.ts --write` (per-agency artifacts); `pipeline/build-pmtiles.ts` (immutable release); `pipeline/publish-data-release.ts` (`release.json` pointer, only after checks pass); `pipeline/build-history.ts` (`history-config.json`)
Read by: browser directly via `VITE_R2_PUBLIC_URL` (default `https://data.transitatlas.fyi`); map tiles always from `https://data.transitatlas.fyi`

Standalone tile uploads (`upload-pmtiles`, non-dry-run `build-pmtiles-incremental`) write the legacy root `atlas.pmtiles` (last written 2026-10-06; deployed builds never read it) outside any release and refuse to run without `--allow-unpaired-pmtiles-upload`. Publish through the release flow instead (`npm run refresh-release`, or `build-pmtiles` → `verify-pmtiles-remote` → `build-history` → `publish-data-release`).

### atlas-archive (private)

Historical and reference data not needed at runtime.

- `gtfs/archive/{slug}/{feed-end-date-or-version}-{hash}.zip` — raw GTFS zip snapshots, one per distinct feed file (older objects keep legacy names)
- `gtfs/archive/{slug}--supplemental-{n}/{feed-end-date-or-version}-{hash}.zip` — raw supplemental feed zips (for example separate rail feeds)
- `history/{slug}/latest.json` — most recent per-route headways, the baseline for change detection
- `history/{slug}/{routeShortName}/{period}.json` — per-route headway snapshots, written only when that route's headway changes
- `history/{slug}/coverage.json` — optional coverage metadata (covered years, `materializeAllPeriods`)
- `stops-meta/{slug}/latest.json` and `stops-meta/{slug}/{period}.json` — stop snapshots used for stop-change audits
- `gtfs/historical/{slug}/` — a one-time import of older feed zips (2026-08-10, `pipeline/migrate-gtfs-archive.ts`), read by History
- `history-v2/{slug}/{periodKey}.json` and `history-v2-shapes/{slug}/{periodKey}.json` — History v2 sidecars and per-period shapes (`pipeline/history-v2-upload.ts`, `pipeline/historyShapes.ts`)
- `history-v2-replaced/{ticket}/` — immutable backups of History v2 files that an approved replacement overwrote (`pipeline/historyV2Replace.ts`)
- `trip-duration/{slug}/{routeKey}/{periodKey}.json` — trip-time history (`pipeline/backfill-bart-trip-duration.ts`; read by `build-history.ts`)
- `studio-live/runs/` — 69 objects from 2026-11-22 and 11-23; Studio's Live files now go to `atlas-mcp-live`
- `research/coverage-inputs/` — inputs for the coverage study

Written by: `pipeline/refresh.ts` (zips, history, and stop snapshots); history backfill scripts (`pipeline/backfill-*-history.ts`)
Read by: `pipeline/refresh.ts` (history and stop baselines), `pipeline/build-history.ts` (history tree), `pipeline/reprocess-derived-artifacts.ts` (archived zips; picks the newest service date and fails closed when it cannot tell which zip is current — see [Data reprocessing](operations/DATA_REPROCESSING.md))

### atlas-live (private)

Private storage for real-time GTFS-RT snapshots. TTC vehicle positions are
recorded every minute by the ttc-positions Worker (cron `* * * * *`, in
`workers/gtfs-rt-archiver/wrangler.toml` since CIV-1689). Hamilton is recorded every
minute again from 2026-11-18, and Kingston Transit every minute for the Atlas Studio demo (CIV-1682; its own
`atlas-gtfs-rt-archiver-kingston` Worker, archive-only, not a Live agency; in this bucket since CIV-1906). Boston's MBTA (the Green Line B-E, the Silver Line, the Mattapan Line and buses 23, 57, 66 and 111) is recorded every minute from its `atlas-gtfs-rt-archiver-mbta` Worker (CIV-1930, positions only, archive-only; data © MassDOT under its Developers License Agreement, which requires crediting MassDOT as the provider). The other three Workers (ttc-trips, STM, Burlington/Halifax) are paused
with no cron, and their data has expired: checked 2026-11-15, the bucket held only `positions/ttc/`. Objects are
kept 60 days by the bucket’s one lifecycle rule (CIV-1906, 2026-11-18; 30 days before).
`npm run audit-live-state` shows the live crons, newest snapshots and lifecycle rules. Snapshot/replay for Live UI needs a
restored provider contract before Live can be re-enabled.

- `positions/{slug}/{YYYY-MM-DD}/{unix-seconds}.json` — vehicle-position samples, every minute; on 2026-11-26 the bucket held `ttc`, `hamilton`, `mbta` and `kingston`
- `{slug}/{YYYY-MM-DD}/` — trip-update samples; on 2026-11-26 `hamilton` and `kingston`
- `live/{slug}/` — the v2 recorder's snapshots (`LIVE_V2_PREFIX`, `shared/liveSlots.ts`); on 2026-11-26 `ttc`, `drt`, `hamilton`, `kingston`, `brampton`, `burlington`, `mbta` and `yrt`
- `packs/{slug}/`, `counts/` — packed days and snapshot counts built from them
- The archived formats use the `atlas.live.v1` normalized envelope where snapshots exist.

Written by small Cloudflare Workers (only ttc-positions runs now) sharing `workers/gtfs-rt-archiver/src/index.ts`.
The local-only `history-adherence` handler (`local-api/`, never deployed) can read the archive; the former live snapshot/replay routes
are no longer in the repository.

Read by the Live page's vehicles (CIV-2894): the `atlas-live-read` Worker (`workers/atlas-live-read/`, workers.dev,
`https://atlas-live-read.rhanna-334.workers.dev/live/vehicles?agency=<slug>`) reads the recorder's newest v2 snapshot through
a read-only binding, for recorded agencies only (`RECORDER_SLUGS`), with CORS for Atlas's sites and localhost
(`shared/liveCloud.ts`). It is the same reading as local-api's `fromRecorder`, so /apps/live needs nothing running on the Mac.
It writes nothing. Deploy from its folder with `npx wrangler deploy`.

60-day retention enforced by the bucket's R2 lifecycle rule.

### atlas-mcp-live (private)

Studio's and the hosted Atlas Studio MCP's Live and schedule files, never public.

- `studio-live/runs/{runId}/{slug}/` and `studio-live/current.json` — Studio's Live files and the pointer to the current run (`scripts/studio-live-cloud.ts`, CIV-2186)
- Studio's buses-needed and schedule-change files under `STUDIO_FILES_PREFIX` (`scripts/studio-files-upload.ts`, CIV-1974)
- `live/` — the hosted MCP's Live files, `live/index.json` written last (`scripts/mcp/releaseLivePrivate.ts`, CIV-1860)

Written by those three scripts from cloud workflows; each refuses the public bucket (CIV-2988).
Read by the hosted MCP Worker through its binding, and by the Vite dev server (`local-api/liveFiles.ts`, `local-api/studioFiles.ts`) with the Mac's read-only key, which can read only this bucket.

### atlas-live-kingston (deleted)

Kingston's own bucket from 2026-11-15 to 2026-11-18 (CIV-1682). Since CIV-1906 the Kingston Worker writes to
atlas-live; its earlier objects were copied there (checked, 0 differences) and the bucket was deleted on 2026-11-18 (Ryan's yes).


## Live polling: current and planned surfaces

How the Live route page measures delay, bunching, run time and the rest: [product/LIVE_METHOD.md](product/LIVE_METHOD.md).

### 1. Live UI and feed configuration (status: [Feature flags](FEATURE_FLAGS.md))

The Live Vehicles UI and agency feed configuration remain in the repository, but the
feature is disabled unless `VITE_LIVE_ENABLED=true`. `local-api/live-vehicles.ts` and the other
Live handlers live in `local-api/`, which is never deployed; they run only in the local dev API server.
Route configuration and feed credentials remain in `shared/livePollingConfig.ts`.

### 2. Background Worker archiver (TTC positions only)

Hardcoded feed lists live in `shared/liveArchiveFeeds.ts` (not `LIVE_POLLING_ROUTES`).
The five legacy archive Workers covered trip updates and vehicle positions for **ttc,
burlington, hamilton, halifax, and stm**. TTC and Hamilton positions run every minute
(cron in each Worker's toml); the other shards are paused (CIV-1689). Any replacement should
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

Triggered by: the `refresh-feeds.yml` GitHub Actions workflow (Mondays 06:00 UTC; also manual dispatch), or manually with `npm run refresh-release -- <slug>`. Plain `npm run refresh` only rebuilds per-agency artifacts; it does not publish a new release.


## Vercel API routes

Every file in `api/` is deployed as a Vercel function at `/api/{name}`; they do not run in the Vite dev server.
Local: `npm run dev:api` (custom tsx server on port 5001; registers `privacy-region` and, for dev only, `carto-tiles` (the basemap with the server key, since localhost is not on the public key) plus the local-only handlers in `local-api/`: `live-vehicles`, `live-segments`, `live-recent`, `live-stop`, `live-dashboard`, `live-agency`, and `history-adherence`). To run Live, use `npm run live` (starts this server and Vite together).
Production-like: `vercel dev` if preferred.

Used by the deployed app:
- `/api/geo` — approximate location fallback from Vercel's edge headers
- `/api/version` — current build ID for the app-update banner
- `/api/privacy-region` — country lookup for the analytics consent prompt (rewritten in `vercel.json` to `/api/geo?mode=privacy-region`)

Local only, never deployed (in `local-api/`): the Live handlers and `history-adherence` (aggregates trip-delay archives from `atlas-live` into hourly buckets). `vercel.json` also proxies `/beta-data/*` to the staging bucket for beta-only agencies.


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
| R2_LIVE_BUCKET_NAME | local-api/* live archive routes | `atlas-live` bucket name |
| TRANSLINK_API_KEY | local-api/live-* (TransLink) | TransLink GTFS-RT |
| STM_API_KEY | local-api/live-*; Worker archiver | STM GTFS-RT |
| MUNI_511_API_KEY | local-api/live-* (sfmta); pipeline (511-hosted static feeds, e.g. lavta) | 511 SF Bay |
| SWIFTLY_API_KEY | local-api/live-* (lacmta, parked) | Swiftly — not active until UI/API unparked |
| CARTO_BASEMAP_API_KEY | local-api/carto-tiles (dev only) | Server basemap key for `npm run dev`; keep private. Builds use the public, host-locked key in `src/lib/basemap.ts` (override: `VITE_CARTO_BASEMAP_KEY`) and load tiles straight from CARTO: CARTO's terms forbid proxying or server-side caching, so basemap tiles never go through Vercel |
| VITE_GA_MEASUREMENT_ID | frontend | Google Analytics 4 measurement ID |
| ATLAS_ENV / ATLAS_ENV_FILE | pipeline | `ATLAS_ENV=staging` loads `.env.staging`; default is `.env.local` |

Feature and mode flags (`VITE_ATLAS_MODE`, `VITE_*_ENABLED`) are documented in [Feature flags](FEATURE_FLAGS.md). `.env.example` lists every variable.
