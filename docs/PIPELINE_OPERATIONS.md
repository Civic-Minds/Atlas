# Atlas Pipeline Operations

Maintainer and contributor runbooks for adding agencies, discovering coverage gaps, refreshing feeds, and publishing map artifacts. This is repository documentation, not user-facing product documentation.

This is the single canonical procedure for adding or updating an agency — [`ADDING_AGENCIES.md`](ADDING_AGENCIES.md) and [`AGENCY_BACKLOG.md`](AGENCY_BACKLOG.md) § Workflow both point here rather than restating these steps, so there's one source of truth for the actual mechanics.

## Integrating a New Transit Agency

1. Obtain the GTFS ZIP download link (preferring a stable agency URL or Mobility Database link).
2. **Optional but recommended for a new/unfamiliar feed**: preview it locally first, with nothing written to R2 or any repo file:
   ```bash
   npm run process -- <feed-url-or-local-zip> <slug> "[Display Name]" "[lat,lon]" --dry-run
   ```
   Writes the real processed artifacts to `tmp/process-preview/<slug>/` on local disk — inspect route/shape counts, tier distribution, headsigns, etc. before trusting the feed enough to publish it. No R2 credentials needed for this mode. This is exactly the kind of check that caught Guadalajara's shape corruption and mislabeled headsigns (#219/#227/#244) — do it before publishing, not after.

   Then run the automated version of that same check:
   ```bash
   npm run route-report -- <slug>
   ```
   Reads the dry-run preview and prints a route × direction × day frequency table, plus three flags that have each caught a real bug before: a terminal headway far above the best headway anywhere on the route (Niagara 301, #241), near-duplicate headsigns on the same route+direction (Niagara typo, #242), and shapes that needed truncation/de-interleaving during parsing (Guadalajara, #219/#244 — recorded in `<slug>-shape-anomalies.json` alongside the other preview artifacts). A flag isn't automatically a bug — branching routes legitimately have faster segments than their terminal, for instance — but each one is worth a manual look before publishing. Pass `--live` to run the same report against an already-published agency's current R2 data instead (shape-anomaly detection isn't available in `--live` mode — it's only captured during parsing).
3. Process the feed for real:
   ```bash
   npm run process -- <feed-url-or-local-zip> <slug> "[Display Name]" "[lat,lon]"
   ```
4. Add or edit `config/agencies/<slug>.json` with `region`, `feedUrl`, `mdbFeedUrl`, and `bbox`.
   - **bbox vs. center**: if an agency's service area is larger than ±0.4/0.5° from its center (e.g. statewide or regional services like Bustang), add an explicit `bbox: [s, w, n, e]`. Without it, the GeoJSON won't load into the sidebar for viewports outside the ±0.5° window — route cards won't appear even though PMTiles renders the routes.
   - If the official URL is dead or unreliable, use the Mobility Database stable mirror: find the feed at github.com/MobilityData/mobility-database-catalogs, then `https://storage.googleapis.com/storage/v1/b/mdb-latest/o/{feed-id}.zip?alt=media` (GRT and Niagara already use this).
5. Generate the runtime index:
   ```bash
   npm run build:agency-index
   ```
6. Refresh the agency and set up supplemental feeds/history config:
   ```bash
   npm run refresh -- <slug> --force
   ```
7. **Rebuild and upload PMTiles — do not skip this:**
   ```bash
   npm run build-pmtiles
   npm run upload-pmtiles
   ```
   The per-agency GeoJSON (from step 3) is what powers search and the sidebar route cards. It is **not** what renders routes on the map — that's a single aggregate `atlas.pmtiles` file built from *every* agency's current GeoJSON, and it only updates when you explicitly rebuild and upload it.

   **This step has been skipped before and shipped silently broken agencies** — the route exists in search results and the sidebar card, with real headway data, but nothing draws on the map, because the aggregate tile file was never rebuilt to include it. It doesn't error; it just quietly renders nothing for that agency. Confirmed twice: a newly-added agency (GTrans) that never got its first PMTiles build, and an existing agency (LA Metro) whose rail lines were added to the feed but the PMTiles rebuild step was missed on that change.

   Verify the rebuild actually picked up the new/changed agency:
   ```bash
   npm run verify-pmtiles-coverage
   ```
   This compares every agency slug in `index.json` against which slugs actually have route features in the deployed PMTiles and fails loudly on any gap. Run it after every `build-pmtiles` + `upload-pmtiles`, not just when adding a brand-new agency — it also catches an existing agency whose feed changed (new routes, new mode) without a rebuild.
8. Commit the agency source file (`config/agencies/<slug>.json`) and regenerated `public/data/index.json`. PMTiles upload is a separate live action (goes straight to R2, not part of git history) — see `docs/ARCHITECTURE.md` for the R2 bucket layout.

**Mid-week data fix cache bust**: the browser caches agency GeoJSON in IndexedDB keyed by `${slug}-${weekVersion}`. If you re-process an *existing* agency mid-week (e.g. fixing a wrong feed), the IDB cache won't update automatically. Bump `CACHE_BUILD` in `shared/cacheBuild.ts` to invalidate old entries and force a fresh fetch from R2.

## Incremental PMTiles Build (single new, isolated agency)

A full `npm run build-pmtiles` downloads every agency's GeoJSON and retippecanoes the entire archive — expensive, and unnecessary just to validate one small new agency (e.g. proof-of-concept international coverage like Metz, France). `pipeline/build-pmtiles-incremental.ts` (`npm run build-pmtiles-incremental -- <slug> [--dry-run]`) instead builds tippecanoe outputs for just that one agency's routes/stops/corridors and `tile-join`s them into the *already-deployed* `atlas.pmtiles`, without touching any other agency's tiles.

**When this is safe**: a brand-new agency, not yet published, whose service area does not geographically overlap any existing Atlas agency. This is exactly the Metz case — the nearest other Atlas agency is thousands of km away.

**When this is NOT safe — use the full `npm run build-pmtiles` instead**:
- **Updating an existing, already-published agency** (new routes, a feed refresh, a data fix). Incremental tile-join can only *add* tiles, never remove them — "replacing" an existing agency's tiles this way would leave both the old and new versions of its features present (duplicate/stale rendering), not a clean update. Removing the old version first is a genuinely harder problem and is intentionally out of scope for this script.
- **A new agency whose bbox overlaps any existing agency's bbox**, even partially. The stops layer is built with tippecanoe `--drop-densest-as-needed` (see step 7 above), which decides which stops to drop at each zoom *relative to everything else sharing a tile*. A full rebuild makes that decision once, jointly, across every agency's stops. Tile-joining a new agency's independently-built `stops.pmtiles` into the existing archive does not redo that joint decision for any tile the two agencies share — you'd get whatever each side's tippecanoe run decided in isolation, which is a different (and wrong) answer than a full rebuild would produce for that shared area. This is the same category of "silently wrong, not loudly broken" risk called out in the PMTiles-skip warning above, just triggered by overlap instead of a skipped rebuild.

The script enforces both boundaries itself before doing any tippecanoe/tile-join work, and refuses with a clear error rather than guessing:
1. Scans the deployed `atlas.pmtiles` (via bounded HTTP range requests near the agency's own bbox — no full download needed just to check) for the slug. Refuses if it's already present.
2. Compares the agency's bbox (explicit `bbox` in `index.json`, or the same center-padding fallback the rest of the app uses when one isn't set) against every other agency's bbox. Refuses on any rectangle overlap — deliberately conservative (bbox rectangles, not real geometry): a false "safe" here ships a real map correctness bug, so it errs toward refusing.

Both checks are pure logic, unit tested in `pipeline/__tests__/incrementalPmtilesSafety.test.ts` without needing tippecanoe or real R2 access.

```bash
# Validate the mechanics and see what would change, without uploading:
npm run build-pmtiles-incremental -- metz --dry-run

# Once you're satisfied and have explicit go-ahead to write to the live bucket
# (same production-data gate as npm run build-pmtiles — see CLAUDE.md § Production Data Rules):
npm run build-pmtiles-incremental -- metz
```

`--dry-run` still downloads the real deployed `atlas.pmtiles` and runs the real tippecanoe/tile-join steps locally (so the size/feature-count report reflects reality), it just stops before the final upload. After a real (non-dry-run) run, still run `npm run verify-pmtiles-coverage` to confirm.

**Previewing the dry-run's merged tiles visually, before ever uploading**: copy the local dry-run output to the well-known preview path and restart the local dev server:
```bash
cp tmp/incremental-pmtiles-build/<slug>/atlas.pmtiles tmp/atlas-pmtiles-preview.pmtiles
```
`vite.config.ts`'s dev proxy checks for this file on every `atlas.pmtiles` request and serves it directly (with proper Range-request support) instead of proxying to R2, falling back to the normal proxy when the file isn't present — so the new agency's routes render on the local map exactly as they would in production, with zero writes to the live bucket. Requires a dev server restart to pick up (`vite.config.ts` changes need one); delete the preview file (or just don't create it) to go back to normal behavior.

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
5. Rebuild and upload the PMTiles archive (`npm run build-pmtiles` then `npm run upload-pmtiles`), then run `npm run verify-pmtiles-coverage` — see the warning under step 7 above; this is not optional.
6. Record product additions in `CHANGELOG.md` and mark backlog items `done` in `docs/AGENCY_BACKLOG.md`.

---

[Back to Data](./DATA.md)
