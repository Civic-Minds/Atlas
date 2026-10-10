# Live polling

Reference for Atlas's live GTFS-RT integration status — which agencies are polled, which are parked, and per-agency feed quirks. Split out of `AGENCIES.md` since this is substantial, actively-growing, live-data-integration reference distinct from static coverage.

For where this fits in the platform's future direction, see [Live Data Infrastructure](../roadmap/TECHNICAL.md#live-data-infrastructure).

**Status:** Live GTFS-RT archiving is paused while the collection and quality checks are rebuilt. Existing R2 snapshots remain available; no new snapshots are being written.

---

## Live polling

The Live Vehicles UI, feed configuration, and the `/api/live-vehicles` handler are in
the repository, but Live is gated off in every deployment (`LIVE_ENABLED`, see
[`FEATURE_FLAGS.md`](../FEATURE_FLAGS.md)). The handler polls configured feeds for
local use (`npm run dev:api` with `npm run dev:live`). Feed configuration lives in
[`shared/livePollingConfig.ts`](../../shared/livePollingConfig.ts). An agency is only
eligible when its feed needs no API key or its config is marked `active`; the API
also requires any key to be set.

The agencies below are configured or previously tested, not live in the public
product.

### Configured feeds (paused)

| Agency | Slug | Routes | API Key | Feed |
|--------|------|--------|---------|------|
| Burlington Transit | `burlington` | 1, 10 | none | opendata.burlington.ca |
| Toronto Transit Commission | `ttc` | 503, 504; streetcar network map-only | none | gtfsrt.ttc.ca |
| TransLink | `translink` | 99 B-Line (not marked `active`) | `TRANSLINK_API_KEY` | gtfsapi.translink.ca |
| STM (Montreal) | `stm` | 55 (not marked `active`) | `STM_API_KEY` | api.stm.info |
| Hamilton Street Railway | `hamilton` | 01, 10 | none | opendata.hamilton.ca |
| Edmonton Transit System | `edmonton` | 004 | none | gtfs.edmonton.ca |
| York Region Transit | `yrt` | VIVA Blue | none | rtu.york.ca |
| Halifax Transit | `halifax` | 1, 2, 4, 5, 7A, 7B, FerD | none | gtfs.halifax.ca |
| SF Muni | `sfmta` | J, K, L, M, N, T | `MUNI_511_API_KEY` | api.511.org |

### Configured but parked

| Agency | Slug | Status | Notes |
|--------|------|--------|-------|
| LA Metro rail | `lacmta` | Parked | Rail routes are configured but waiting for the Swiftly credential to be restored before activation. |

### Keys in hand, not yet wired up

| Agency | Slug | Key Type | Notes |
|--------|------|----------|-------|
| King County Metro | `kcm` | OBA key stored | Feed was returning 0 vehicles at peak — likely route_id prefix mismatch (`1_100512` etc.). Verify IDs against live feed before enabling. |
| Sound Transit | `soundtransit` | Same OBA key | Route filter uses `40_512`, `40_545` — unverified. |

### Not yet requested

| Agency | Notes |
|--------|-------|
| CTA (Chicago) | Feed is non-standard JSON, not GTFS-RT protobuf. Needs a custom adapter. |
| Foothill Transit | Silver Streak (`20707`). Requires IP whitelist — email info@foothilltransit.org. |
| Madison Metro Transit | Rapid Route A. Free key at metromap.cityofmadison.com/dev-account. |
| Miami-Dade Transit | Swiftly — same form as LA Metro. Same key once activated. |
| RTC Southern Nevada (Vegas) | Swiftly — same key as Miami-Dade once activated. |

Per-agency live feed quirks (trip-ID mismatches, missing routes, protobuf issues) are tracked in [`KNOWN_ISSUES.md`](KNOWN_ISSUES.md) § Feed issues, alongside static-feed quirks — one home for "this agency's feed is weird" rather than splitting live vs. static.

---

## History archiving (paused; legacy design)

The previous Cloudflare Worker setup wrote to private R2 bucket `atlas-live`. Five
small Workers covered TTC positions, TTC trips, Hamilton, STM, and Burlington plus
Halifax. Each shard ran every minute; trip-update archives ran every 5 minutes,
while vehicle-position samples ran every minute. That setup is paused and should be
treated as a legacy design, not the committed shape of the next hosted collector.
R2 lifecycle rules enforce **30-day** retention.
Deploy the five configs separately: `wrangler.toml`, `wrangler.ttc-trips.toml`,
`wrangler.hamilton.toml`, `wrangler.stm.toml`, and
`wrangler.burlington-halifax.toml`. The STM shard also needs its own
`STM_API_KEY` secret after deployment.

This is **not** the same set as client Live Vehicles (`LIVE_POLLING_ROUTES`). The archived feeds and shards are listed in `shared/liveArchiveFeeds.ts` (URLs must match `shared/livePollingConfig.ts`); the Worker in `workers/gtfs-rt-archiver/` reads them from there. The wrangler configs define no cron triggers.

### Trip-update archives (every ~5 min)

Written to `{slug}/{YYYY-MM-DD}/{unix-seconds}.json`. Powers `/api/history-adherence` and related History RT views.

| Agency | Slug | Notes |
|--------|------|-------|
| Toronto Transit Commission | `ttc` | Public feed |
| Burlington Transit | `burlington` | Public feed |
| Hamilton Street Railway | `hamilton` | Public feed |
| STM (Montreal) | `stm` | Requires Worker secret `STM_API_KEY` |
| Halifax Transit | `halifax` | Public feed |

### Vehicle-position archives (every 1 min)

Written to `positions/{slug}/{YYYY-MM-DD}/{unix-seconds}.json`. Used for live history and measured headway/speed analysis.

| Agency | Slug | Filter |
|--------|------|--------|
| Toronto Transit Commission | `ttc` | Streetcar route_ids only (`/^5(0[1345679]|1[012])$/`) |
| Burlington Transit | `burlington` | All vehicle positions |
| Hamilton Street Railway | `hamilton` | All vehicle positions |
| STM (Montreal) | `stm` | All vehicle positions; requires Worker secret `STM_API_KEY` |
| Halifax Transit | `halifax` | All vehicle positions |

All other agencies: **static** history snapshots only (headway diffs via `atlas-archive`, written on each pipeline refresh) — not GTFS-RT archives.

## Local validation

Live can be tested locally without Workers or new R2 writes. Local fixtures or a
local API can fetch and normalize a small number of feeds while the Live UI and
replay behavior are rebuilt. This is a development/testing path, not a decision
about the final hosted architecture.

---

## Notes

- **511 SF Bay API key**: one key covers SF Muni (`SF`), AC Transit (`AC`), and VTA (`SC`). Atlas uses `MUNI_511_API_KEY` and the provider's `api_key` query parameter.
- **TTC trip IDs**: Clever Devices RT trip IDs don't match Toronto Open Data static IDs — time-based spatial fallback required. ~20% direct match rate.
- **Halifax trip IDs**: RT trip IDs differ from static — spatial fallback handles matching.

---

[Back to Data](../DATA.md)
