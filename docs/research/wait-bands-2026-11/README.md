# Wait bands, 2026-11

Snapshot date: `2026-11-14`  
Scope: every public agency in release `release-mwgrzbgq` (547 agencies: 459 United States, 88 Canada)

## Purpose

The data step behind the research pitches in CIV-1188. For every agency, day type and period, it records the share of route-km in each wait band (every 10, 15, 20, 30 or 60 minutes, slower than 60, or no service), judged by the map's own frequency filter. It replaces the fall-off study's single "every 15" cutoff with seven bands.

## Canonical files

| File | Purpose |
|---|---|
| `wait-bands.csv` (workflow artifact only) | One row per agency, day, period and band: `slug, name, country, day, period, band, route_km, share_pct, routes, release_id, code_version`. 68,922 rows, 9 MB, so it isn't in git. It is the `wait-bands` artifact of GitHub Actions run 43650661987. Re-run with a `dryrun/civ-1188-*` tag. |
| `agencies.csv` | One row per agency: total route-km, routes counted, routes left out as irregular. |
| `country-summary.csv` | The same bands summed by country, day and period (route-km, share, routes). |
| `run.json` | Release, code version, counts and run time. |
| `src/wait-band-pass.ts` | The script. `.github/workflows/wait-band-pass.yml` runs it in the cloud, read-only. |

## Method

- Source: the published release only (`atlas/release.json` and each agency's route file), read through public URLs. Nothing is written to R2.
- Rules: the map's own filter, imported from a checkout at the release's `codeVersion` (`53e20dd`). The worst direction decides, and patterns hidden by default as irregular are left out, as in the [fall-off study](../falloff-2026-10/REPORT.md).
- Bands: a route's band is the smallest of 10, 15, 20, 30 and 60 at which the map would draw it for that day and period. "Slower than 60" means it runs in the period but passes no band. "No service" means it doesn't run then.
- Length: a route is its short name (or ID) plus branch, measured by its longest drawn pattern. Directions are never added together.
- Periods are the map's periods (AM peak, midday, PM peak, evening, late, overnight), not clock hours.
- Plan: `Atlas/editorial/drafts/wait-band-pass-plan.md` (not in git).

## Status

- Agencies counted: 547 of 547; none failed to download.
- 7 agencies have no countable route-km: `ace`, `taft` and `westberkeley` (their only route is hidden as irregular), and `bustang-outrider`, `mountain-village`, `pemberton` and `telluride` (no drawn route lines in the release). Their band rows are all zero.
- Large irregular exclusions skew some agencies: Calgary leaves out 124 routes (137 counted), Rochester RTS 101 (27 counted), OC Transpo 80 (94), RTL 77 (71), Edmonton 72 (168), York Region 61 (62), STLévis 57 (19). Their shares describe the regular network only.
- The 3-agency sample in the plan matches this run (MARTA and MiWay identical at weekday AM peak; TTC within about a point on the newer release).

## First read (share of route-km)

| Country | Moment | Every 15 or better | No service |
|---|---|---:|---:|
| Canada | Weekday AM peak | 12.2% | 15.4% |
| Canada | Weekday evening | 5.1% | 35.8% |
| Canada | Sunday evening | 3.8% | 51.8% |
| United States | Weekday AM peak | 9.2% | 12.5% |
| United States | Weekday evening | 2.8% | 43.2% |
| United States | Sunday evening | 1.8% | 62.0% |

## Caveats

- Scheduled service only, not what actually ran.
- "No service" is its own band and must never be folded into "slow"; much of it is night and peak-only routes counted at full length when they don't run.
- Shared trunks and branched routes carry the fall-off study's route-km caveats (branches under-counted, a shared trunk sometimes counted twice).
- Country totals are dominated by the largest systems (NJ Transit alone is 8,577 route-km).
