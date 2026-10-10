# Test Suite Audit, October 2026

Linear CIV-38. Audited on `origin/main` at `58d4ae69` (2026-10-10).

Why: on 2026-10-10 the whole suite was green while rail lines were dropped (#623), stop data was wiped (#614), reprocess picked the wrong archive zip (#613), and holiday trips inflated weekday headways (#658). Most of those now have a regression test. This audit looks for the next holes of the same kind.

## 1. Inventory

**148 test files, 1,038 tests, all passing.** No skipped or todo tests.

| Area | Files | Tests |
|---|---:|---:|
| `pipeline/` (`__tests__`, `transforms`, `preprocess`) | 51 | 417 |
| `shared/__tests__` | 29 | 176 |
| `src/utils` | 34 | 258 |
| `src/hooks` | 5 | 48 |
| `src/components` | 11 | 38 |
| `src/data` | 1 | 30 |
| `src/lib` | 6 | 24 |
| `src/apps` | 3 | 16 |
| `src/__tests__` | 1 | 2 |
| `scripts/*.test.ts` | 3 | 21 |
| `api/__tests__` | 3 | 6 |
| `workers/` | 1 | 2 |

**Frameworks:** Vitest 4.1, one global config (`vitest.config.ts`) with jsdom for every file, Testing Library (`@testing-library/react`, `jest-dom`) for components and hooks, JSZip to build GTFS feeds in memory, and real MapLibre expression evaluation in `scripts/headway-filter-audit.test.ts` and `routeFocus`. Playwright is installed but has no test suite; there are no end-to-end tests. No snapshot tests, no `vi.mock` in the pipeline, no network calls.

**Fixtures:** before this audit, no pipeline test used real GTFS. Every feed was a synthetic JSZip feed. The only real-data fixture was `scripts/__fixtures__/headway-filter-routes.json` (frozen route features from MiWay, TTC, LA Metro, TransLink).

### Runtime

Full run: **74 s wall clock**, of which only 26 s is test code. Cumulative jsdom environment setup is 321 s across workers.

The one big cost is **jsdom for every file**. The 84 pipeline, shared and scripts files do not need a DOM:

| Run | Wall clock |
|---|---:|
| pipeline + shared + scripts under jsdom (current) | 51 s |
| same files under `--environment node` | 13 s |

Slowest 15 files by test time (excludes environment setup, which is roughly equal per file):

| # | File | Tests | Seconds |
|---:|---|---:|---:|
| 1 | `src/components/Interval/__tests__/flaggableValue.test.tsx` | 4 | 1.85 |
| 2 | `src/__tests__/LegalPage.test.tsx` | 2 | 1.71 |
| 3 | `pipeline/__tests__/feedUrlSecrets.test.ts` | 2 | 1.52 |
| 4 | `src/apps/__tests__/FrequentServiceStory.test.tsx` | 6 | 1.47 |
| 5 | `src/components/Interval/__tests__/HeadwaySparkline.test.tsx` | 3 | 1.19 |
| 6 | `pipeline/__tests__/registryFeedUrls.test.ts` | 1 | 0.98 |
| 7 | `pipeline/__tests__/process-core.test.ts` | 23 | 0.83 |
| 8 | `src/hooks/__tests__/useIntervalStats.test.ts` | 31 | 0.77 |
| 9 | `src/hooks/__tests__/useAgencyData.test.ts` | 5 | 0.63 |
| 10 | `src/components/Interval/__tests__/MapAttribution.test.tsx` | 1 | 0.47 |
| 11 | `pipeline/__tests__/agencyFeeds.test.ts` | 13 | 0.43 |
| 12 | `src/utils/__tests__/mapContext.test.ts` | 2 | 0.40 |
| 13 | `src/utils/__tests__/formatBranchLabel.test.ts` | 9 | 0.29 |
| 14 | `scripts/headway-filter-audit.test.ts` | 4 | 0.26 |
| 15 | `src/components/Interval/__tests__/AgencyCardOnDemand.test.tsx` | 5 | 0.20 |

No single file is slow. The suite is slow because of environment setup, not test logic.

## 2. Coverage gaps, ranked by risk

What the October incidents now have:

| Incident | Regression test on main |
|---|---|
| #613 / #628 wrong archive zip | Yes. `archiveSelection.test.ts` pins sun-tran, communitytransit, art, norta, path |
| #614 stop data wiped | Yes, one synthetic test (`process-core.test.ts` "processGtfsBuffer stop data"), keys only |
| #623 rail dropped | Yes, synthetic bus + rail in `agencyFeeds.test.ts`, plus a source-grep check that every artifact writer uses `processAgencyFeeds` |
| #654 hidden agencies | Yes. `isReprocessTarget`, `includeHiddenArgError`, tile coverage |
| #657 refresh drop guard | Yes. `refreshDropGuard.test.ts` plus workflow step order |
| #658 holiday weekday | Not on main. Owned by the in-flight #658 session (`holiday-ref` worktree) |

Remaining gaps, highest risk first. "Bug" means a test would fail on main today; those are reported, not tested red.

1. **Bug (#667): eight registered agencies silently fell out of the app.** `config/agencies/` has 705 agency files but `order.json` lists 697. `bowling-green`, `howard-county`, `kittitas-county`, `knox-county`, `mckinley-county`, `ottumwa`, `sevier-county` and `sierra-vista` were added on 2026-09-10 (commit `90d86448`, edited `index.json` directly) but never put in `order.json`. The next `build:agency-index` run (`4e6b8223`, 2026-09-26) regenerated `index.json` from `order.json` and dropped all eight. Nothing failed. `build-agency-index.ts` should refuse unlisted files, and a test should check that every agency file is either in `order.json` or explicitly retired. Needs a product decision on whether the eight should be live, so not fixed here. This PR adds `shared/__tests__/agencyRegistry.test.ts`, which pins the eight as known exceptions so no new agency can be dropped the same way.
2. **Bug (#668): reprocess has no country-launch gate.** `pipeline/reprocess-derived-artifacts.ts` writes `atlas/{slug}*.json` to the live bucket but never calls `assertCountryMayWriteToR2` (process, refresh and incremental PMTiles all do). `--only-slug <first-of-country> --include-hidden --write` would write a never-launched country's data. Fix: call the gate per target before `r2Put`, and add a source-contract test like the `agencyFeeds` one.
3. **`pipeline/` is not typechecked.** `npm run typecheck` covers `src`, `shared`, `api`, `types`, not `pipeline` or `scripts`. #614 (a `Set` passed through `flatMap`) is exactly what the compiler catches. Typechecking `pipeline/` today gives 41 errors (15 in `transit-phase2.ts`, 5 each in `refresh.ts`, `process-core.ts`, `build-history.ts`). Fixing them touches files the #658 session owns, so this is left for after #658 lands.
4. **Pipeline end-to-end used no real feed.** Every `processGtfsBuffer` test was a synthetic one-route feed. Real-feed shapes (station parents, `location_type`, pathways, `calendar_dates`, multiple services) were never run through processing. **Closed in this PR** for bus + rail (MDOT MTA). Shapeless is covered synthetically. Bus-only is covered by the same fixture.
5. **stops.json values were unchecked.** Only stop ids were asserted. A regression that blanked names or coordinates, or kept station parents and entrances as stops, would pass. **Closed in this PR.**
6. **A lost supplemental would not trip the drop guard in tests.** The guard functions and the merge were tested separately. **Closed in this PR**: losing the rail supplemental from a real merged output is refused by `outputDropRefusal`.
7. **GTFS-Flex feeds had no processing test.** A Flex trip has `location_id` stop times and no `stop_id`. `validation.ts` has a branch for it; nothing ran a Flex feed through `processGtfsBuffer`. **Closed in this PR.**
8. **Supplemental config could silently filter out rail.** `agencyProcessOptions` passes the main feed's `routeTypes`, `agencyId` and `excludeRouteShortNames` to every supplemental. A `routeTypes: [3]` on lacmta, mta-maryland, nfta, septa or wmata would drop their rail with no error. **Closed in this PR** with a registry contract test.
9. **Release manifest shape check.** `manifestShapeError` is exercised through `releasePublishError` (bad keys, bad releaseId, schema and tile-rules mismatch). Only the missing-manifest, bad `generatedAt` and overview/agency-prefix branches are unchecked. Low risk, left as is.
10. **Filter rule across surfaces.** Map vs app list/counts is compared on real routes (`scripts/headway-filter-audit.test.ts`, `routeHeadwayFilter.test.ts`). Rule 5 (the partial-route overlay never revives a failing route) is covered synthetically in `frequencySegments.test.ts`; the real-route fixture has no per-stop data, so it cannot exercise the overlay. Adding `stopOrder`/`stopPositions`/`stopHeadways` for a couple of fixture routes would let it. Agency card vs list both call `passesRouteFilter` (low risk). Export label vs active filter is untested. Do not add a route-card-vs-map agreement test: per rule 4, branch values are display-only, so they can differ by design.
11. **Hidden and staged agencies in the shipped catalogs.** `isAgencyVisibleInBrowser` had unit tests, but nothing checked the real registry and the four committed `catalog-*.json` files. Preview mode was only tested with `betaOnly` set. **Closed in this PR** (`agencyRegistry.test.ts`), along with a check that `index.json` matches the registry, since `npm run build` regenerates the catalogs but not the index, so a `hiddenInProduction` edit without an index rebuild would ship the agency. Side finding: `buildAgencyCatalog` strips `feedUrl`, `mdbFeedUrl` and `supplementalFeedUrls` but not the newer `feedApiKeyEnvVar` and `feedApiKeyParam` (#663), so env var names (not secrets) reach the browser catalog; the committed `catalog-*.json` files are also stale against `index.json` for that reason. Still open: `getAtlasMode` resolution from env, which runs at module load and needs `vi.stubEnv` plus a fresh import.
12. **Release and build-ID script flow.** `publish-data-release.ts`, `verify-pmtiles-remote.ts`, `refresh-release.ts` result gating, and build-pmtiles release-ID stamping have no tests beyond the pure guard functions. Medium risk; they need R2 fakes.
13. **Calendars** (owned by the #658 session): type-1 holiday additions in the reference week, the Mon to Fri union in `process-core.ts`, and the wall-clock fallback in `detectReferenceDate` are untested. The #658 work adds the first real fixtures (MBTA 1, TTC 506).
14. **Shared stop ids across main and supplemental feeds.** `processAgencyFeeds` merges stops with `Object.assign` and `stopsMeta.stops.push`, so a colliding id would overwrite one entry and duplicate another. MDOT MTA bus and subway share no ids, and no current agency is known to collide, so this is latent. Add a guard (fail or namespace) before adding an agency whose feeds collide.
15. **Archive edges.** `r2ListArchiveObjects` paging and the `ATLAS_LOCAL_ARCHIVE_DIR` branch are untested. `refresh.ts` has a private `peekFeedInfo` that duplicates `peekFeedDates`; delete the copy rather than test both.
16. **Map export.** Pure layout logic is well tested; the canvas is mocked, so the actual image, `MapExportDialog`, and share/download are untested. Low risk.

## 3. Low-value tests

The suite is mostly honest: no snapshots, no `expect(true)`, no render-only smoke tests, and pipeline tests do not assert on mocks.

**Removed in this PR** (clearly worthless):

| Test | Reason |
|---|---|
| `pipeline/__tests__/artifactSchema.test.ts` (whole file, 2 tests) | Same two assertions as `shared/__tests__/artifactSchema.test.ts`, against the same function |
| `useIntervalStats.test.ts` "tileFilter headway clause respects maxHeadway" | Only checks that the stringified expression contains `'15'` and `'<='`. `shared/__tests__/tileFilterExprs.test.ts` evaluates the real expression |
| `agencyLayerPrune.test.ts` "exports a sensible default max" | Range-checks a constant; any value change edits the test too |
| `mapExport.test.ts` "keeps the export dimensions platform-neutral" | Asserts the two constants that "keeps the preset size for landscape screens" already checks through the layout function |

**Recommended merges, not done** (low payoff, or in files owned by another session):

- `pipeline/__tests__/worst-direction.test.ts` lines 28 and 43 duplicate `shared/__tests__/worstDirection.test.ts` lines 29 and 44 (the pipeline module only re-exports). Owned by the #658 session; merge after it lands, keeping the `stampRouteIrregularDirection` block.
- `refreshDropGuard.test.ts` lines 16 to 25 repeat `archiveSelection.test.ts` "output drop guard" (142 to 173).
- `useIntervalStats.test.ts` line 610 repeats the rule at line 98.
- `effectiveHeadway.test.ts` line 141 repeats line 180 (TTC 900).
- `shortenAgencyName.test.ts` into `format.test.ts`; `internalTest.test.ts` into `analytics.test.ts`; `agencyDetailLoading.test.ts` into `useAgencyData.test.ts`.
- `colors.test.ts` lines 58 to 101 compare raw expression arrays; replace with evaluated checks like `routeFocus`.

**Kept on purpose:** CSS-class assertions in `HeadwaySparkline` and `MapAttribution` look weak but each guards a past visual regression. `FrequentServiceStory` hardcodes research counts (337, 202, 100), which is the point of that test.

## 4. Flaky and slow tests

| Problem | Where | Fix |
|---|---|---|
| jsdom for every file, about 70% of wall time | `vitest.config.ts` | Run `pipeline`, `shared`, `scripts`, `api`, `workers` under `node` and only `src` under jsdom with Vitest `projects`. **Done in this PR** |
| Test overwrites the real refresh handoff file | `dataRefreshMarker.test.ts` writes `tmp/atlas-refresh-result.json`, which `refresh-release.ts` reads | Let `writeRefreshRunResult` take an output path and use a temp dir in the test. **Done in this PR** |
| Date bomb | `process-core.test.ts` fixtures use calendars ending `20261231` while `detectReferenceDate` and `feedQuality` read the clock, so they likely fail from January 2027 | Pin the clock (`vi.useFakeTimers({ toFake: ['Date'] })`). File owned by the #658 session |
| Wall-clock reference week | Any processing test without a pinned clock picks this week's reference date. The week of 2026-10-12 contains Thanksgiving / Columbus Day, exactly the #658 condition | New tests in this PR pin the clock to a holiday-free week |
| Global state leaks | `analytics.test.ts` leaves `window.gtag`, `dataLayer`, a redefined `localStorage` and the URL; `dataRelease.test.ts` never calls `vi.unstubAllGlobals` | Restore in `afterEach` |
| Real timer | `api/__tests__/concurrency.test.ts` uses a 1 ms `setTimeout` and expects peak exactly 15 | Fake timers, or assert `<= limit` |
| Tied to live data | `format.test.ts` "produces a unique shortened name" reads `public/data/index.json`; `LegalPage` checks a dated "Last updated" line | Acceptable as contracts, but expect churn |
| cwd-relative paths | `refreshDropGuard`, `refreshWorkflow`, `releaseGuard` fingerprint resolve from `process.cwd()` | Resolve from `import.meta.dirname` |

## 5. What this PR changed

Tests: 1,038 in 148 files before, 1,056 in 150 files after. Full run 74 s before, 36 s after.

Added (23 tests):
- `pipeline/__tests__/realFeedBusRail.test.ts` with a real fixture cut from MDOT MTA's published feeds (`fixtures/mdot-mta-bus-rail/`: bus route 69 plus the Metro SubwayLink, with station parents, entrances, pathway nodes and calendar_dates). Checks both bus and rail directions survive the merge, every drawn route has real per-stop headways, stops.json has real names and coordinates and no entrances or nodes, stops-meta lists each stop once with its routes, the real `mta-maryland` registry options keep the subway, the drop guard refuses a run that loses the rail supplemental, and no agency with supplementals sets a filter that would drop rail.
- `pipeline/__tests__/flexFeed.test.ts`: the same real bus route plus GTFS-Flex trips. Processing passes validation, never turns a Flex zone into a route or stop, and leaves the fixed route byte-identical.
- `shared/__tests__/agencyRegistry.test.ts`: registry to index to catalog contracts (above).

All new processing tests pin the clock to a holiday-free week.

Removed (5 tests): see section 3.

Fixed: `dataRefreshMarker.test.ts` no longer overwrites `tmp/atlas-refresh-result.json`; Vitest runs non-UI tests under Node.

## 6. Next steps after this PR

1. Decide on the eight unindexed agencies (#667), then make `build-agency-index` fail on unlisted files.
2. Add the country gate to reprocess (#668).
3. Strip `feedApiKeyEnvVar`/`feedApiKeyParam` in `buildAgencyCatalog`.
4. After #658 lands: typecheck `pipeline/` in `npm run typecheck`, pin the clock in `process-core.test.ts`, merge the worst-direction duplicates.
5. R2-faked tests for `publish-data-release` and `refresh-release` gating.
