# Changelog

## [Unreleased]

### Added
- **Pipeline override audit**: Clears `issueUrl` when upstream publishes a new GTFS file; logs when excluded routes may no longer need overrides (`excludeRouteShortNames` kept until verified).
- **Unambiguous search Enter-to-select**: Pressing Enter in the main search bar auto-selects the row when exactly one agency or route result is visible.
- **In-app Corrected Data details**: Clicking "Learn more →" on data override notices opens a dedicated in-app drawer explaining the data corrections made.
- **London Transit route names preprocessor**: Added a pipeline preprocessor transform (`synthesizeLondonRouteNames`) to dynamically extract descriptive route long names from trip headsigns for agencies like London Transit that publish redundant names.

### Changed
- **Card Help notices alignment**: Aligned styling, font size, and placement of "We corrected this data" with the outdated-schedule notice under a unified `CardHelpNotice` component.
- **History eligibility criteria**: Filtered historical data exploration to agencies meeting `agencyQualifiesForHistoryExplore` threshold.
- **Sidebar search component modularization**: Refactored `SidebarControls.tsx` to extract search suggestions and result list rendering logic into self-contained `SearchSuggestionsPanel` and `SearchResultsList` components.
- **Search result layouts**: Removed border separators between individual rows in the search suggestions and matched results panels, and removed the " — refine search" suffix from truncated labels.
- **Search results styling refinement**: Shortened agency names in the search matches list using `shortenAgencyName` and refined spacing/margin layouts between the routes and agencies categories.
- **Mobile layout refinement**: Hid Live/Corridors toggle buttons on mobile viewports to declutter the header, allowing the search bar to stretch across the full remaining screen width. Moved map filter chips (Frequency, Day, Period, Modes) to a mobile-only core filters section within the Settings panel. Hid bottom map routes count and coverage badges on mobile.
- **Branch hover debouncing**: Added an intentional 80ms delay before highlighting branches on hover, and 50ms before clearing, to completely prevent rapid layout oscillation/map flickers when positioning the mouse near row boundaries.
- **Rockford**: `excludeRouteShortNames: ["Test"]` — junk upstream route stripped at process time (Closes [#144](https://github.com/Civic-Minds/Atlas/issues/144)).
- **Rockford**: Switched `feedUrl` to official `rmtd.org/rmtdgtfs/GTFS_FILES.zip` (valid through Oct 2026); removed Test override — upstream no longer publishes that route.
- **Niagara Transit**: switched `feedUrl` to current http://68.71.24.110/gtfs/GTFSExport.zip (via transit.land; previous mdb mirror was stale 2021 data with legacy RED/BLUE).
- **Agencies**: Cascades East Transit, Mountain Transit (Big Bear Lake), RoadRUNNER Transit (Las Cruces), EZ Rider, San Angelo Transit, Brownsville Metro; Roswell/Hobbs (NM), Longview/Texarkana/Fort Bend (TX), Lake Charles/Terrebonne/Tangipahoa (LA); Space Coast, Martin County, Indian River, Collier CAT (FL).

### Fixed
- **Help notices**: single top border when "outdated schedule" + "We corrected this data" stack (no line between, e.g. Niagara).
- **Outdated schedule notice**: reworded to "This schedule may be outdated and ended Jan 9, 2021." (no brackets or em dash).
- **InfoPanel backdrop**: made non-blocking (`pointer-events-none`) + outside-click via listener so background elements (e.g. other "Learn more" buttons in cards) receive proper hover cursors and interactions while panel is open.
- **Period filter**: prefer minStopHeadwayByPeriod or headwayByPeriod over worstDirectionHeadwayByPeriod for "15 min" etc filters (so routes with good sections or headBy show even if one direction is worse; fixes RGRTA 8/16/22 etc not appearing).
- **Niagara Transit**: `excludeRouteShortNames: ["RED", "BLUE"]` + display name updated; no longer operates former WEGO Red (rebranded 116/216) or Blue (to Niagara Parks WEGO). Stale entries hidden via overrideNote.
- **Empty routeShortName routes** (e.g. 145): changed `routeShortName &&` guard to `!= null` in process-core.ts so stop headway loop runs; headwayByHour, stopHeadways, stopOrder etc. now compute.
- **Pipeline**: Post-merge tier refinement uses `headwayToTier()` instead of undefined `HEADWAY_TIERS`.
- **MVTA**: Agency label (`MVTA` not `VTA`); 4FUN corridor title and headsign cleanup; MOA/MSP/TS/FUN acronyms; route/stop cards skip direction dividers for simple bidirectional pairs.
- **RMTD**: `shortenAgencyName` maps Rockford Mass Transit District before generic "Mass" stripping.
- **Agency card**: Removed period from header and close button; dismiss via outside click, Escape, or map click.
- **Data override link**: Shown only when `issueUrl` is set — card stops linking after weekly refresh clears the URL while exclusions remain.
- **Stale schedule help**: Route card "Learn more" opens in-app outdated-schedule explainer instead of GitHub docs; help panel shows when Atlas last fetched the feed (`lastRefreshedAt`, backfilled from last weekly refresh for existing agencies). Expired-feed agencies get `websiteUrl` from GTFS with a "Check current schedules" link in the help panel. Next refresh countdown reads `scheduleCron` from git and `lastCompletedAt` from R2 (`atlas/feed-refresh-meta.json`, no extra commits when feeds are unchanged). Info panel **Schedule sources** view under Data; About footer shortened to one line plus refresh dates.

## [3.0.12] — 2026-07-07

### Fixed
- **Vercel deploy**: Frontend day-type imports moved to `shared/dayTypes.ts` — `types/` is `.vercelignore`d so `types/gtfs` was missing at build time.
- **Pipeline refresh**: Correct `headway-utils.ts` import path for `shared/config`.

## [3.0.11] — 2026-07-07

### Changed
- **Agency route list**: Split matching vs other routes when frequency filter is active; show filter-grade headways; header summary (`12 routes · 8 match ≤60m`); collapsed "outside filters" section.

### Fixed
- **Frequency filter vs route card** ([#143](https://github.com/Civic-Minds/Atlas/issues/143)): `worstDirectionHeadway` no longer crosses service days — weekend headways were hiding weekday 60-min routes (e.g. TARTA 15) at ≤60m while the card showed "every 60 min".
- **CI deploy**: TypeScript errors in SidebarControls, useIntervalStats, effectiveHeadway, and searchResults tests.

## [3.0.10] — 2026-07-07

### Changed
- **Agency card mode filters**: Replaced the prose blurb (`subway and light rail, 23 express routes`) with tappable pills that filter the route list (Subway · 4, Light rail · 12, Express · 23, etc.).
- **Corridors mode**: Header **Corridors** toggle (like Live); self-contained From/To panel on the map — no longer hijacks the main search bar; shares global day filter; stop card **Corridors from here…** entry.
- **App drawer hidden**: Removed waffle menu from header again; History/Fares remain URL-only until ready (reverts [#115](https://github.com/Civic-Minds/Atlas/issues/115)).
- **Near You panel**: Removed close button; panel clears when location is dismissed from the map.
- **Near You headways**: “Every X min” respects the selected day and period filter (`headwayByPeriod`), not midday headline only.
- **Near You loading**: Shows spinner while agency GeoJSON loads instead of “No routes within 500 m”.
- **Near You dismiss** ([#139](https://github.com/Civic-Minds/Atlas/issues/139)): Panel closes on outside click (same pattern as filter chips).
- **Search suggestions**: Section headers match content — Recent searches / Recent routes / Suggested routes (or agencies in Fares); both recent and suggested routes can show together.
- **Live Vehicles**: Vehicle detail rows use fleet labels or ordinals instead of raw UUIDs; route list drops redundant "Route N" suffix; multi-agency headers match suggestion section style.
- **Panel tokens**: Shared `PANEL_TITLE_BAR`, `PANEL_SECTION_HEAD`, `PANEL_CARD_HEADER`, etc. in `styles.ts`; Live Vehicles, Near You, and search suggestions use them.

### Fixed
- **CI / deploy**: Fix TypeScript errors blocking `tsc` (search result types, viewport bounds, headway-by-hour).
- **Map route deselect** ([#141](https://github.com/Civic-Minds/Atlas/issues/141)): Unified map click handler; paint resets synchronously on clear; fix invalid MapLibre opacity expression that left highlight stuck after deselect.
- **MiWay express headsigns** ([#142](https://github.com/Civic-Minds/Atlas/issues/142)): Strip direction-only express labels (`135 E Express Eglinton Exp`) so route cards show WESTBOUND/EASTBOUND without garbled "to W Express Eglinton Exp" rows.
- **Route card one-way destinations** ([#134](https://github.com/Civic-Minds/Atlas/issues/134)): Unified headsign pipeline (`resolveDisplayHeadsign`) so GeoJSON never drops cleaned-away destinations; route/stop cards share `resolveBranchLabel` with direction fallbacks; route-title redundancy handled at display time, not in stored data. Route cards no longer repeat the section heading as a row label (e.g. "to Southbound" under SOUTHBOUND).
- **Letter-suffix branch routes**: Pipeline auto-merges GTFS pairs like `blue` + `blue B` when long names prove same corridor (YRT VIVA, etc.) — default-on for all agencies; opt out with `skipLetterSuffixMerge` in `index.json`.
- **Pipeline modularization**: GTFS normalize/transform orchestration, shape selection, headway utils, geometry, and feature enrichment extracted from `process-core.ts` into dedicated modules.
- **Map attribution**: Compact linked `OpenStreetMap · CARTO` pill (full license string on `title`); MapLibre default hidden.
- **Mode filter** ([#135](https://github.com/Civic-Minds/Atlas/issues/135)): Mode gating moved into shared `tileFilter` (map + stats use the same clause); `effectiveMode` coerces string `routeType` and always receives `agencySlug` for virtual LRT rules.
- **Frequency filter** ([#136](https://github.com/Civic-Minds/Atlas/issues/136)): MapLibre tile filter expressions rewritten to compile with direction/day clauses — invalid nested `to-number`/numeric coalesce caused `setFilter` to fail silently so the map ignored headway/mode pills while stats updated.
- **Agency search** ([#137](https://github.com/Civic-Minds/Atlas/issues/137)): Dedupe sub-agency slugs (e.g. exo), sort in-viewport/nearest first, align list rows with route results; routes and agencies split into “In this area” / “Elsewhere” with route-first ordering for route-like queries.
- **Route search**: Substring match on route short names (aligned with map); prefetch GeoJSON for search-matched agencies so routes appear outside the viewport.
- **Search dismiss** ([#138](https://github.com/Civic-Minds/Atlas/issues/138)): Results/suggestions panel closes on blur when clicking outside; typed results gated on `searchFocused` like other panels.
- **Agency slug search** (e.g. `ttc`): Agency result appears first; routes that only matched via agency slug are hidden. Search dropdown caps at 5 agencies and 10 routes with a refine-search hint when truncated.
- **Sidebar panel width**: Live, History, Frequency sidebar, and agency card panels now share `SEARCH_BAR_WIDTH` with the header search bar.
- **Live Vehicles TTC adherence** ([#140](https://github.com/Civic-Minds/Atlas/issues/140)): Infer delay from predicted vs scheduled stop times when GTFS-RT omits `delay` (TTC); pipeline sidecar now stores per-trip stop schedules.
- **Search list rows**: Recent, suggested, and typed search results now share `RouteListRow` (route + companion name, agency · headway on the right) and `PANEL_SECTION_HEAD` section labels.
- **Live Vehicles empty state**: When buses are active off-screen, list them under “Outside this view” instead of a blank panel; true empty shows which routes are monitored in the area. Links to Data panel filtered to live agencies (empty and off-screen states).
- **Data panel filters**: Agency list adds All / Live / History chips (Live opens from Live Vehicles empty states and settings). Feature badges hidden when that filter is active. Feature + region chips share one scroll row; regions scope to the active feature.
- **Corridors map**: Stop showing the full PMTiles corridor-band layer in Corridors mode — only clipped A→B route segments render after From/To are set.
- **Corridors panel alignment**: Corridors input panel now uses the same responsive width as the main search bar and is anchored directly under the header row instead of oversized/off-position.
- **Corridors UX simplification**: Removed the dedicated From/To Corridors panel; Corridors now uses the single global search bar (like Live) and renders corridor-only map lines in that mode.
- **Search placeholder flashing**: Removed placeholder fade/crossfade on app switch so search hint text updates instantly between Frequency, Live, and Corridors.
- **Route card headways**: Removed ranged labels (`every X–Y min`) from direction rows; cards now consistently show a single cadence value per branch.
- **Route card sparkline realism**: Route-card sparklines now use branch/destination cadence only (no combined trunk minimum), avoiding optimistic lows like `every 3 min` on destination-specific service.
- **Route card headway ranges (restored, gated)**: Multi-branch rows can show `every X–Y min` again when headsign-scoped trunk wait is ≥5 min, ≥5 min better than destination wait, and ratio ≤4×; route-wide combined deps no longer drive the low end.
- **Route card duplicate destinations**: Drop stub headsign duplicates that appear in both direction groups (e.g. TTC 900 “to Kipling” under Eastbound and Westbound) — keep the full-length branch only.
- **Search vs route card**: Focusing the search bar clears the selected route/stop so suggestions don’t stack over an open route card; picking a search result dismisses search focus.
- **Headway consistency**: Agency route list and search suggestions now use the same period-aware headway as route cards (e.g. midday `every 6 min`), not a different all-day minimum across directions.

## [3.0.9] — 2026-07-06

### Fixed
- **CI**: Pin `@emnapi/core` and `@emnapi/runtime` at 1.11.2 in `package-lock.json` so `npm ci` passes on Node 22 (Tailwind/Rolldown wasm optional deps).

## [3.0.8] — 2026-07-06

### Added
- **History adherence tests** ([#130](https://github.com/Civic-Minds/Atlas/issues/130)): Unit tests for `computeHistoryAdherence` timezone bucketing.
- **Stop click route highlight** ([#104](https://github.com/Civic-Minds/Atlas/issues/104)): Selecting a stop keeps connecting routes at full color/width; other visible routes fade to 15% opacity.

### Changed
- **CI typecheck** ([#111](https://github.com/Civic-Minds/Atlas/issues/111)): Added `tsconfig.api.json` — API routes type-checked in CI alongside `src`/`shared`.
- **validate-index in CI** ([#112](https://github.com/Civic-Minds/Atlas/issues/112)): `npm run validate-index` runs on every PR.
- **R2 URL centralization** ([#127](https://github.com/Civic-Minds/Atlas/issues/127)): `DEFAULT_R2_PUBLIC_URL` exported from `shared/config.ts`.
- **Dead code removed** ([#126](https://github.com/Civic-Minds/Atlas/issues/126)): Deleted `dev-api-server.ts` and `pipeline/mapStyles.ts`.
- **Deps cleanup** ([#125](https://github.com/Civic-Minds/Atlas/issues/125)): Removed unused Leaflet and Playwright packages.
- **Docs** ([#128](https://github.com/Civic-Minds/Atlas/issues/128)): README and ROADMAP updated to MapLibre GL stack.
- **refresh-feeds CI** ([#131](https://github.com/Civic-Minds/Atlas/issues/131)): Weekly workflow runs typecheck and tests before commit.
- **Worker gitignore**: Fixed pattern that incorrectly ignored `gtfs-rt-archiver/src/`.
- **Sidebar card primitives** ([#103](https://github.com/Civic-Minds/Atlas/issues/103)): `SidebarCardShell`, shared list/section wrappers, and `CardDirectionRow` — stop, route, and agency cards share one layout system; removed duplicate route-card wrapper margin.
- **Stop card period labels**: Dropped redundant "Evening" (etc.) suffix on every headway — active period is already in the sidebar filter.
- **Stop card debug panel**: Removed internal "debug headways" toggle from the public stop card.

### Fixed
- **CI**: Synced `package-lock.json` after dependency cleanup (restores optional `@emnapi` entries required by `npm ci` on Node 22).
- **Route card sparkline overnight** ([#100](https://github.com/Civic-Minds/Atlas/issues/100)): Hourly chart runs 6 AM → 2 AM left-to-right with 5 AM grouped at the end; restored 3 AM and 4 AM bars (GTFS hours 27–28) in the overnight tail ([#133](https://github.com/Civic-Minds/Atlas/issues/133)).
- **Frequency filter** ([#132](https://github.com/Civic-Minds/Atlas/issues/132)): Map tile filter uses flat PMTiles period headway keys (`wdph_midday`, etc.) instead of nested GeoJSON objects tippecanoe drops; all-day `worstDirectionHeadway` fallback and tier parsing aligned with sidebar logic.
- **History timezone** ([#105](https://github.com/Civic-Minds/Atlas/issues/105)): Hourly delay buckets use per-agency IANA timezones instead of hardcoded UTC−4.
- **Supplemental feed skip** ([#106](https://github.com/Civic-Minds/Atlas/issues/106)): Weekly refresh no longer skips agencies with unchanged primary feeds when supplementals exist.
- **Per-stop GTFS times** ([#107](https://github.com/Civic-Minds/Atlas/issues/107)): Pipeline uses `t2m()` for stop headways (supports >24:00 overnight times).
- **Stale feed expiry** ([#108](https://github.com/Civic-Minds/Atlas/issues/108)): Expired `feed_end_date` forces reprocess instead of indefinite skip.
- **Live Vehicles bboxes** ([#109](https://github.com/Civic-Minds/Atlas/issues/109)): TransLink and STM added to `LIVE_AGENCY_BBOXES`.
- **Live config drift** ([#110](https://github.com/Civic-Minds/Atlas/issues/110)): TTC 503 and STM 55 `scheduleOffsetMin` stop IDs aligned with `targetStops`.
- **Agency index load** ([#113](https://github.com/Civic-Minds/Atlas/issues/113)): Failed `index.json` fetch shows retry UI instead of infinite Loading.
- **History API env** ([#114](https://github.com/Civic-Minds/Atlas/issues/114)): `history-adherence` fails fast on missing R2 credentials.
- **App navigation** ([#115](https://github.com/Civic-Minds/Atlas/issues/115)): Re-enabled `AppDrawer` for Corridors, History, and Fares.
- **Error boundaries** ([#116](https://github.com/Civic-Minds/Atlas/issues/116)): Map shell wrapped in recoverable `ErrorBoundary`.
- **Map zoom UX** ([#117](https://github.com/Civic-Minds/Atlas/issues/117)): Low-zoom stop clicks fly in; route disambiguation and geolocation show hints.
- **Search a11y** ([#118](https://github.com/Civic-Minds/Atlas/issues/118)): Main search input has `aria-label` per app mode.
- **Map attribution** ([#119](https://github.com/Civic-Minds/Atlas/issues/119)): Compact MapLibre attribution control restored.
- **process-gtfs parity** ([#120](https://github.com/Civic-Minds/Atlas/issues/120)): Manual process archives zip and updates `lastFeedExpiry`/`lastFeedVersion`.
- **Supplemental options** ([#121](https://github.com/Civic-Minds/Atlas/issues/121)): Supplemental feeds receive full `ProcessOptions` in refresh.
- **IDB cache bust** ([#122](https://github.com/Civic-Minds/Atlas/issues/122)): `CACHE_BUILD` auto-increments on successful refresh uploads.
- **Corridor tiers** ([#123](https://github.com/Civic-Minds/Atlas/issues/123)): Corridor features use `HEADWAY_TIERS` bucket labels.
- **peekFeedInfo CSV** ([#124](https://github.com/Civic-Minds/Atlas/issues/124)): Feed info parsing uses Papa CSV instead of naive split.
- **Route card trunk frequency** ([#99](https://github.com/Civic-Minds/Atlas/issues/99)): Multi-branch routes (e.g. HSR 5) show combined shared-section headway in the sparkline by default; destination rows show terminal wait ranges. Branch hover switches sparkline to that branch.
- **Sidebar card continuity** ([#101](https://github.com/Civic-Minds/Atlas/issues/101)): Stop and agency cards reuse `RouteDirectionRow` styling — stacked labels/headways, shared `to …` branch formatting, consistent dots and typography.
- **Stop card route groups** ([#102](https://github.com/Civic-Minds/Atlas/issues/102)): Shared headway collapsed into one line per route with compact destination list — flat layout, no nested route cards.
- **Route card limited destinations**: Limited-service hint no longer repeats destinations already shown with regular headways (e.g. GO 41 Square One).

## [3.0.7] — 2026-07-06

### Added
- **Branch hover highlight ([#96](https://github.com/Civic-Minds/Atlas/issues/96))**: Hovering a destination row in the route card highlights that headsign's geometry on the map; sibling branches dim. Inbound (direction 1) branches reveal on hover. Sibling rows in the card fade while hovering.

### Fixed
- **Route card direction groups ([#97](https://github.com/Civic-Minds/Atlas/issues/97))**: Multi-direction routes show Westbound/Eastbound (etc.) section labels and a divider between groups. Two-group routes label by relative mean shape-end position; sort follows the same axis.
- **Route card sparkline ([#98](https://github.com/Civic-Minds/Atlas/issues/98))**: Headway chart uses outbound branches only by default (median per hour); follows the hovered branch when one is selected — fixes misleading tall-bar/dot patterns on multi-branch routes.
- **GRT agency card ([#93](https://github.com/Civic-Minds/Atlas/issues/93))**: ION light rail no longer summarized as "commuter rail" — blurb uses effective mode (same LRT remapping as map filters).
- **HRT sparkline bunching ([#91](https://github.com/Civic-Minds/Atlas/issues/91))**: Hourly tooltip capped to period headway when paired departures inflate frequency (e.g. Tide 800 at 7 PM).
- **HRT trunk range display ([#92](https://github.com/Civic-Minds/Atlas/issues/92))**: Tight "every X–Y min" range hidden when period headway is ≥20 min (sparse paired service).
- **Route card titles ([#95](https://github.com/Civic-Minds/Atlas/issues/95))**: Show route long names alongside numbers when the name adds information (aligned with HSR-style cards).
- **Frequency filter ([#94](https://github.com/Civic-Minds/Atlas/issues/94))**: Map and sidebar now hide routes above the selected max headway (tileFilter aligned with sidebar filter).
- **Local dev data loading**: Vite proxies `/atlas-data` to R2 so localhost bypasses browser CORS blocks on artifact fetches.
- **Map zoom gate**: Progressive route reveal by zoom now uses paint opacity (MapLibre filters cannot use `zoom` expressions).

## [3.0.6] — 2026-07-06

### Added
- **Agency expansion**: 24 new agencies + stub feed fixes — 343 → 367 total (Stockton, Modesto, Baton Rouge, Knoxville, McAllen, Augusta, Lincoln, South Bend, Rockford, Racine, Sudbury, Anchorage, Lexington, Champaign, Kalamazoo, Laredo, Thunder Bay, Greensboro, Winston-Salem, Allentown, Harrisburg, Jackson MS, Lancaster, Scranton/Wilkes-Barre, PATCO; plus Sarnia, Port Huron, TARTA, Madison).
- **`npm run discover-gaps`**: MDB `feeds_v2.csv` spatial anti-join + population ranking → `tmp/gap-candidates.json`.
- **`docs/AGENCY_BACKLOG.md`**: Canonical prioritized expansion queue; linked from `AGENCIES.md` and `ROADMAP.md`.

### Fixed
- **Duplicate slugs**: Removed duplicate `cota` entry; renamed Youngstown `wrta` → `youngstown-wrta` (Worcester keeps `wrta`).

## [3.0.5] — 2026-07-06

### Added
- **Pipeline Concurrency**: Introduced parallel processing to pipeline stages (agency feed refreshes, PMTiles metadata downloads, and history snapshot compilation).
- **R2 Retry Logic**: Implemented robust retry handling with exponential backoff for R2 GET and LIST actions to prevent SSL/socket hangups under high concurrency.

### Fixed
- **GRTC missing directions ([#82](https://github.com/Civic-Minds/Atlas/issues/82), [#84](https://github.com/Civic-Minds/Atlas/issues/84))**: Union full-route shape clusters in the pipeline so separate weekday/weekend `shape_id`s no longer drop an entire direction from GeoJSON.
- **Map route count badge ([#83](https://github.com/Civic-Minds/Atlas/issues/83))**: Align PMTiles `tileFilter` with `passesRouteFilter` (period + worst-direction headway); remove duplicate headway filter in MapCanvas.
- **RGRTA misleading headway ranges ([#80](https://github.com/Civic-Minds/Atlas/issues/80))**: Per-headsign trunk headways (`headsignMinStopHeadwayByPeriod`) so competing branches don't produce optimistic "every 13–30 min" ranges.
- **CDTA BusPlus casing ([#81](https://github.com/Civic-Minds/Atlas/issues/81))**: Normalize `Busplus` → `BusPlus` in route title display.
- **Refresh GTFS feeds workflow**: Fixed failure in `refresh-feeds.yml` by adding the missing `R2_PUBLIC_URL` environment variable to the `build-history` step.
- **Workflow Error Handling**: Updated `pipeline/build-history.ts` to call `process.exit(1)` on error so that failures in history generation fail the workflow rather than passing silently.
- **Git Push Failure**: Added `git pull --rebase origin main` before `git push` to prevent weekly refreshes from failing when concurrent commits are pushed.
- **Node.js Deprecation**: Bumped Node.js setup version from `20` to `22` in `ci.yml` and `refresh-feeds.yml`.
- **Security**: Fixed CodeQL "Incomplete URL substring sanitization" in `pipeline/audit-feed-urls.ts` (use parsed hostname with exact + safe `.endsWith('.mobilitydatabase.org')` + gated GCS `mdb-latest` path check).

## [3.0.4] — 2026-07-06

### Added
- **Visalia Transit** and **Green Bay Metro**.
- Gap additions: COTA (Columbus OH), Des Moines DART (IA), Wichita Transit (KS), Appleton/Valley Transit (WI).

### Changed
- Refreshed feeds + R2 artifacts for waukesha-metro, tulare-county-transit, visalia, green-bay (plus prior pace).

### Fixed
- **GitHub Actions refresh-feeds (and CI)**: bumped ancient checkout/setup-node; refresh script no longer fails the job on partial errors (expired feeds etc.).

## [3.0.3] — 2026-07-06

### Changed
- **Changelog**: restored versioned release notes after 3.0.2 (no functional changes).

