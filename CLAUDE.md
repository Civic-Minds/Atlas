# Atlas — Claude Working Notes

Atlas is a transit intelligence platform. It ingests GTFS feeds, runs them through a multi-phase analysis pipeline, and produces frequency tier ratings and corridor maps for transit routes.

## Key Paths

- `src/core/` — pipeline logic (phase1 = raw departures, phase2 = tier analysis, calendar, corridors, spacing)
- `src/types/gtfs.ts` — all GTFS and analysis types
- `scripts/test-gtfs-pipeline.ts` — smoke test a single feed: `npx tsx scripts/test-gtfs-pipeline.ts /path/to/feed.zip`
- `scripts/accuracy-snapshot.ts` — benchmark accuracy across 3 known-good feeds (see below)
- `gtfs-test-log.md` — running log of every real-world feed tested; update this after each session

## External Tracking

**AtlasLog** — Notion database that tracks Atlas development history, testing sessions, and notable findings. Update it alongside `gtfs-test-log.md` when significant testing or bug fixes happen.

## Accuracy Snapshot Workflow

Before making any changes to `src/`, capture a baseline:

```bash
npx tsx scripts/accuracy-snapshot.ts > /tmp/atlas-snapshot-before.json
```

After changes, compare:

```bash
npx tsx scripts/accuracy-snapshot.ts --compare
```

This is automated via a PreToolUse hook — the baseline is captured automatically on the first edit to `src/` in each session. The metric is `routesWithDepartures / totalRoutes` across YRT, Phoenix Valley Metro, and Calgary Transit. Absolute percentages are low (many routes in GTFS have no active service for the reference date) — the delta is what matters.

## Known Open Issues

- **Large feeds** (Paris IDFM, NYC Subway, Netherlands OVapi): `stop_times.txt` decompresses past Node.js max string length. Needs a streaming CSV parser path in `parseGtfs.ts` for files with 5M+ stop_time records.
- Corrupt zips in the data folder (GO Transit, Ottawa OC Transpo, Sydney NSW, UK National Rail, Ireland TFI) — skip these.

## GTFS Data

Test feeds live at `/Users/ryan/Desktop/Data/GTFS/` organized by country/region.
