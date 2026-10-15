# Catalog scan

Before/after check for a pipeline change: run the pipeline of two checkouts over the same feed
zips, then list every line whose headline, tier or other output moved.

## Files

- `drive.sh`: scans a list of agencies with one checkout, a few agencies per process, waiting while memory is low.
- `scan.mts`: the per-process scanner `drive.sh` calls. It writes one summary JSON per agency.
- `diff.py`: changes per agency and per line, every changed property. It writes `<branchOut>.diff.json`.
- `report.py`: headline and tier summary: lost and gained headlines, biggest moves, tier ups and downs by transition and agency. `report.py route-values` compares route-level values (below).
- `route-values.mts` + `routeValues.ts`: per-route filter values from a reprocess output folder, read with the filter rule of the checkout being judged.

## Inputs

- **Two checkouts with `node_modules`**: one at the base (usually `origin/main`) and one at the branch. Use git worktrees.
- **Feed zips**: `<zips>/<slug>/*.zip`. The newest file by modification time is used. Supplemental feeds go in `<zips>/<slug>--supplemental-<n>/`, numbered as in the agency's `supplementalFeedUrls`. Both runs must read the same zips.
- **A slugs file**: one agency slug per line, matching `config/agencies/<slug>.json`.

## Run

```zsh
SCAN=scripts/catalog-scan            # from this checkout; the scanned trees can be older
OUT=/path/to/scan-output             # outside the repo
ZIPS=/path/to/zips
$SCAN/drive.sh ../Atlas-worktrees/base   $OUT/base   $OUT/slugs.txt $ZIPS
$SCAN/drive.sh ../Atlas-worktrees/branch $OUT/branch $OUT/slugs.txt $ZIPS
python3 $SCAN/diff.py   $OUT/base $OUT/branch            # optional slugs after the dirs limit it
python3 $SCAN/report.py $OUT/base $OUT/branch $OUT/report.json > $OUT/report.txt
```

- `drive.sh` takes an optional fifth argument, the number of agencies per process (default 6).
- Progress goes to `<out>.log`, and `<out>.DONE` appears when the scan finishes.
- An agency that already has its output JSON is skipped, so rerunning a stopped scan resumes it. Delete the output dir to rescan.
- Set `TRACE_ALL=1` to keep every pipeline trace entry in the output.

The full catalog (about 320 agencies) takes a few hours per checkout. Run it at normal priority, not
`taskpolicy -b`, which starves the scan on macOS. Run one scan at a time.

## Reading the report

- `report.py` counts headline moves (`headway`) and tier changes per line. A line's key is `route|direction|day|headsign|variant|branch`.
- "TIER DOWN" means the branch rates a line worse than the base.
- Hand-check every down move, and every lost headline, against the GTFS before merging. The map must never show a route better than riders get. A down move can still be wrong-low.
- `report.json` holds the full lists (`up`, `down`, `nones`, `moves`, `gained`) for those checks.

## Route values (route-level, not per row)

`report.py`'s headline count only sees each row's own headline. The map filters on the route's worst-direction value, so
use the route-level report for filter and Night changes (frequency-focus-plan step 0). It reads reprocess output
(`<dir>/<slug>/<slug>.json`, e.g. the B0 dry run or `npm run reprocess-derived-artifacts -- --only-slug ...` output),
not scan.mts output.

```zsh
RV=scripts/catalog-scan
# one run per checkout: the filter rule comes from that checkout's shared/routeHeadwayFilter.ts
(cd ../Atlas-worktrees/base   && npx tsx $PWD/../focus-step0-tooling/$RV/route-values.mts $PWD /path/to/base-derived   $OUT/rv-base   ttc cta)
(cd ../Atlas-worktrees/branch && npx tsx $PWD/../focus-step0-tooling/$RV/route-values.mts $PWD /path/to/branch-derived $OUT/rv-branch ttc cta)
python3 $RV/report.py route-values $OUT/rv-base $OUT/rv-branch [--json rows.json] [--limit 40] [--slugs ttc,cta]
```

- Without slugs, `route-values.mts` reads every agency folder in the derived dir; an agency whose output exists is skipped.
- Per route (route id, branch), day and period (`all`, amPeak, midday, pmPeak, evening, late, overnight) it records `wdph` (worst-direction
  headway), `wdpch` (worst-direction full-window wait), the filter's own value, and which of 10/15/20/30/60 the route passes (some feature
  passes, as the map draws it). `mixed` marks features that disagree on the value.
- Night: 30 and 60 per route direction, and route-level 30/60 = every direction passes (a single-direction route counts as one).
- The report prints rows changed, by agency, by period, threshold flips (e.g. `15 pass->fail`), then the first rows; identical runs print 0 rows.

## GTFS oracle

`scripts/handcheck/stretch-departures.py <slug> <route> <day> <start> <end> [--stop ID] [--date YYYY-MM-DD] [--zip PATH]` reads the
feed zip directly (no pipeline code) and prints, per direction, the patterns, the main stretch, and the departures in the window at the
stretch's dispatch end (or `--stop`): count, max gap, and the gap at each edge. Feed lookup: `--zip`, `Atlas-worktrees/_feeds/<slug>.zip`,
`_feeds/<slug>/*.zip`, then `_live-data/gtfs/<slug>.zip`. Example (the Night hand-check): `stretch-departures.py ttc 320 Weekday 2 6 --stop 8981`
gives 29 departures, max gap 15, edges 4 and 20 in direction 0.
