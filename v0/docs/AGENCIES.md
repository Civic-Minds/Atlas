# Tracked Agencies

Live registry of agencies being polled by Atlas NextGen. Route filters are defined in `server/src/config.ts`.

**Last updated 2026-04-20:** 20 agencies active on OCI. Beta validation running on Halifax and Spokane (full-network). All others are data collection only — partial route filters, no static GTFS, delay matching disabled.

---

## Tier 1 — Full Network (Beta Validation)

Full GTFS-RT polling (no route filter) + static GTFS loaded + stop_times present. These are the agencies the matching pipeline is being validated against.

| Agency | ID | Region | Static GTFS | Notes |
|--------|----|--------|-------------|-------|
| Halifax Transit | `halifax` | Nova Scotia, CA | ✓ (re-imported 2026-04-20, stop_times populated) | Static URL: `https://gtfs.halifax.ca/Static/google_transit.zip`. RT trip IDs differ from static — time-based spatial fallback handles matching. |
| Spokane Transit Authority | `sta` | Spokane, WA | ✓ (2026-04-16, 434k stop_times) | 100% match rate when feed is healthy. Intermittent protobuf buffer overflow from Spokane's server — not fixable on our end. |

---

## Tier 2 — Partial Network + Static GTFS

Filtered to key routes. Static GTFS and stop_times loaded. Matching is active but trip IDs may mismatch (time-based fallback applies).

| Agency | ID | Region | Routes | Static GTFS | Notes |
|--------|----|--------|--------|-------------|-------|
| Toronto Transit Commission | `ttc` | Ontario, CA | 501, 504–512 (streetcars) + Line 6 Finch West LRT | ✓ (2026-04-10, 4.3M stop_times) | Clever Devices RT trip IDs don't match Toronto Open Data static IDs — ~20% match rate via spatial fallback. |

---

## Tier 3 — Partial Network, Data Collection Only

Filtered to key routes. No static GTFS loaded — delay_seconds is always null, matching is skipped. Collecting raw vehicle positions for future analysis once static is imported.

| Agency | ID | Region | Routes |
|--------|----|--------|--------|
| AC Transit | `actransit` | East Bay, CA | Tempo BRT (1T) + 51A + 72R |
| Durham Region Transit | `drt` | Ontario, CA | PULSE BRT: 900, 901, 915, 916 + N1, N2 |
| Edmonton Transit System | `edmonton` | Alberta, CA | Routes 4, 8, 9 (LRT absent from feed) |
| Greater Cleveland RTA | `gcrta` | Cleveland, OH | HealthLine (6), Red/Blue/Green Lines (66/67/68) |
| MBTA | `mbta` | Boston, MA | Green Line B/C/D/E + Routes 28, 66, 23, 39 + Silver Line SL1–SL5 |
| Metro Transit | `metrotransit` | Minneapolis-Saint Paul, MN | Arterial BRT A–E (921–925), Freeway BRT (903/904/905) |
| Milwaukee County Transit System | `mcts` | Milwaukee, WI | CONNECT 1 (CN1), MetroEXpress BLU/GRE/RED/PUR + Route 30 |
| MTA New York City Bus | `mtabus` | New York, NY | All SBS routes (Bx6, Bx12, Bx41, B44, B46, B82, M14A/D, M15, M23, M34/A, M60, M79, M86, Q44, Q52/53, Q70, S79) |
| OC Transpo | `octranspo` | Ottawa, CA | Transitway BRT: 12, 14, 39, 57, 58, 61, 62, 63, 75, 90, 98, 99 |
| San Diego MTS | `sdmts` | San Diego, CA | SuperLoop + Rapid + Rapid Express (201/202/204/215/225/227/235/237/280/290) |
| SEPTA | `septa` | Philadelphia, PA | Trolleys T1–T5, G1 + Route 23 |
| SF Muni | `muni` | San Francisco, CA | Muni Metro (J/K/L/M/N/T) + Van Ness BRT (49) + Rapid (38R/14R/5R/9R) |
| TransLink | `translink` | Metro Vancouver, CA | RapidBus R1–R5 + 99 B-Line + Route 25 |
| TriMet | `trimet` | Portland, OR | FX2-Division (2), Route 72, MAX (90/100/190/200/290), Streetcar (193/194/195) |
| VTA | `vta` | Santa Clara, CA | Rapid 522, 523, 500, 568 |
| WeGo Public Transit | `wego` | Nashville, TN | Frequent Network: 3, 7, 22, 23, 50, 52, 55, 56 |

---

## Known Feed Issues

- **MetroTransit** — Persistent HTTP 404 on `vehiclepositions.pb`. Feed URL may have changed — verify against current developer portal.
- **WeGo** — Alternating 404s and 500s from Nashville's server. Intermittent; outside our control.
- **GCRTA** — Intermittent `fetch failed` and 500s. Feed reliability issue on their end.
- **STA** — Intermittent protobuf buffer overflow (`index out of range: 8192 + N > 8192`) from Spokane's server returning malformed/truncated responses. Matches 100% when feed is healthy.
- **SDMTS** — Intermittent `fetch failed`. Likely network-level instability on their end.

---

## Key In Hand — Not Yet Activated

- **King County Metro** (`kcm`) — OBA key stored as `OBA_API_KEY`. Feed returning 0 vehicles at peak — likely route_id prefix mismatch (`1_100512` etc.). Verify IDs against live feed before enabling.
- **Sound Transit** (`soundtransit`) — Same OBA key. Route filter uses `40_512`, `40_545` — unverified.
- **LA Metro Rail** (`lametro`) — A Line (801), E Line (804). Swiftly key is in `.env` (`SWIFTLY_API_KEY`) — was active but Swiftly key covers lametro only, not Miami/Vegas.

---

## Access Requested

_(none currently pending)_

---

## Not Yet Requested

- **CTA (Chicago)** — API key in hand, but feed is non-standard JSON (not GTFS-RT protobuf). Needs custom adapter.
- **Foothill Transit** — Silver Streak (`20707`). Requires IP whitelist — email info@foothilltransit.org.
- **Madison Metro Transit** — Rapid Route A. Free key at [metromap.cityofmadison.com/dev-account](https://metromap.cityofmadison.com/dev-account).
- **Miami-Dade Transit** / **RTC Southern Nevada** — Swiftly. Same form as LA Metro. Same key once activated.

---

## Notes

- **511 SF Bay API key**: One key covers SF Muni, AC Transit, and VTA. BART, Caltrain, and SamTrans could be added at no extra cost.
- **Edmonton LRT**: Capital/Metro/Valley Line West absent from ETS vehicle positions feed. May be on a separate feed. Route IDs are zero-padded in feed (route 4 = `004`).
- **Halifax route 320**: Airport route — confirmed present in static GTFS, should match via fallback.
- **Calgary Transit**: CTrain absent from GTFS-RT entirely; routeId not populated. Skipping until Calgary improves their data.
- **New Orleans RTA**: No GTFS-RT feed. Custom XML API only. Would need a custom adapter.

---

[Back to Roadmap](../ROADMAP.md)
