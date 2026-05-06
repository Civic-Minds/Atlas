# Atlas — Claude Working Notes

Atlas is a transit intelligence platform. It ingests GTFS feeds, runs them through a multi-phase analysis pipeline, and produces frequency tier ratings and corridor maps for transit routes.

## OCI Production Server

See [`docs/SERVER.md`](./docs/SERVER.md) for SSH access, DB URLs, deploy workflow, PM2 command, and zombie query fix.

Atlas production runs on OCI — local Postgres is decommissioned. Turning off a local machine does not affect live data. Older "Discovery Lab" / `atlas_lab` notes are not the authoritative runtime path.

## Key Paths

- `src/core/` — pipeline logic (phase1 = raw departures, phase2 = tier analysis, calendar, corridors, spacing)
- `src/types/gtfs.ts` — all GTFS and analysis types
- `scripts/test-gtfs-pipeline.ts` — smoke test a single feed: `npx tsx scripts/test-gtfs-pipeline.ts /path/to/feed.zip`
- `scripts/accuracy-snapshot.ts` — benchmark accuracy across 3 known-good feeds (see below)
- `gtfs-test-log.md` — running log of every real-world feed tested; update this after each session

## External Tracking

**AtlasLog** — Notion portfolio tracker for resume-worthy technical work. See [`ATLASLOG.md`](./ATLASLOG.md) for what belongs there, entry format, and the AI assistant rule.

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
