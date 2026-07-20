# Adding a Transit Agency

Maintainer and contributor runbook for onboarding one new agency (or a small batch) into Atlas. This is repository documentation, not user-facing product documentation.

This is the single canonical procedure for adding or updating an agency. [`AGENCY_BACKLOG.md`](AGENCY_BACKLOG.md) § Workflow points here so there is one source of truth for the actual mechanics. See [`MAP_UPDATES.md`](MAP_UPDATES.md) for keeping already-published agencies current (refreshes, batch publishing) and [`COVERAGE_GAP_DISCOVERY.md`](COVERAGE_GAP_DISCOVERY.md) for finding new candidates in the first place.

## Integrating a New Transit Agency

**Stop before step 3 if this is the first agency for a country with zero live agencies yet** (e.g. any France/Belgium/Spain candidate right now). Steps 1-2 (dry-run + local preview) are always fine to run freely — nothing in them touches R2. Step 3 onward writes real data to the live bucket: for an already-live country, that's routine once an agency is validated; for a brand-new country, publishing its first agency is a country-launch decision, not just a routine agency add, and needs separate maintainer sign-off. `hiddenInProduction` only hides an agency from the UI *after* its data is already live on R2 — it is not a substitute for staying offline, and a previously-hidden agency should not be treated as precedent for publishing the next one in the same country.

**Hard refuse:** `npm run process` and `npm run build-pmtiles-incremental` without `--dry-run` will exit with an error for any country that still has zero production-visible agencies (France and Mexico today). `npm run refresh` skips those agencies so weekly jobs don't keep rewriting them. After Ryan explicitly authorizes the country launch (or an intentional pre-launch R2 fix), re-run with `--i-am-launching-country`. See `pipeline/countryLaunchGate.ts` and AGENTS.md § Production Data Rules.

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

   With the dry-run preview on disk, `npm run dev` will also serve that agency's search results and sidebar route cards locally — the dev server checks `tmp/process-preview/<slug>/` for any `/atlas-data/<slug>*.json` request before falling back to the real R2 proxy, so a brand-new (or not-yet-registered) agency can be browsed in the actual app before anything is published. This works even without a PMTiles build; see § Incremental PMTiles Build below for also previewing the agency's routes drawn on the map itself.
3. Process the feed for real (already-live countries only — France/Mexico/etc. hard-refuse without the launch flag):
   ```bash
   npm run process -- <feed-url-or-local-zip> <slug> "[Display Name]" "[lat,lon]"
   # Country launch only, after explicit maintainer approval:
   # npm run process -- <feed> <slug> "[Name]" "[lat,lon]" --i-am-launching-country
   ```
4. Add or edit `config/agencies/<slug>.json` with `region`, `feedUrl`, `mdbFeedUrl`, and `bbox`.
   - **Check the slug isn't already taken by a different agency before writing the file** — `cat config/agencies/<slug>.json` first if it already exists, and compare the `name`/`region` against what you're about to add. A common city name (e.g. "Nice") can coincidentally collide with an existing agency's slug (e.g. NICE Bus, Nassau NY); `scripts/build-agency-index.ts` only rejects two *different files* sharing a slug, so it cannot catch one file's content being silently overwritten in place. On a real collision, disambiguate with a suffix (`nice-fr`, matching the existing `springfield-mo` pattern) rather than reusing the slug.
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

A full `npm run build-pmtiles` downloads every agency's GeoJSON and retippecanoes the entire archive — expensive, and unnecessary just to validate one small new agency (e.g. proof-of-concept international coverage). `pipeline/build-pmtiles-incremental.ts` (`npm run build-pmtiles-incremental -- <slug> [--dry-run]`) instead builds tippecanoe outputs for just that one agency's routes/stops/corridors and `tile-join`s them into the *already-deployed* `atlas.pmtiles`, without touching any other agency's tiles.

**When this is safe**: a brand-new agency, not yet published, whose service area does not geographically overlap any existing Atlas agency.

**When this is NOT safe — use the full `npm run build-pmtiles` instead**:
- **Updating an existing, already-published agency** (new routes, a feed refresh, a data fix). Incremental tile-join can only *add* tiles, never remove them — "replacing" an existing agency's tiles this way would leave both the old and new versions of its features present (duplicate/stale rendering), not a clean update. Removing the old version first is a genuinely harder problem and is intentionally out of scope for this script.
- **A new agency whose bbox overlaps any existing agency's bbox**, even partially. The stops layer is built with tippecanoe `--drop-densest-as-needed` (see step 7 above), which decides which stops to drop at each zoom *relative to everything else sharing a tile*. A full rebuild makes that decision once, jointly, across every agency's stops. Tile-joining a new agency's independently-built `stops.pmtiles` into the existing archive does not redo that joint decision for any tile the two agencies share — you'd get whatever each side's tippecanoe run decided in isolation, which is a different (and wrong) answer than a full rebuild would produce for that shared area. This is the same category of "silently wrong, not loudly broken" risk called out in the PMTiles-skip warning above, just triggered by overlap instead of a skipped rebuild.

The script enforces both boundaries itself before doing any tippecanoe/tile-join work, and refuses with a clear error rather than guessing:
1. Scans the deployed `atlas.pmtiles` (via bounded HTTP range requests near the agency's own bbox — no full download needed just to check) for the slug. Refuses if it's already present.
2. Compares the agency's bbox (explicit `bbox` in `index.json`, or the same center-padding fallback the rest of the app uses when one isn't set) against every other agency's bbox. Refuses on any rectangle overlap — deliberately conservative (bbox rectangles, not real geometry): a false "safe" here ships a real map correctness bug, so it errs toward refusing.

Both checks are pure logic, unit tested in `pipeline/__tests__/incrementalPmtilesSafety.test.ts` without needing tippecanoe or real R2 access.

```bash
# Validate the mechanics and see what would change, without uploading:
npm run build-pmtiles-incremental -- <slug> --dry-run

# Once you're satisfied and have explicit go-ahead to write to the live bucket
# (same production-data gate as npm run build-pmtiles):
npm run build-pmtiles-incremental -- <slug>
```

`--dry-run` still downloads the real deployed `atlas.pmtiles` and runs the real tippecanoe/tile-join steps locally (so the size/feature-count report reflects reality), it just stops before the final upload. After a real (non-dry-run) run, still run `npm run verify-pmtiles-coverage` to confirm.

**Previewing the dry-run's merged tiles visually, before ever uploading**: copy the local dry-run output to the well-known preview path and restart the local dev server:
```bash
cp tmp/incremental-pmtiles-build/<slug>/atlas.pmtiles tmp/atlas-pmtiles-preview.pmtiles
```
`vite.config.ts`'s dev proxy checks for this file on every `atlas.pmtiles` request and serves it directly (with proper Range-request support) instead of proxying to R2, falling back to the normal proxy when the file isn't present — so the new agency's routes render on the local map exactly as they would in production, with zero writes to the live bucket. Requires a dev server restart to pick up (`vite.config.ts` changes need one); delete the preview file (or just don't create it) to go back to normal behavior.

---

[Back to Data](./DATA.md)
