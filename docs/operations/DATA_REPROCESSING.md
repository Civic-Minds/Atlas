# Reprocessing shared route data

Use this workflow when `process-core.ts` adds or changes a derived route field. A PMTiles rebuild alone is not enough: it only packages the already-published route JSON, and the normal refresh skips feeds whose schedule identity has not changed.

## Dry run

This reads the newest archived GTFS snapshot for every production-visible agency and writes regenerated artifacts to `tmp/derived-reprocess/`:

```bash
npm run reprocess-derived-artifacts
ATLAS_LOCAL_PREVIEW_DIR=tmp/derived-reprocess npm run build-pmtiles -- --dry-run
```

Review `tmp/derived-reprocess/report.json`. The PMTiles build must succeed for the complete catalog; an old agency artifact fails the schema gate instead of being silently repackaged.

The reprocess fails closed per agency: it refuses (and writes nothing) when the newest archived zip cannot be identified, when its service dates are expired or older than the live feed's, or when the output would lose more than 20% of the live stops or routes. Pass `--allow-drop` only to accept a reviewed drop. Limit a run with `--only-slug <slug>` (repeatable). Hidden agencies are skipped unless named with `--only-slug <slug> --include-hidden`; they stay hidden and only their R2 artifacts are corrected.

If the report contains missing raw archives, recover and validate local inputs
before retrying the reprocess:

```bash
npm run recover-local-archive-inputs
ATLAS_LOCAL_ARCHIVE_DIR=tmp/derived-reprocess-inputs \
  NODE_OPTIONS='--max-old-space-size=8192' \
  REPROCESS_CONCURRENCY=2 npm run reprocess-derived-artifacts
```

Manually reviewed replacement URLs can be supplied without changing the
registry or R2:

```bash
npm run recover-local-archive-inputs -- --sources-file=tmp/source-overrides.json
```

The recovery report records the URL, feed dates, feature count, quality score,
and any unresolved blocker. A recovered local input is not approval to publish
it.

## Publish

After reviewing the dry-run report, publish the regenerated agency artifacts and then rebuild the verified release:

```bash
npm run reprocess-derived-artifacts -- --write
npm run build-pmtiles -- --allow-stale-data
npm run verify-pmtiles-remote
npm run build-history
npm run publish-data-release
```

A reprocess does not leave the refresh handoff marker that `build-pmtiles` normally requires, so this intentional repack needs `--allow-stale-data`. `build-pmtiles` checks full agency coverage locally before uploading an immutable release under `atlas/releases/{id}/`; `verify-pmtiles-remote` smoke-tests the upload, and only `publish-data-release` moves `atlas/release.json` to make it live.

These commands write public R2 data. Get explicit approval immediately before running the `--write` or publish commands.
