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
   This runs refresh, `build-pmtiles` (which checks tile coverage locally before uploading), `verify-pmtiles-remote`, `build-history`, and `publish-data-release` — see [`ADDING_AGENCIES.md`](ADDING_AGENCIES.md) § Integrating a new transit agency step 7 for why the release step is never optional (it fails silently, not loudly, when skipped). Do not upload `atlas.pmtiles` with `upload-pmtiles` or `rclone`; standalone tile uploads are not paired with agency data and refuse without `--allow-unpaired-pmtiles-upload`.
5. Record product additions in `CHANGELOG.md` and mark backlog items `done` in `docs/data/AGENCY_BACKLOG.md`.

### Manual feed refreshes

For a targeted production refresh, use the complete pipeline command:

```bash
npm run refresh-release -- translink
npm run refresh-release -- translink --force  # only when the source is known current
```

This refreshes the GTFS feed, rebuilds the PMTiles and History artifacts, verifies coverage, and publishes one final data release. Refresh refuses any agency flagged red by the [release diff gate](../operations/DATA_REPROCESSING.md#release-diff-gate), for example one that would lose more than 20% of its live stops, stop points or routes. Its live data stays as is, and `refresh-release` then stops before PMTiles. `publish-data-release` runs the same gate over the whole release before the pointer moves. After review, accept a flag with `--allow <slug>:<flag>`, or reviewed drops with `--allow-drop` (with specific slugs). `refresh-release` forwards both forms to the publish step. Do not use `npm run build-pmtiles` by itself to update schedule data: it only repackages the agency artifacts that are already published and does not download any feeds. Use the lower-level commands separately only when intentionally rebuilding derived artifacts from unchanged source data.

`build-pmtiles` uploads an immutable release under `atlas/releases/{id}/` containing the PMTiles archives and the agency route artifacts used to build them. `publish-data-release` then moves `atlas/release.json` to that release, only when the tiles and agency data carry the same release ID. The frontend reads that pointer so the map and route cards use one data generation. Do not manually bump `atlas/data-version.json` during a feed refresh; `publish-data-release` bumps it after moving the pointer.

If a release build fails, the previous `atlas/release.json` remains active. This is intentional: a failed or partial refresh must not become a public map/data combination.

To regenerate derived artifacts from archived feeds without downloading new ones (including hidden agencies), see [`DATA_REPROCESSING.md`](../operations/DATA_REPROCESSING.md).

For a local rebuild check without writing to R2, run `npm run build-pmtiles -- --dry-run`. The command still downloads the current public artifacts and runs the real tippecanoe/tile-join build, but leaves the result at `tmp/geojson-build/atlas.pmtiles` for inspection.

---

[Back to Data](../DATA.md)
