# Agencies

Reference for Atlas agency coverage across static data, live polling, and history archiving.

---

## Display Naming

Two rules, applied together wherever an agency name renders in the UI:

1. **Name**: use `shortenAgencyName()` (`src/utils/format.ts`) — never the raw `index.json` name directly. It collapses known long-form/legal names to the callsign riders actually use (e.g. "Bay Area Rapid Transit (BART)" → "BART").
2. **Secondary text**: if the (shortened) name doesn't already contain the city/place, show the city as secondary text next to it. If the name already contains it (e.g. "Edmonton Transit Service" → "ETS" — city's implied by the source name even after shortening), don't repeat it.

Prefer `agencyDisplayName(agencies, slug)` (`src/utils/format.ts`) over a raw `agencies.find(a => a.slug === slug)?.name` lookup — it's the lookup+shorten combined so rule 1 can't be forgotten at a new call site. Rule 2 (secondary text) still needs to be applied explicitly per component, since not every surface has room for a second line.

**Known violations as of 2026-07-16** (found during a Live-feature session, not yet fixed): TransLink shows with no city/province secondary text; Big Blue Bus shows with no city; some agencies get abbreviated inconsistently relative to others in the same list. Worth an audit pass across `SearchResultsList.tsx`, `LiveVehicles.tsx`, `AgencyCard.tsx`, and `History.tsx` — the places agency name + secondary text render together.

---

## Static Coverage

468 agencies as of July 16, 2026.

Source of truth: [`public/data/index.json`](../public/data/index.json)

**Expansion backlog:** [`AGENCY_BACKLOG.md`](AGENCY_BACKLOG.md) — prioritized agencies to add. Gap discovery: `npm run discover-gaps`.

Canada: Ontario, Quebec, British Columbia, Alberta, Saskatchewan, Manitoba, Nova Scotia, New Brunswick, Prince Edward Island, Newfoundland, Yukon, Northwest Territories

US: Washington, Oregon, California, Arizona, Nevada, Idaho, Utah, Colorado, New Mexico, Texas, Arkansas, Nebraska, Missouri, Kansas, Minnesota, Wisconsin, Illinois, Indiana, Michigan, Ohio, Kentucky, Tennessee, Louisiana, Alabama, Alaska, Mississippi, Georgia, Florida, North Carolina, South Carolina, Vermont, Virginia, Maryland, Washington DC, Pennsylvania, New Hampshire, New Jersey, New York, North Dakota, Connecticut, Rhode Island, Massachusetts, Maine, Delaware, Hawaii, Montana

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

### Known Feed Issues

| Agency | Issue |
|--------|-------|
| Hamilton | `feed_end_date` in `feed_info.txt` uses quoted CSV values — pipeline strips them correctly as of July 2026. |
| Hamilton / Burlington | GTFS-RT does not include `directionId` or `trip_headsign`. Static trips lookup (`atlas/{slug}-trips.json`) used as fallback. |
| Edmonton | LRT (Capital/Metro/Valley Line West) absent from ETS vehicle positions feed. May be on a separate undocumented feed. |
| Calgary | CTrain absent from GTFS-RT entirely — `routeId` not populated. No live data until Calgary improves their feed. |
| New Orleans RTA | No GTFS-RT feed. Custom XML API only — would need a dedicated adapter. |
| Spokane Transit (STA) | Intermittent protobuf buffer overflow from their server returning malformed/truncated responses. Would match 100% when healthy. |

---

## History Archiving

Cloudflare Worker (`workers/gtfs-rt-archiver/`) archives GTFS-RT snapshots every 5 minutes into the `atlas-live` R2 bucket. 30-day rolling retention. Powers the History tab.

| Agency | Slug | Status |
|--------|------|--------|
| Burlington Transit | `burlington` | Active |
| Hamilton Street Railway | `hamilton` | Active |

All other agencies: static history snapshots only (headway diffs via `atlas-archive`, written on each pipeline refresh).

---

## Notes

- **511 SF Bay API key**: one key covers SF Muni (`SF`), AC Transit (`AC`), and VTA (`SC`). Atlas uses `MUNI_511_API_KEY` and the provider's `api_key` query parameter.
- **TTC trip IDs**: Clever Devices RT trip IDs don't match Toronto Open Data static IDs — time-based spatial fallback required. ~20% direct match rate.
- **Halifax trip IDs**: RT trip IDs differ from static — spatial fallback handles matching.

---

[Back to Data](./DATA.md)
