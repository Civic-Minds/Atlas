# Atlas Pipeline Operations

Maintainer and contributor runbooks for adding agencies, discovering coverage gaps, refreshing feeds, and publishing map artifacts. This is repository documentation, not user-facing product documentation.

This is the single canonical procedure for adding or updating an agency — [`ADDING_AGENCIES.md`](ADDING_AGENCIES.md) and [`AGENCY_BACKLOG.md`](AGENCY_BACKLOG.md) § Workflow both point here rather than restating these steps, so there's one source of truth for the actual mechanics.

## Integrating a New Transit Agency

1. Obtain the GTFS ZIP download link (preferring a stable agency URL or Mobility Database link).
2. Process the feed:
   ```bash
   npm run process -- <feed-url-or-local-zip> <slug> "[Display Name]" "[lat,lon]"
   ```
3. Add or edit `config/agencies/<slug>.json` with `region`, `feedUrl`, `mdbFeedUrl`, and `bbox`.
   - **bbox vs. center**: if an agency's service area is larger than ±0.4/0.5° from its center (e.g. statewide or regional services like Bustang), add an explicit `bbox: [s, w, n, e]`. Without it, the GeoJSON won't load into the sidebar for viewports outside the ±0.5° window — route cards won't appear even though PMTiles renders the routes.
   - If the official URL is dead or unreliable, use the Mobility Database stable mirror: find the feed at github.com/MobilityData/mobility-database-catalogs, then `https://storage.googleapis.com/storage/v1/b/mdb-latest/o/{feed-id}.zip?alt=media` (GRT and Niagara already use this).
4. Generate the runtime index:
   ```bash
   npm run build:agency-index
   ```
5. Refresh the agency and set up supplemental feeds/history config:
   ```bash
   npm run refresh -- <slug> --force
   ```
6. **Rebuild and upload PMTiles — do not skip this:**
   ```bash
   npm run build-pmtiles
   npm run upload-pmtiles
   ```
   The per-agency GeoJSON (from step 2) is what powers search and the sidebar route cards. It is **not** what renders routes on the map — that's a single aggregate `atlas.pmtiles` file built from *every* agency's current GeoJSON, and it only updates when you explicitly rebuild and upload it.

   **This step has been skipped before and shipped silently broken agencies** — the route exists in search results and the sidebar card, with real headway data, but nothing draws on the map, because the aggregate tile file was never rebuilt to include it. It doesn't error; it just quietly renders nothing for that agency. Confirmed twice: a newly-added agency (GTrans) that never got its first PMTiles build, and an existing agency (LA Metro) whose rail lines were added to the feed but the PMTiles rebuild step was missed on that change.

   Verify the rebuild actually picked up the new/changed agency:
   ```bash
   npm run verify-pmtiles-coverage
   ```
   This compares every agency slug in `index.json` against which slugs actually have route features in the deployed PMTiles and fails loudly on any gap. Run it after every `build-pmtiles` + `upload-pmtiles`, not just when adding a brand-new agency — it also catches an existing agency whose feed changed (new routes, new mode) without a rebuild.
7. Commit the agency source file (`config/agencies/<slug>.json`) and regenerated `public/data/index.json`. PMTiles upload is a separate live action (goes straight to R2, not part of git history) — see `docs/ARCHITECTURE.md` for the R2 bucket layout.

**Mid-week data fix cache bust**: the browser caches agency GeoJSON in IndexedDB keyed by `${slug}-${weekVersion}`. If you re-process an *existing* agency mid-week (e.g. fixing a wrong feed), the IDB cache won't update automatically. Bump `CACHE_BUILD` in `shared/cacheBuild.ts` to invalidate old entries and force a fresh fetch from R2.

## Querying Mobility Database

```bash
npm run find-mdb -- "[search query]" <slug> "[lat,lon]"
# Example:
npm run find-mdb -- "Hamilton Street Railway" hamilton "43.25,-79.87"
```

## Coverage Gap Discovery

```bash
npm run discover-gaps
npm run discover-gaps -- --region Ontario --limit 20
npm run discover-gaps -- --min-pop 100000
```

Candidates are written to `tmp/gap-candidates.json`.

## Batch Processing and Publishing

Same procedure as above, applied to multiple agencies at once:

1. Identify candidates with coverage-gap discovery.
2. Process new agencies and update `config/agencies/`.
3. Run `npm run build:agency-index`.
4. Refresh new slugs together:
   ```bash
   npm run refresh -- slug1 slug2 slug3 --force
   ```
5. Rebuild and upload the PMTiles archive (`npm run build-pmtiles` then `npm run upload-pmtiles`), then run `npm run verify-pmtiles-coverage` — see the warning under step 6 above; this is not optional.
6. Record product additions in `CHANGELOG.md` and mark backlog items `done` in `docs/AGENCY_BACKLOG.md`.

---

[Back to Data](./DATA.md)
