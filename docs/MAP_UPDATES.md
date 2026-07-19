# Updating the Map

Maintainer and contributor runbook for keeping already-published agencies current: refreshing feeds and publishing map artifacts for multiple agencies at once. This is repository documentation, not user-facing product documentation.

See [`ADDING_AGENCIES.md`](ADDING_AGENCIES.md) for onboarding a brand-new agency (including the full PMTiles rebuild/verify explanation this doc assumes) and [`COVERAGE_GAP_DISCOVERY.md`](COVERAGE_GAP_DISCOVERY.md) for finding new candidates.

## Batch Processing and Publishing

Same procedure as adding a single agency (see [`ADDING_AGENCIES.md`](ADDING_AGENCIES.md) § Integrating a New Transit Agency), applied to multiple agencies at once:

1. Identify candidates with coverage-gap discovery.
2. Process new agencies and update `config/agencies/`.
3. Run `npm run build:agency-index`.
4. Refresh new slugs together:
   ```bash
   npm run refresh -- slug1 slug2 slug3 --force
   ```
5. Rebuild and upload the PMTiles archive (`npm run build-pmtiles` then `npm run upload-pmtiles`), then run `npm run verify-pmtiles-coverage` — see [`ADDING_AGENCIES.md`](ADDING_AGENCIES.md) § Integrating a New Transit Agency step 7 for why this is never optional (it fails silently, not loudly, when skipped).
6. Record product additions in `CHANGELOG.md` and mark backlog items `done` in `docs/AGENCY_BACKLOG.md`.

---

[Back to Data](./DATA.md)
