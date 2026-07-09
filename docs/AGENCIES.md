# Agencies

Reference for Atlas agency coverage across static data, live polling, and history archiving.

---

## Static Coverage

414 agencies as of July 9, 2026.

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

### Keys In Hand — Not Yet Wired Up

| Agency | Slug | Key Type | Notes |
|--------|------|----------|-------|
| King County Metro | `kcm` | OBA key stored | Feed was returning 0 vehicles at peak — likely route_id prefix mismatch (`1_100512` etc.). Verify IDs against live feed before enabling. |
| Sound Transit | `soundtransit` | Same OBA key | Route filter uses `40_512`, `40_545` — unverified. |
| LA Metro Rail | `lametro` | Swiftly key | A Line (801), E Line (804). Key covers LA Metro only, not Miami/Vegas. |

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

- **511 SF Bay API key**: one key covers SF Muni, AC Transit, and VTA. BART, Caltrain, and SamTrans could be added to live polling at no extra cost.
- **TTC trip IDs**: Clever Devices RT trip IDs don't match Toronto Open Data static IDs — time-based spatial fallback required. ~20% direct match rate.
- **Halifax trip IDs**: RT trip IDs differ from static — spatial fallback handles matching.

---

[Back to Roadmap](../ROADMAP.md)
