# GTHA frequent transit coverage (March 2026 script)

**Status:** early exploratory script, not verified by Atlas. It has no results: the source folder holds no outputs, and nothing here was run.

Date: `2026-03-26` (last edited; the source folder has no git history, so no commit list exists)
Source: a plain local folder (`Research/Scripts/gtha-frequent-transit`), not a git repository.
Scope: share of Greater Toronto and Hamilton Area population within an 800 m walk of a stop on a route running every 15 minutes or better in the 7:00-9:00 AM peak. Eight local agencies (TTC, Brampton Transit, MiWay, YRT/Viva, DRT, Burlington Transit, HSR, Oakville Transit); GO Transit left out on purpose.

## How this relates to Atlas

Atlas does not use this script or any figure from it, and no Atlas product decision depends on it. It is an early version of the idea behind [Canada Transit Coverage](../canada-transit-coverage-2026-09/README.md) (written six months later, on Atlas's published data, 10-minute walk, 15 and 30 minute service, all-day window). Kept here so the earlier approach is not lost.

## Running it

The four numbered scripts run in order (`01_download_feeds.py` to `04_coverage.py`); the source README (`source-README.md`) has the steps. Notes from reading the code, not from running it:

- Scripts compile (syntax check only). They were not run.
- `scripts/02_find_frequent.py` has one hard-coded absolute path to the author's machine, `/Users/ryan/Desktop/Data/GTFS/Canada/Ontario`, used as a fallback feed folder. It will not exist elsewhere.
- The feed download URLs in `01_download_feeds.py` are from March 2026 and may have changed; the source README says some need a manual download.
- Step 4 needs Statistics Canada 2021 census files that were never copied into the source folder.
- Python dependencies are in `requirements.txt`.

## What is in this folder

| Path | What it is |
| --- | --- |
| `source-README.md` | The source folder's own README, unchanged |
| `requirements.txt` | Python dependencies, unchanged |
| `scripts/01_download_feeds.py` to `scripts/04_coverage.py` | The four pipeline scripts, unchanged |

Not copied: `.DS_Store`; the empty `data/gtfs/` and `data/census/` folders; the empty `output/` folder. The source held no data files at all (the whole folder is about 36 KB).
