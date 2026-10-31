# Updating the map

Maintainer and contributor runbook for keeping already-published agencies current: refreshing feeds and publishing map artifacts for multiple agencies at once. This is repository documentation, not user-facing product documentation.

See [`ADDING_AGENCIES.md`](ADDING_AGENCIES.md) for onboarding a brand-new agency (including the full PMTiles rebuild/verify explanation this doc assumes) and [`COVERAGE_GAP_DISCOVERY.md`](COVERAGE_GAP_DISCOVERY.md) for finding new candidates.

## Batch processing and publishing

Same procedure as adding a single agency (see [`ADDING_AGENCIES.md`](ADDING_AGENCIES.md) § Integrating a new transit agency), applied to multiple agencies at once:

1. Identify candidates with coverage-gap discovery.
2. Process new agencies and update `config/agencies/`.
3. Run `npm run build:agency-index`.
4. Refresh the new slugs and publish one data release:
   ```bash
   npm run refresh-release -- slug1 slug2 slug3 --force
   ```
   What this runs, and the release gate, is described once under [Manual feed refreshes](#manual-feed-refreshes) below. The release step is never optional: see [`ADDING_AGENCIES.md`](ADDING_AGENCIES.md) § Integrating a new transit agency step 7 (it fails silently, not loudly, when skipped).
5. Record product additions in `CHANGELOG.md` and mark backlog items `done` in `docs/data/AGENCY_BACKLOG.md`.

### Manual feed refreshes

For a targeted production refresh, use the complete pipeline command:

```bash
npm run refresh-release -- translink
npm run refresh-release -- translink --force  # only when the source is known current
```

`refresh-release` runs `refresh`, `build-pmtiles` (which checks tile coverage locally before uploading), `verify-pmtiles-remote`, `build-history`, and `publish-data-release`, in that order: it refreshes the GTFS feed, rebuilds the PMTiles and History artifacts, verifies coverage, and publishes one final data release. This section is the one full description of that flow; other docs link here. Do not upload `atlas.pmtiles` with `upload-pmtiles` or `rclone`: standalone tile uploads are not paired with agency data and refuse without `--allow-unpaired-pmtiles-upload`. Refresh refuses any agency flagged red by the [release diff gate](../operations/DATA_REPROCESSING.md#release-diff-gate), for example one that would lose more than 20% of its live stops, stop points or routes. Its live data stays as is, and `refresh-release` then stops before PMTiles. `publish-data-release` runs the same gate over the whole release before the pointer moves. After review, accept a flag with `--allow <slug>:<flag>`, or reviewed drops with `--allow-drop` (with specific slugs). `refresh-release` forwards both forms to the publish step. Do not use `npm run build-pmtiles` by itself to update schedule data: it only repackages the agency artifacts that are already published and does not download any feeds. Use the lower-level commands separately only when intentionally rebuilding derived artifacts from unchanged source data.

`build-pmtiles` uploads an immutable release under `atlas/releases/{id}/` containing the PMTiles archives and the agency route artifacts used to build them. `publish-data-release` then moves `atlas/release.json` to that release, only when the tiles and agency data carry the same release ID. The frontend reads that pointer so the map and route cards use one data generation. Do not manually bump `atlas/data-version.json` during a feed refresh; `publish-data-release` bumps it after moving the pointer.

**Search index retention** (CIV-1056): the search files under `atlas/search/` are shared between releases, so they are kept by reference: a file stays while any release still in R2 names it, which matches the release retention above (the live release plus the previous two, and any newer unpublished upload). Files uploaded in the last 24 hours are never deleted. `publish-data-release` runs the search prune as a dry run after the release prune unless it is given `--prune-search`; `npm run prune-search-index` does the same on its own and deletes only with `--apply`. Both delete from the live bucket: get Ryan's go first.

**Rolling back the pointer** (CIV-521): `npm run rollback-data-release -- --to <releaseId>` (or `--from-file <saved release.json>`) points `atlas/release.json` back at an earlier release and bumps `atlas/data-version.json`. It is a dry run unless you pass `--apply`: the dry run reads only public URLs, prints what is public now, the target, and the two writes it would make. It refuses when any of the target's files are gone (prune keeps the live release plus the previous ones, so only those are restorable), when the target was built for another route schema or tile rules than the checked-out code, when it is already public, or when it is newer than the public release (a forward move goes through `publish-data-release` and its gates). It deletes nothing under `atlas/releases/`, leaves the per-agency top-level files and `atlas/release-history.json` as they are, and does not run the release diff gate. `--apply` writes to the live bucket: treat it like any R2 write and get Ryan's go first.

If a release build fails, the previous `atlas/release.json` remains active. This is intentional: a failed or partial refresh must not become a public map/data combination.

To regenerate derived artifacts from archived feeds without downloading new ones (including hidden agencies), see [`DATA_REPROCESSING.md`](../operations/DATA_REPROCESSING.md). Full rebuilds run in the cloud by default with the `rebuild-release.yml` workflow (dry run, then publish); keep local runs for exact before/after scans and small checks.

For a small local check without writing to R2, run `npm run build-pmtiles -- --dry-run`. The command still downloads the current public artifacts and runs the real tippecanoe/tile-join build, but leaves the result at `tmp/geojson-build/atlas.pmtiles` for inspection. To see it on the local map, copy `tmp/geojson-build/atlas.pmtiles` to `tmp/atlas-pmtiles-preview.pmtiles` and `tmp/geojson-build/atlas-overview.pmtiles` to `tmp/atlas-overview-pmtiles-preview.pmtiles`, then start the dev server with `VITE_USE_LOCAL_PREVIEWS=true`. Without that setting, the dev map loads the published release's tiles. Add `--only-slug <slug>` for a quick partial build (CIV-1164).
