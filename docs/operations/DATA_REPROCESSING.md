# Reprocessing shared route data

Use this workflow when `process-core.ts` adds or changes a derived route field. A PMTiles rebuild alone is not enough: it only packages the already-published route JSON, and the normal refresh skips feeds whose schedule identity has not changed.

## Dry run

This reads the newest archived GTFS snapshot for every production-visible agency and writes regenerated artifacts to `tmp/derived-reprocess/`:

```bash
npm run reprocess-derived-artifacts
ATLAS_LOCAL_PREVIEW_DIR=tmp/derived-reprocess npm run build-pmtiles -- --dry-run
```

Review `tmp/derived-reprocess/report.json`. The PMTiles build must succeed for the complete catalog; an old agency artifact now fails the schema gate instead of being silently repackaged.

## Publish

After reviewing the dry-run report, publish the regenerated agency artifacts and then rebuild the verified release:

```bash
npm run reprocess-derived-artifacts -- --write
npm run build-pmtiles
npm run verify-pmtiles-coverage
npm run build-history
npm run publish-data-release
```

These commands write public R2 data. Get explicit approval immediately before running the `--write` or publish commands.
