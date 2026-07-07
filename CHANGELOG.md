# Changelog

## [Unreleased]

### Fixed
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

### Changed
- **Agency card mode filters**: Replaced the prose blurb (`subway and light rail, 23 express routes`) with tappable pills that filter the route list (Subway · 4, Light rail · 12, Express · 23, etc.).

### Changed
- **Corridors mode**: Header **Corridors** toggle (like Live); self-contained From/To panel on the map — no longer hijacks the main search bar; shares global day filter; stop card **Corridors from here…** entry.
- **App drawer hidden**: Removed waffle menu from header again; History/Fares remain URL-only until ready (reverts [#115](https://github.com/Civic-Minds/Atlas/issues/115)).
- **Near You panel**: Removed close button; panel clears when location is dismissed from the map.
- **Near You headways**: “Every X min” respects the selected day and period filter (`headwayByPeriod`), not midday headline only.
- **Near You loading**: Shows spinner while agency GeoJSON loads instead of “No routes within 500 m”.
- **Near You dismiss** ([#139](https://github.com/Civic-Minds/Atlas/issues/139)): Panel closes on outside click (same pattern as filter chips).
- **Search suggestions**: Section headers match content — Recent searches / Recent routes / Suggested routes (or agencies in Fares); both recent and suggested routes can show together.
- **Live Vehicles**: Vehicle detail rows use fleet labels or ordinals instead of raw UUIDs; route list drops redundant "Route N" suffix; multi-agency headers match suggestion section style.
- **Panel tokens**: Shared `PANEL_TITLE_BAR`, `PANEL_SECTION_HEAD`, `PANEL_CARD_HEADER`, etc. in `styles.ts`; Live Vehicles, Near You, and search suggestions use them.

## [3.0.9] — 2026-07-06

### Fixed
- **CI**: Pin `@emnapi/core` and `@emnapi/runtime` at 1.11.2 in `package-lock.json` so `npm ci` passes on Node 22 (Tailwind/Rolldown wasm optional deps).

## [3.0.8] — 2026-07-06

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

### Added
- **History adherence tests** ([#130](https://github.com/Civic-Minds/Atlas/issues/130)): Unit tests for `computeHistoryAdherence` timezone bucketing.
- **Stop click route highlight** ([#104](https://github.com/Civic-Minds/Atlas/issues/104)): Selecting a stop keeps connecting routes at full color/width; other visible routes fade to 15% opacity.

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

- Added Visalia Transit, Green Bay Metro.
- Gap additions: COTA (Columbus OH), Des Moines DART (IA), Wichita Transit (KS), Appleton/Valley Transit (WI).
- Refreshed feeds + R2 artifacts for waukesha-metro, tulare-county-transit, visalia, green-bay (plus prior pace).
- Fixed GitHub Actions refresh-feeds (and CI): bumped ancient checkout/setup-node, refresh script no longer fails the job on partial errors (expired feeds etc.).

## [3.0.3] — 2026-07-06
- Refresh: handle agencies that produce 0 features (e.g. flex/microtransit like Durango) without failing the job.

## [3.0.2] — 2026-07-06

- **Security fixes**: SSRF in live sidecar fetch (whitelist + encoding), tainted format string in console.error, incomplete URL substring sanitization in feed audit.
- Fixed TypeScript errors in SidebarControls (region access on agencyData) and RouteCardTitle (null agencyName) to make dependabot PRs pass CI.
- **DATA_OVERRIDES.md**: removed (deprecated; data overrides now tracked exclusively via individual GitHub issues with `data override` label + `issueUrl` per agency in `index.json`)
- Fixed refresh failures: updated ECO Transit feedUrl to working EVTA source; set lastFeedExpiry for Durango (flex feed) to skip 0-feature processing.
- Fixed sparkline period label making chart width vary; now reserves fixed slot so chart stays consistent width
- Sparkline hover tooltip no longer clips on left/right edge (edge-aware translate)
- URL: no trailing "?" on bare path (e.g. default / not /?)
- Search: "new york" / city names now match via region (in addition to "NYC")
- Route selection highlight uses full `agency::routeId` (prevents unrelated routes bolding on numeric id collisions e.g. NYC subway)
- Map route clicks now clear active search query (so route card actually appears / "pops up")
- RouteCardTitle now passes agencyName to getRouteLabel (helps name display in cards for special agencies)
- Empty search results now show a "No routes match your search" message
- **Sparkline bar tooltip**: hovering a bar shows a floating pill with the exact hour and headway (e.g. "9 AM · every 12 min"); hovered bar scales up slightly with an accent ring
- **CI**: sync `package-lock.json` (`@emnapi` entries were missing, causing `npm ci` to fail)
- **Period label on sparkline hover**: label now updates to the hovered period, not just the selected one; reverts on mouse-leave
- **Route card symmetric direction collapse**: routes where both directions share the same headway and no headsigns (e.g. TTC 512) now show a headway row instead of rendering blank
- **"Via" capitalization**: added `via` to the lowercase-preserve list in `titleCase` — "Finch via Pioneer Village" no longer renders as "Finch Via Pioneer Village"
- **Search results missing route names**: routes with a null GTFS `route_short_name` now fall back to `routeId` in search result display, preventing blank rows
- **TTC 506 Sparkline 2am Bug (AI-267)**: Fixed boundary mapping of hour 26 to `'overnight'` instead of `'late'` to align with period boundaries. Used `Math.max` between branch-specific start headways and terminal stop headways in the pipeline to prevent late-night schedule bunching/layover artifacts (e.g. 2-minute gaps at Main Street Station at 2 AM) from inflating route frequency.
- **TTC 35 Headway Ranges (AI-270)**: Updated pipeline to compute branch-specific, headsign-specific period and hourly headways. Prevented shared terminal stop headways from bleeding into different branches (e.g. `35A` vs `35B` both ending at Mount Dennis) by comparing branch-specific start headways with terminal stop headways using `Math.max`.

## [3.0.1] — 2026-07-06


- **Security fixes**: SSRF in live sidecar fetch (whitelist + encoding), tainted format string in console.error, incomplete URL substring sanitization in feed audit.
- Fixed TypeScript errors in SidebarControls (region access on agencyData) and RouteCardTitle (null agencyName) to make dependabot PRs pass CI.
- **DATA_OVERRIDES.md**: removed (deprecated; data overrides now tracked exclusively via individual GitHub issues with `data override` label + `issueUrl` per agency in `index.json`)
- Fixed refresh failures: updated ECO Transit feedUrl to working EVTA source; set lastFeedExpiry for Durango (flex feed) to skip 0-feature processing.
- Fixed sparkline period label making chart width vary; now reserves fixed slot so chart stays consistent width
- Sparkline hover tooltip no longer clips on left/right edge (edge-aware translate)
- URL: no trailing "?" on bare path (e.g. default / not /?)
- Search: "new york" / city names now match via region (in addition to "NYC")
- Route selection highlight uses full `agency::routeId` (prevents unrelated routes bolding on numeric id collisions e.g. NYC subway)
- Map route clicks now clear active search query (so route card actually appears / "pops up")
- RouteCardTitle now passes agencyName to getRouteLabel (helps name display in cards for special agencies)
- Empty search results now show a "No routes match your search" message
- **Sparkline bar tooltip**: hovering a bar shows a floating pill with the exact hour and headway (e.g. "9 AM · every 12 min"); hovered bar scales up slightly with an accent ring
- **CI**: sync `package-lock.json` (`@emnapi` entries were missing, causing `npm ci` to fail)
- **Period label on sparkline hover**: label now updates to the hovered period, not just the selected one; reverts on mouse-leave
- **Route card symmetric direction collapse**: routes where both directions share the same headway and no headsigns (e.g. TTC 512) now show a headway row instead of rendering blank
- **"Via" capitalization**: added `via` to the lowercase-preserve list in `titleCase` — "Finch via Pioneer Village" no longer renders as "Finch Via Pioneer Village"
- **Search results missing route names**: routes with a null GTFS `route_short_name` now fall back to `routeId` in search result display, preventing blank rows
- **TTC 506 Sparkline 2am Bug (AI-267)**: Fixed boundary mapping of hour 26 to `'overnight'` instead of `'late'` to align with period boundaries. Used `Math.max` between branch-specific start headways and terminal stop headways in the pipeline to prevent late-night schedule bunching/layover artifacts (e.g. 2-minute gaps at Main Street Station at 2 AM) from inflating route frequency.
- **TTC 35 Headway Ranges (AI-270)**: Updated pipeline to compute branch-specific, headsign-specific period and hourly headways. Prevented shared terminal stop headways from bleeding into different branches (e.g. `35A` vs `35B` both ending at Mount Dennis) by comparing branch-specific start headways with terminal stop headways using `Math.max`.

## [3.0.0] — 2026-07-05

### Added
- **Agency coverage expanded to 324 agencies** across Canada and the US — all provinces, all major US metros. See [index.json](public/data/index.json) for the full list.
- **IDB cache build version**: `CACHE_BUILD` counter in `agencyGeoWeekVersion()` — increment after mid-week data fixes to force browsers to re-fetch instead of serving stale IDB data
- **Sparkline click-to-period**: clicking a zone sets the period filter; clicking again resets to All
- **Sparkline hover**: zone highlights with background band; inactive bars preview in tier color
- **Period label beside sparkline**: period name shown inline right of chart
- **SidebarControls refactor**: extracted DisambiguationPanel, StopCard, RouteCardHeadway, LiveAdherenceCard, DirectionLabel, RouteDirectionRow — 1330 → 948 lines
- **Settings panel split**: Appearance (dark mode) and Filters sections with labeled dividers
- **History time-scrubber**: year slider to replay service changes on the map
- **History backfill**: annual snapshots for Community Transit (2016–2026), Kingston Transit (2016–2026), CDTA/Albany, GCRTA/Cleveland — via automated MDB backfill script (`pipeline/backfill-mdb-history.ts`)
- **MDB fallback feed URLs**: 48 agencies now have `mdbFeedUrl` fallback for pipeline resilience
- **Pipeline: worst-direction headway**: routes carry `worstDirectionHeadway`; filter gates on worst direction so a route passing one way doesn't appear if the return is too infrequent
- **Pipeline: bus sub-type detection**: `busSubType` field — `brt`, `express`, `coach`, `local`
- **Pipeline: short-turn variant metadata**: direction-0 features carry `shortTurnVariants` with headsign + trip share
- **Late + Evening periods**: Evening extended to midnight; Late added for midnight–3 AM. `--force` flag on `npm run refresh` for schema changes
- **Hourly sparkline**: per-hour frequency bars (5 AM–2 AM) with 90-min sliding window; replaces named-period bars
- **Live Vehicles app**: real-time vehicle positions via GTFS-RT; delay-status indicators, 15s polling, route search, route-grouped sidebar, Deck.gl GPU-rendered markers
- **Live polling**: TTC 503/504, TransLink 99 B-Line, STM 55, Edmonton 004, YRT VIVA Blue, Halifax 1 — with optional API key support (`apiKeyParamEnvVar`, `apiKeyHeaderEnvVar`)
- **GTFS-RT archiver** (Cloudflare Worker): archives TripUpdates every 5 min to `atlas-live`; 30-day retention cleanup cron; skips idle overnight polls; currently Burlington + Hamilton
- **Pipeline: static trips lookup**: `atlas/{slug}-trips.json` on R2 for live-vehicles direction/headsign enrichment when GTFS-RT feeds omit them
- **History: headway trend sparkline**: time-series SVG sparkline on RouteHistoryCard across snapshot years; period tabs
- **Staged agency support**: `staged: true` in `index.json` hides agencies until data is ready; pipeline auto-clears after first successful refresh
- **LOD route visibility**: routes appear progressively by tier as zoom increases — frequent rapid from zoom 0, frequent from 7, moderate from 9, infrequent from 11
- **History config on R2**: `atlas/history-config.json` fetched at runtime; no generated file committed to git
- **GeoJSON Web Worker**: `geoWorker.ts` parses large agency GeoJSON in background thread; graceful main-thread fallback
- **IndexedDB GeoJSON cache**: agency GeoJSON persists between sessions keyed by `{slug}-{weekVersion}`; stale entries pruned weekly
- **Search bar suggestions**: focus shows last 5 searches; falls back to recently viewed routes or popular routes in viewport
- **PMTiles + MapLibre GL JS migration**: replaced Leaflet; range-requested vector tiles from R2; 98% fewer cold-load data requests, 60 FPS panning
- **URL-based map state**: `?lat=`, `?lon=`, `?z=`, `?route=`, `?stop=` — shared links open the exact same view
- **Agency search**: typing an agency slug or name in the search bar filters the map to that network
- **Connection explorer**: stop card shows routes reachable within 10 min walk (120m–800m); cross-agency connections automatic
- **GTFS Fares V2 support**: pipeline parses `fare_products`, `rider_categories`, `fare_leg_rules`; prefers V2 adult products when present
- **Fare map app**: routes colored by base adult fare (Free / <$2 / $2–4 / $4–8 / $8+); `fare-overrides.json` on R2 for manual overrides
- **Shared UI primitives**: `LIST_ROW`, `SEARCH_PILL`, `SEARCH_FIELD`, `FLOATING_CARD`, `PANEL_ENTER`, transition constants in `styles.ts`; applied across all panels
- **Info panel**: agency browser with region filter chips, Live tab (polled routes), History tab (covered agencies)
- **URL routing**: `/apps/frequency`, `/apps/corridors`, `/apps/history`; SPA rewrite in `vercel.json`; browser back/forward works
- **Corridors band view**: `isCorridor` segments shown when Corridors opens with no From/To selected
- **History app** (`src/apps/History.tsx`): headway trends over time — agency search → route list → before/after headway comparison with sparkline, period tabs, vertical timeline, year scrubber
- **GitHub Issues data override pattern**: per-agency override documentation linked from route/agency cards
- **Multi-feed support**: `supplementalFeedUrls` per agency; zips merged before writing to R2
- **Warn on expired GTFS feeds**: `refresh.ts` compares `feed_end_date` against today and warns in CI logs
- **Pipeline: skip unchanged feeds**: compares `feed_end_date` / `feed_version` before processing; skips R2 writes if schedule unchanged; archives raw zips to `atlas-archive` when new
- **Pipeline: R2 pagination**: `r2List` follows `NextContinuationToken` — no longer capped at 1000 objects
- **`find-mdb` tool** (`npm run find-mdb`): queries MDB catalog and emits ready-to-paste `index.json` snippets
- **Stale schedule warning**: route cards show "Schedule may be outdated" in amber when today is past `lastFeedExpiry`
- **Station View stop-level headways**: each route row shows headway at the selected stop specifically, not the route's terminal headway
- **Frequency range on route cards**: when trunk stops have ≥35% better headway than the terminal, shows a range (e.g. "every 6–12 min")
- **Data overrides**: now tracked via per-agency GitHub issues (label `data override`) + `issueUrl` in index.json (UI links "We corrected this data"). Monolithic `DATA_OVERRIDES.md` deprecated.

### Changed
- **Frequency map now at `/`**: `APP_TO_PATH` updated; `/apps/frequency` remains an alias
- **App drawer hidden**: Corridors and History lack sufficient data to be useful; re-enable by uncommenting `AppDrawer` in `App.tsx`
- **Sidebar panel width**: `w-64` → `w-72` (288px) to prevent "Midday" label from clipping
- **Search bar width**: responsive steps bumped from `w-40/52/64` to `w-44/56/72`
- **Inter font applied globally**: was loaded from Google Fonts but never set on `html`
- **Near You panel**: redesigned to LIST_ROW style — each row shows its own nearest stop name and distance; removed misleading shared-stop header
- **Global UI scale**: root font-size 14px (from browser default 16px)
- **Responsive header**: unified flex layout with React portal for right section; chips collapse below 1024px into "More filters" panel
- **Filter chips**: static labels always; dot-only active indicator; "Period" renamed to "Time"; "Now" button removed (didn't belong in either chip)
- **Live Vehicles**: moved from app drawer to standalone header button (Radio icon); minimum zoom gate at z9
- **Fares app hidden**: `available: false` — pending fare card UX
- **Fare data**: manual base fare overrides moved from `index.json` to R2 `fare-overrides.json`; richer fields (`label`, `zones`, `adultCash`, `free`, `fareUrl`) per agency
- **Stop card**: agency names as plain text (not pill buttons); nearby connections section visually separated with thick top border
- **Agency filter**: "None" deselects in-viewport agencies only; bbox/center intersection for visibility check; always-visible on/off dot per row
- **Frequency map: zoom-based progressive rendering**: GPU MapLibre step expression — below z7 only ≤10 min routes; z7–9 shows ≤20 min; z9+ applies headway pill
- **Disambiguation popup sorted numerically**
- **Live Vehicles: viewport-based multi-agency polling**: polls all agencies whose bbox overlaps current viewport in parallel; removed agency selector dropdown
- **Headline headway uses terminal stop midday period**: was all-day average; midday (9am–3pm) is more representative; falls back to all-day for peak-only routes
- **History agency panel redesign**: purpose-built `HistoryAgencyPanel` showing first→last headway per route with change direction color-coding
- **History: focus-triggered suggestions panel**: appears on search focus; Escape or map click dismisses
- **Screen transitions**: History slides up/down, Corridors fades, header chips fade on app switch
- **index.json refactor**: R2 artifact URLs derived via `getAgencyArtifactUrls`; JSON Schema + `npm run validate-index` added
- **process-gtfs.ts**: accepts remote `https://...` GTFS URLs directly (auto-downloads to `tmp/`)
- **Stats pills relocated**: moved from header to `bottom-6 right-14` map overlay; hidden while loading
- **Live adherence card**: stop rows clickable; deviation labels rounded to whole minutes; sorted by worst deviation first
- **Live button redesign**: pill with green dot + "Live" label; border when inactive, accent fill + pulsing dot when active
- **Centralized configs**: `TIME_PERIODS`, `HEADWAY_TIERS`, `STATUS_COLORS`, `Z_MAP_OVERLAY`/`Z_PANEL`/`Z_HEADER` etc. in `shared/config.ts` and `styles.ts`; removed scattered duplicates across 12+ files
- **MapCanvas tile filter centralized**: `useIntervalStats` returns `tileFilter` expression derived from the same inputs as `passesRouteFilter`; MapCanvas only adds map-state clauses
- **Sidebar panel left position centralized**: `sidebarLeft` prop threaded from App.tsx via ResizeObserver measurement; `SIDEBAR_LEFT_FALLBACK = 182` as single fallback
- **Various refactors**: extracted `RouteListRow`, `HeadwaySparkline`, `ServiceTimeline`, `StopInput`, `RouteGroupCard`, map utilities (`mapStyle.ts`, `mapHtml.ts`), `RouteCardTitle` — reduced file sizes across MapCanvas, Corridors, SidebarControls, History
- **GTFS-RT archiver**: switched from raw protobuf (~1.5 MB/poll) to compact JSON (~5–20 KB); corrected cron to `*/5 * * * *`
- **Dependency updates**: `@aws-sdk/client-s3`, `lucide-react`, `papaparse`, `playwright`; `actions/checkout` v4→v7, `actions/setup-node` v4→v6

### Fixed
- **index.json**: decoded unicode escapes in Quebec agency names (RTC, STLévis, Sherbrooke); corrected Bustang Outrider center
- **Loading spinner**: now fires on MapLibre `sourcedataloading`/`idle` — shows when PMTiles tiles are streaming even if GeoJSON is already cached; "Loading map..." for tile-only, "X/Y networks" when fetching GeoJSON
- **"ST" all-caps in stop names**: removed `St` from `TRANSIT_ACRONYMS`; was uppercasing "Street" in stop names (e.g. "Nassau ST"); standalone "ST" still uppercases via ≤3-char rule
- **Route card missing for stale-cached agencies**: `CACHE_BUILD` counter in `agencyGeoWeekVersion()` forces re-fetch after mid-week data fixes
- **Bustang/Outrider cards missing in Denver**: added explicit bboxes covering actual route extents
- **RTD Denver showing no routes**: slug was pointing at Bustang feed (mdb-2280); re-processed from correct mdb-178
- **Near You panel**: each route now shows its own nearest stop; was showing `routes[0].nearestStopName` as a shared header
- **Agency filter: deselecting had no effect on map**: `selectedAgencies` was only applied to sidebar/stats, never to the PMTiles tile filter
- **Headsign display all-caps**: reduced ≤4-char uppercase preservation to ≤3 — "LOOP" now title-cases; real 4-char acronyms (BART etc.) are in `TRANSIT_ACRONYMS`
- **Route 330 stop card headway**: peak-only routes with fewer than 3 midday/PM trips now excluded from stop card for that direction rather than showing misleading all-day median
- **Worst-direction tier promotion bug**: Step 4 terminal headway override can now only degrade a tier, never promote; prevents AM-peak cluster inflation
- **Direction-less feed headway understatement**: `synthesizeMissingDirections` assigns direction_id via shape/headsign clustering when feed lacks `direction_id` column
- **Loop route parent station headway inflation**: parent station credited with only one visit per trip; fixes multi-bay stations over-counting departures
- **Pipeline: feed expiry date parsing**: strips surrounding quotes from `feed_info.txt` fields (Hamilton uses quoted CSV values)
- **Search route list alignment + agency headers**: flex-1 truncation misalignment fixed; "(CITY)" parens stripped from route card headers
- **Duplicate destination rows**: pipeline and UI now dedup on cleaned headsign
- **Frequency filter for infrequent routes**: map tile expression now treats `tier==='infrequent'` as 9999 to match `passesRouteFilter` JS logic
- **Blank map for newly added US agencies**: `atlas.pmtiles` was not rebuilt after adding agencies; routes invisible until PMTiles regenerated
- **Back button stuck after leaving Fares app**: `moveend` and URL-sync effects migrated to `window.history.replaceState` to avoid stale React Router closure capturing `/apps/fares` pathname
- **Corridors/Live Vehicles capturing events when invisible**: added `inert` attribute to root div of each — suppresses pointer/keyboard events unconditionally including children with explicit `pointer-events-auto`
- **Fares app breaking all map interactions**: was rendering a second `Interval` (second MapLibre map) on top of the main one; fixed by removing separate `Fares` component and passing `fareView={inFares}` to the main `Interval`
- **Map route selection fits full extent**: was using `queryRenderedFeatures` (only in-viewport tiles); now scans in-memory GeoJSON for the correct agency
- **Disambiguation threshold**: lowered from zoom 13 to zoom 11 so clicks on dense corridors at normal city zoom show the route picker
- **Live Vehicles: agencies outside viewport shown in sidebar**: route list now filtered to vehicles within current map bounds
- **Live Vehicles: route card header inconsistent**: shared `RouteCardTitle` component; same `text-sm font-black` + `getRouteLabel()` in frequency and live cards
- **Live Vehicles: vehicle detail showed "—"**: groups by headsign when available; falls back to cleaned vehicle ID
- **Fares: STM search showing 187 routes**: Fares mode now shows agency fare cards in search, not individual routes
- **Fares: suggested agencies showing wrong-area/duplicates**: suggestions now scoped to loaded viewport agencies; deduped by name
- **Fares legend**: replaced circle dots with horizontal line swatches matching map rendering; tightened spacing
- **Sparkline hover**: switched from `nativeEvent.offsetX` (breaks on child elements) to `getBoundingClientRect` + `clientX`
- **SidebarControls parse error**: `return ({(() => {` is invalid JSX; fixed to `return (() => {`
- **Route label cleanup**: suppress terminus-style 1–2 word long names for numeric routes; strip "Via [location]" routing qualifiers; suppress BRT brand names from terminus suppression list; strip leading "- " after prefix removal; suppress redundant "G Line — G-Line Rapid Ride" patterns
- **Route card**: removed back button from frequency map card; collapsed identical no-headsign directions; `line-clamp-2` on long titles; left-aligned stale schedule notice
- **Stop card**: removed redundant "Station View" header; destination prefix wrapping fixed
- **Agency card**: removed debug slug mono text; region + route count as single muted text line
- **Agency filter pill**: `shortenAgencyName` truncates long formal names to clean short forms
- **Info button color**: `text-dim` → `text-muted` at rest (was looking disabled)
- **Live button**: neutral dot when Live is off; was green regardless of state
- **Route lines antialiasing**: `antialias: true` on MapLibre constructor; zoom-interpolated line-width/opacity
- **Stats pills hidden while loading**: suppress "0 routes / 0%" during pan to unloaded area
- **Z-index stack**: named constants in `styles.ts` replace scattered `z-[500]`/`z-[1000]` etc. across 12 files
- **Time filter**: Late (11pm–2am) and Overnight (2am–6am) periods added; `getNowPeriod` correctly maps early-morning hours to GTFS 24+ notation; period chips now toggleable
- **App drawer cursor flickering**: added `cursor-default` to dropdown panel wrapper; `button:disabled { cursor: not-allowed }` as global CSS rule
- **InfoPanel slide carousel offset**: replaced fragile horizontal slide container with clean conditional rendering; fixed margin/clipping bugs
- **Station stop grouping**: sibling stops grouped by name; multi-agency proximity grouping within 120m; major station hubs shown at zoom 12–15
