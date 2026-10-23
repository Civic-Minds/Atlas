# TTC streetcar stop spacing

**Status:** not verified by Atlas. Computed outside the repo by a one-off Python script; there is no git history. Atlas does not use this data.

Snapshot date: `2026-04-15` (file last-modified dates; the script and CSVs were written 2026-04-15 09:25-09:26)
Source: a local folder ("TTC Stop Spacing", no git). The study was built from the Toronto Transit Commission (TTC) GTFS feed; the feed's version or download date is not recorded, so the exact schedule period is unknown.
Scope: distance between consecutive stops on the TTC streetcar routes, from GTFS `shape_dist_traveled`.

## How to cite

"Atlas research, TTC streetcar stop spacing (2026-04-15), `docs/research/ttc-stop-spacing-2026-04/`. Computed from a TTC GTFS feed of unrecorded date; not verified by Atlas." Cite the per-route figures from `data/...day route summary.csv`, and say they are a distribution over stop pairs, not over riders or trips.

Headline figures (median stop-pair spacing, metres, from the summary CSV): 501 Queen 273.1, 504 King 263.5 (216 stop pairs, p10 173.3, p90 411.0), 505 Dundas 245.9, 506 Carlton 237.0, 510 Spadina 326.3, 512 St Clair 264.4. The 11 day routes range from 237.0 (506) to 326.3 (510).

## What the script measures

`scripts/ttc_streetcar_stop_spacing.py` reads `routes.txt`, `stops.txt`, `trips.txt` and `stop_times.txt` from the GTFS zip and keeps the 17 streetcar route ids (301, 304, 305, 306, 310, 312, 501, 503-512). For each trip it takes consecutive stops and subtracts `shape_dist_traveled` (km in the feed, converted to metres). Pairs with a missing or non-positive distance are skipped. Each unique (route, branch, direction, from stop, to stop) pair then gets median, mean, min and max spacing across the trips that serve it.

Steps after that:

- "cleaned" drops pairs whose from and to stop names are identical (case-insensitive), which removes duplicate or same-location stop entries.
- "day" keeps only the 11 daytime routes (501, 503-512); the 3xx routes are the overnight (Blue Night) streetcar routes and are excluded.
- The route summary takes the `spacing_m_median` of each cleaned day row and computes, per route, the count, mean, median, 10th and 90th percentile, min and max. So it is a summary of stop-pair medians. Each row is one branch and direction pair, so a stop pair served in both directions or by several branches counts once per row, and each pair is weighted equally regardless of trip count.

## Input data

GTFS zip: `Toronto Transit Commission (TTC).zip`, hard-coded in the script as an absolute path into a local copy of the GTFS archive. That file is not in this folder, and the path does not exist on the machine this was archived from at the time of copying. The script also writes all five output CSVs next to that zip (also hard-coded).

## How to run

The script has hard-coded absolute paths (the zip above and all outputs beside it). Edit `GTFS_ZIP` at the top to point at a TTC GTFS zip, then run `python3 scripts/ttc_streetcar_stop_spacing.py`. It needs Python 3.10 or later (uses `float | None`) and only the standard library. It prints the row count for each file it writes. Atlas keeps its own TTC feed; a current Atlas-side copy can replace the missing zip, but results will differ from the April figures if the schedule has changed.

## What is in this folder

| Path | What it is | Rows |
| --- | --- | --- |
| `scripts/ttc_streetcar_stop_spacing.py` | The script | |
| `data/Toronto Transit Commission (TTC) streetcar day stop spacing cleaned.csv` | One row per (route, branch, direction, stop pair), day routes only, same-name pairs removed. 15 columns | 1,364 |
| `data/Toronto Transit Commission (TTC) streetcar day route summary.csv` | One row per day route: pair count, mean, median, p10, p90, min, max (metres) | 11 |

## Spot checks (done at archive time)

- Both CSVs parse; the cleaned CSV has 1,364 data rows and 15 columns; the summary has 11 rows covering routes 501, 503-512.
- No cleaned row has identical from and to stop names.
- The summary was recomputed from the cleaned CSV with the script's percentile rule; all 11 routes agree on every column (no mismatches).
- Not checked: the spacing values against the GTFS feed (the zip is not available).

## Not copied

The source `archive/` subfolder (about 1.4 MB, four older CSVs from 2026-04-14 and 2026-04-15), all superseded by the files above:

- `Toronto Transit Commission (TTC) streetcar day stop spacing.csv`, 176,123 bytes: the same as the cleaned day file before same-name pairs were removed.
- `Toronto Transit Commission (TTC) streetcar route summary.csv`, 1,050 bytes: summary over all 17 streetcar routes, earlier run.
- `Toronto Transit Commission (TTC) streetcar stop spacing cleaned 2.csv`, 263,347 bytes: all-routes cleaned file, earlier run.
- `Toronto Transit Commission (TTC) streetcar stop spacing.csv`, 264,014 bytes: all-routes raw file, earlier run.

The script can regenerate all of these. The source folder is untouched.
