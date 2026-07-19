# Live Polling

Reference for Atlas's live GTFS-RT integration status — which agencies are polled, which are parked, and per-agency feed quirks. Split out of `AGENCIES.md` since this is substantial, actively-growing, live-data-integration reference distinct from static coverage.

For where this fits in the platform's future direction, see [Live Data Infrastructure](./roadmap/TECHNICAL.md#live-data-infrastructure).

---

## Live Polling

Client-side GTFS-RT polling via `/api/live-vehicles`. Runs in the browser while Live Vehicles is open — not a background process. Config lives in [`shared/livePollingConfig.ts`](../shared/livePollingConfig.ts).

### Active

| Agency | Slug | Routes | API Key | Feed |
|--------|------|--------|---------|------|
| Burlington Transit | `burlington` | 1, 10 | none | opendata.burlington.ca |
| Toronto Transit Commission | `ttc` | 503, 504 | none | gtfsrt.ttc.ca |
| TransLink | `translink` | 99 B-Line | `TRANSLINK_API_KEY` | gtfsapi.translink.ca |
| STM (Montreal) | `stm` | 55 | `STM_API_KEY` | api.stm.info |
| Hamilton Street Railway | `hamilton` | 01, 10 | none | opendata.hamilton.ca |
| Edmonton Transit System | `edmonton` | 004 | none | gtfs.edmonton.ca |
| York Region Transit | `yrt` | VIVA Blue | none | rtu.york.ca |
| Halifax Transit | `halifax` | 1 | none | gtfs.halifax.ca |
| SF Muni | `sfmta` | J, K, L, M, N, T | `MUNI_511_API_KEY` | api.511.org |

### Configured but parked

| Agency | Slug | Status | Notes |
|--------|------|--------|-------|
| LA Metro rail | `lacmta` | Parked | Rail routes are configured but waiting for the Swiftly credential to be restored before activation. |

### Keys In Hand — Not Yet Wired Up

| Agency | Slug | Key Type | Notes |
|--------|------|----------|-------|
| King County Metro | `kcm` | OBA key stored | Feed was returning 0 vehicles at peak — likely route_id prefix mismatch (`1_100512` etc.). Verify IDs against live feed before enabling. |
| Sound Transit | `soundtransit` | Same OBA key | Route filter uses `40_512`, `40_545` — unverified. |

### Not Yet Requested

| Agency | Notes |
|--------|-------|
| CTA (Chicago) | Feed is non-standard JSON, not GTFS-RT protobuf. Needs a custom adapter. |
| Foothill Transit | Silver Streak (`20707`). Requires IP whitelist — email info@foothilltransit.org. |
| Madison Metro Transit | Rapid Route A. Free key at metromap.cityofmadison.com/dev-account. |
| Miami-Dade Transit | Swiftly — same form as LA Metro. Same key once activated. |
| RTC Southern Nevada (Vegas) | Swiftly — same key as Miami-Dade once activated. |

Per-agency live feed quirks (trip-ID mismatches, missing routes, protobuf issues) are tracked in [`KNOWN_ISSUES.md`](KNOWN_ISSUES.md) § Feed Issues, alongside static-feed quirks — one home for "this agency's feed is weird" rather than splitting live vs. static.

---

## History Archiving

Cloudflare Worker (`workers/gtfs-rt-archiver/`) writes to private R2 bucket `atlas-live`. Cron is **every minute** (`* * * * *`); trip-update delay archives **self-gate to every 5th minute**, while vehicle-position samples write **every minute**. Daily cleanup at 04:00 UTC enforces **30-day** retention.

This is **not** the same set as client Live Vehicles (`LIVE_POLLING_ROUTES`). The Worker hardcodes its own feed lists in `workers/gtfs-rt-archiver/src/index.ts`.

### Trip-update archives (every ~5 min)

Written to `{slug}/{YYYY-MM-DD}/{unix-seconds}.json`. Powers `/api/history-adherence` and related History RT views.

| Agency | Slug | Notes |
|--------|------|-------|
| Toronto Transit Commission | `ttc` | Public feed |
| Burlington Transit | `burlington` | Public feed |
| Hamilton Street Railway | `hamilton` | Public feed |
| STM (Montreal) | `stm` | Requires Worker secret `STM_API_KEY` |

### Vehicle-position archives (every 1 min)

Written to `positions/{slug}/{YYYY-MM-DD}/{unix-seconds}.json`. Used for measured headway/speed analysis (e.g. TTC streetcars).

| Agency | Slug | Filter |
|--------|------|--------|
| Toronto Transit Commission | `ttc` | Streetcar route_ids only (`/^5(0[1345679]|1[012])$/`) |

All other agencies: **static** history snapshots only (headway diffs via `atlas-archive`, written on each pipeline refresh) — not GTFS-RT archives.

---

## Notes

- **511 SF Bay API key**: one key covers SF Muni (`SF`), AC Transit (`AC`), and VTA (`SC`). Atlas uses `MUNI_511_API_KEY` and the provider's `api_key` query parameter.
- **TTC trip IDs**: Clever Devices RT trip IDs don't match Toronto Open Data static IDs — time-based spatial fallback required. ~20% direct match rate.
- **Halifax trip IDs**: RT trip IDs differ from static — spatial fallback handles matching.

---

[Back to Data](./DATA.md)
