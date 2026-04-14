# Tracked Agencies

Live registry of agencies being polled by Atlas NextGen. Route filters are defined in `server/src/config.ts`. This file changes often as the sample grows.

**Last updated 2026-04-10:** 19 agencies live on OCI. KCM and Sound Transit deactivated — OBA key in hand but route IDs need verification before enabling.

---

## Active

| Agency | ID | Region | Type | Routes |
|--------|----|--------|------|--------|
| AC Transit | `actransit` | East Bay, CA | BRT + Rapid | Tempo BRT (1T, Uptown Oakland–San Leandro BART) + 51A (Broadway–Santa Clara) + 72R (San Pablo Rapid) |
| Durham Region Transit | `drt` | Ontario, CA | BRT | 900, 901, 915, 916 (PULSE) + N1, N2 overnight |
| Edmonton Transit System | `edmonton` | Alberta, CA | Bus | Routes 4, 8, 9 (busiest corridors; LRT absent from feed) |
| Greater Cleveland RTA | `gcrta` | Cleveland, OH | BRT + Rail | HealthLine (6), Red/Blue/Green Lines (66/67/68) |
| Halifax Transit | `halifax` | Nova Scotia, CA | Bus | Route 1 (busiest) |
| MBTA | `mbta` | Boston, MA | LRT + Bus | Green Line B/C/D/E + Routes 28, 66, 23, 39 + Silver Line SL1–SL5 |
| Metro Transit | `metrotransit` | Minneapolis-Saint Paul, MN | BRT | Arterial BRT A–E (921–925), Freeway BRT Gold/Orange/Red (903/904/905) |
| Milwaukee County Transit System | `mcts` | Milwaukee, WI | BRT + Bus | CONNECT 1 (CN1), MetroEXpress BLU/GRE/RED/PUR + Route 30 (busiest) |
| MTA New York City Bus | `mtabus` | New York, NY | BRT (Select Bus Service) | All SBS routes: Bx6, Bx12, Bx41, B44, B46, B82, M14A, M14D, M15, M23, M34, M34A, M60, M79, M86, Q44, Q52, Q53, Q70, S79 |
| OC Transpo | `octranspo` | Ottawa, CA | BRT (Transitway) | 12, 14, 39, 57, 58, 61, 62, 63, 75, 90, 98, 99 |
| San Diego MTS | `sdmts` | San Diego, CA | BRT + Rapid | SuperLoop + Rapid + Rapid Express (201/202/204/215/225/227/235/237/280/290) |
| SEPTA | `septa` | Philadelphia, PA | Surface LRT + Bus | T1–T5, G1 (trolleys) + Route 23 |
| SF Muni | `muni` | San Francisco, CA | LRT + BRT + Rapid | Muni Metro (J/K/L/M/N/T) + Van Ness BRT (49) + Rapid routes (38R, 14R, 5R, 9R) |
| Spokane Transit Authority | `sta` | Spokane, WA | BRT + Bus | City Line BRT (90), Routes 6, 9, 25, 66 (**Audit 2026-04-11: 2.48% Freedom Score**) |
| Toronto Transit Commission | `ttc` | Ontario, CA | Streetcar/LRT | 501, 504–512 (streetcars) + Line 6 Finch West LRT |
| TransLink | `translink` | Metro Vancouver, CA | RapidBus | R1–R5 (37808/38311/37809/37810/37807) + 99 B-Line (6641) |
| TriMet | `trimet` | Portland, OR | BRT + LRT + Streetcar | FX2-Division (2), Route 72, MAX (90/100/190/200/290), Streetcar (193/194/195) |
| VTA | `vta` | Santa Clara, CA | Rapid | Rapid 522 (El Camino Real), Rapid 523 (De Anza), Rapid 500 (Diridon–Berryessa), Rapid 568 (Gilroy–Diridon) |
| WeGo Public Transit | `wego` | Nashville, TN | Frequent Network | Routes 3, 7, 22, 23, 50, 52, 55, 56 (all 8 Frequent Network corridors) |

---

## Key In Hand — Not Yet Activated

- **King County Metro** (`kcm`) — OBA key stored as `OBA_API_KEY`. Route IDs need verification before enabling — feed returning 0 vehicles at peak hours, likely a route_id prefix mismatch (currently filtering on `1_100512` etc.). Confirm IDs against live feed first.
- **Sound Transit** (`soundtransit`) — Same OBA key. Same issue. Route filter uses `40_512`, `40_545` — unverified.

---

## Access Requested

- **LA Metro Rail** (`lametro`) — A Line (801), E Line (804). Requested 2026-03-27 via Swiftly [request form](https://forms.gle/hXGY6kRGAChDqWwz5). Key will also unlock Miami-Dade and Las Vegas RTC.

---

## Not Yet Requested

- **CTA (Chicago)** (`cta`) — API key in hand, but feed is non-standard JSON (not GTFS-RT protobuf). Requires a custom adapter before it can be polled.
- **Foothill Transit** (`foothilltransit`) — Silver Streak (route_id `20707`). No API key — requires IP whitelist. Email info@foothilltransit.org with your public IP.
- **Madison Metro Transit** (`madison`) — Rapid Route A. Free — [metromap.cityofmadison.com/dev-account](https://metromap.cityofmadison.com/dev-account).
- **Miami-Dade Transit** (`mdt`) — South Dade Busway (34/38), MAX corridors (2/8/36/MLK), Route 100, Route S. Swiftly — [request form](https://docs.google.com/forms/d/e/1FAIpQLScy9Jye91QPSTS3WVEU-13es0A1rT9Ep5JhAmXUZEiop7fmIw/viewform). Same key as LA Metro.
- **RTC Southern Nevada** (`rtcsnv`) — Deuce (4740, 24hr Strip), BHX (4736), SX (4737), CX (4738), DVX (4739). Swiftly — [goswift.ly/realtime-api-key](https://www.goswift.ly/realtime-api-key). Same key as LA Metro.

---

## Notes

- **511 SF Bay API key**: One key covers all Bay Area agencies — SF Muni (`SF`), AC Transit (`AC`), and VTA (`SC`) are now live. BART (`BA`), Caltrain (`CT`), and SamTrans (`SM`) could also be added with no additional key.
- **Edmonton LRT**: Capital Line, Metro Line, and Valley Line West are not present in ETS's vehicle positions feed. May be on a separate feed — investigate. Edmonton also zero-pads route IDs in their feed (route 4 = `004`).
- **Calgary Transit**: CTrain absent from GTFS-RT entirely; routeId not populated so MAX BRT can't be filtered. Skipping until Calgary improves their real-time data.
- **New Orleans RTA**: No GTFS-RT feed; custom XML API only (non-standard DMS coordinates, requires signed DLA). Would need a custom adapter.

---

[Back to Roadmap](../ROADMAP.md)
