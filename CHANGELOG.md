# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

### Fixed
- **GO rail terminus pattern splitting**: GO rail routes (e.g. Kitchener line) now split by headsign so each terminus (Bramalea GO, Kitchener GO) gets its own frequency analysis and its own correctly-sized GeoJSON shape. Selecting ≤60 min shows only the Bramalea segment; Kitchener (sparse midday service) remains span. Implemented via headsign-keyed grouping in `transit-phase1.ts`, per-headsign shape maps in `process-core.ts`, and headsign propagation through `transit-phase2.ts`.
- **GO rail tier classification uses midday window**: full-window analysis created a ~90-min afternoon gap (e.g. KI 16:04→17:34) that broke the tier=60 grace check, forcing all terminus patterns to `span`. Rail outbound (`dir=0`) now classifies tier and computes display headway from the same 09:30–14:30 midday window; falls back to full window when midday has <2 trips (Milton, Richmond Hill correctly stay `span`).
- **Schedule-period dedup overwriting best tier**: when a `tier=span` (null headway) result from one GO schedule period was processed after a real-tier result from another period, the dedup guard skipped its check and the span result overwrote the better one. Fixed: `null` headway never replaces an existing feature. Resolves LW showing "every 96 min" (AI-63).
- **GO rail headsign prefix stripped from display**: terminus headsigns like "KI - Bramalea GO" are now stripped of their route-code prefix before being stored in GeoJSON properties ("Bramalea GO"), matching the UI's existing headsign cleaning.
- **Oakville 86B showing "every 5 min"**: 86B has 3 trips total; the 5-min gap between its 2 in-window trips was previously escaping the `isLimitedService` guard in older pipeline builds. Current pipeline correctly classifies it as `span`. Resolved on next refresh (AI-62).

### Added
- **Station View agency filter pills**: when a stop is served by more than one agency (e.g. a GO/TTC interchange stop), filter pills appear above the route list so the user can narrow to one agency at a time. Pills reset when a new stop is selected.

### Changed
- **Filter dropdown layout unified**: Mode and Agencies dropdowns now use the same `flex wrap` pill layout as Frequency and Day — Mode was a 2×2 grid, Agencies was a full-width stacked list, both are now pill rows consistent with the rest of the filter chips.

### Fixed
- **GO Transit rail headway using midday window**: full-day analysis (7am–10pm) clusters peak trains every 8–10 min and drags the median to ~16 min even when midday service is every 30 min. Rail `dir=0` (outbound from hub) now computes display headway from a 09:30–14:30 midday window. Tier classification still uses the full window so peak-only lines (Milton, Richmond Hill) correctly get `span`.
- **GO weekday rollup inflated by outlier days**: the Weekday rollup was merging all 5 days' departure times into a union set. When one day has a different schedule (e.g. extra Friday trains, event-day service), those extra trips inflate the apparent midday frequency. The rollup now picks the single most-representative day — the one whose midday trip count is closest to the median across all weekdays — and computes stats from that day's times only.

### Added
- **Accent CSS variable system**: all accent colours now come from `--accent`, `--accent-bg`, and `--accent-border` CSS variables (light/dark values in `index.css`). Replaced every scattered `indigo-*` Tailwind class across the UI. Changing the two `:root` colour values repaints the entire app.
- **Zoom-based stop visibility**: stop markers now show at three levels — all stops at zoom ≥ 14, hub stops only (4+ routes) at zoom 13, none below 13. Hub stops render slightly larger (radius 4 vs 3). Stops and route lines are mounted on separate Leaflet layers so zoom changes don't remount the (much larger) route layer.
- **Smooth map zooming**: `zoomSnap={0.25}`, `zoomDelta={0.5}`, `wheelPxPerZoomLevel={120}` on `MapContainer` for sub-integer zoom steps and slower mouse-wheel panning.
- **Live polling filter in useIntervalStats**: `livePollingOnly` filter prop hides all routes not covered by Atlas's GTFS-RT adherence polling. Driven by `src/utils/livePolling.ts`, which lists the covered agency/route pairs.

### Changed
- **Route panel direction rows**: headsign ("to Aldershot GO") moves to the top of each direction row; the tier dot + "every X min" line sits below it. Gives destination context before frequency number.
- **Route and stop name title-casing**: GTFS long names and stop names are now display-cased at render time (e.g. "KING STREET WEST" → "King Street West"). Applied in the route panel header, station view header, and stop tooltip.
- **Station View is text-based**: routes at a stop are now listed as text entries (bold route number, indented `→ Headsign` lines) instead of the previous blob-badge layout. Headsigns are cleaned of agency prefix codes (e.g. "LW - Aldershot GO" → "Aldershot GO").
- **MapCanvas mutual exclusivity**: clicking a stop clears the selected route, and clicking a route clears the selected stop. Both panels can no longer be open simultaneously.
- **Stop tooltip**: removed the "X routes serve this hub" count (it was derived from raw `routeIds` and didn't match the deduplicated count shown in the panel); tooltip now just shows "Station" + title-cased stop name.
- **GO Transit rail headway uses median**: `process-core.ts` now uses `medianHeadway` (instead of `avgHeadway`) for `route_type=2` (rail) routes. GO peak trains cluster heavily and drag the mean down to ~11 min even when midday service is every 30 min; median gives the representative off-peak figure.
- **Hide irregular routes on by default**: `hideSpan` now initialises to `true` so span-only (peak/school/shuttle) routes are hidden on first load.

### Fixed
- **Stop and route panels showing simultaneously**: clicking a stop didn't clear the selected route (and vice versa), so both panels rendered at once. Fixed with mutual-exclusivity logic in `MapCanvas` click handlers.
- **Stop tooltip route count didn't match panel**: tooltip said "4 routes" but the panel showed 2 because the panel deduplicates by `routeShortName` while the tooltip used raw `routeIds.length`. Removed the count from the tooltip entirely.

### Added
- **Real-Time GTFS Proxy**: Added `api/gtfs-rt.ts` to proxy and parse binary GTFS-RT TripUpdates into JSON for easier consumption.
- **Schedule Adherence Polling**: Implemented `api/cron/poll.ts` to record predicted vs. scheduled arrivals for Burlington Route 1 and Hamilton B-Line every minute. Each snapshot now includes per-stop headway-vs-scheduled diff (`headwayDeltaMin`) and per-trip segment drift (`entryDelayMin`, `exitDelayMin`, `driftMin`) to detect bunching and early running.
- **Vercel Cron Configuration**: Added `vercel.json` to manage the minute-by-minute polling schedule and API rewrites.
- **Live adherence display**: Selecting Burlington Route 1 or Hamilton Route 1 in the route panel now shows a pulsing "Live" badge with current avg headway delta vs. schedule and a per-trip on-time/late/early breakdown, via a new `api/live-status.ts` Blob proxy and `useLiveAdherence` hook (60s polling).

### Changed
- **Google Maps-style floating UI**: replaced the spanning header bar with independent floating pills — logo, search, on-screen/coverage stats (top-left) and filter chips, settings, dark-mode toggle (top-right) — instead of one combined header bar or combined controls. Stripped remaining all-caps text and decorative icons from the filter UI.
- **Frequency/Mode/Day/Agencies filters broken out into chips**: all four filters now live as standalone pill buttons beside the settings button (Maps' category-chip pattern) instead of inside a single dropdown. Each chip keeps a static label (e.g. "Frequency") with a small dot indicator, and opens its own small dropdown to change the value. Frequency and Day always show their dot/active styling since neither has a true "no filter" default (60 min still excludes Infrequent routes; Weekday still excludes weekend service); Mode and Agencies only show it once something is actually selected. Live polling and hide-irregular are the only toggles left in the (now renamed) Settings popover.
- **On screen / Coverage stats as pills**: lifted out of the sidebar panel entirely and shown as small inline pills next to the search bar (via a new `onStatsChange` callback from `Interval` up to `App`), instead of boxy stat cards inside the sidebar. Coverage percentage no longer uses indigo coloring, since the color didn't correspond to anything meaningful.
- **Sidebar detail panel decluttered and flattened**: removed the "Interval" title/description text and the standalone Reset button (clicking outside the panel already closes it). Route/stop detail blocks no longer render as a nested card-in-card — the inner background/border wrapper was removed so they sit directly on the panel surface. The panel itself now renders nothing (instead of an empty shell) when there's no stop/route selected and no active search.
- **Sidebar panel aligned with search bar**: width matched to the search pill (`w-64`) and left-aligned with the search bar's left edge instead of the outer page margin, so the panel doesn't appear to start further left than the search bar above it.

### Fixed
- **GO Milton (MI) showing false all-day frequency**: Milton line is rush-hour-only — each direction runs a short AM or PM peak window covering less than 40% of the weekday analysis window, but was classified as tier 15/60 with headways like "every 15 min." Routes whose active span covers less than 40% of the day window (or ≤90 minutes total) are now classified as `span` with null headway, same as school runs and shuttles.
- **GO refresh taking 30+ minutes locally**: stop-to-route indexing in `process-core.ts` was O(stop_times × trips) via repeated `.find()` calls, plus O(stops × routes) reverse lookups. Replaced with trip/stop maps for O(1) lookups so large feeds like GO Transit refresh in a few minutes instead of hanging the machine.
- **Redundant TTC headsigns**: stripped redundant "Line X (Name) towards" prefixes and identical-to-line-name headsigns from the display labels, specifically fixing TTC subway directions (e.g., "to Line 4 (Sheppard) towards Don Mills" now shows as "to Don Mills").
- **Filter chip dropdowns clipped off-screen**: dropdowns were anchored `left-0` on their trigger chip, which overflows the viewport since the chip row sits at the right edge of the screen. Anchored to `right-0` instead so they open leftward.
- **Station View only showed a route count, not route names**: clicking a stop showed "N routes depart from here" with no way to see which routes. Stop features only carry raw `routeIds`, not names — names are now cross-referenced from route features in `layers` and shown as badges.

### Fixed
- **Sidebar panel couldn't scroll to the bottom**: the scrollable panel was a flex child with no `min-h-0`/`flex-1`, so it grew to fit its content instead of being constrained by the parent's max-height — `overflow-y-auto` never actually kicked in. Agency list (and anything below it) was unreachable when the panel content exceeded the viewport. Fixed by making the scroll container a proper shrinking flex child.
- **Route lines very hard to click**: thin route lines (1–4px) had a click hit-area equal to their visual width, since Leaflet's Canvas renderer ties click tolerance directly to stroke `weight`. Added an invisible 16px-wide "hit" line under each route purely for click/tap detection, so thin lines stay visually unobtrusive but are much easier to select.
- **Search results showed only a count, not which routes matched**: typing a query surfaced "N routes match" with no way to see or jump to them. The match list now shows each matching route's number and agency, clickable to open its detail panel directly.
- **TTC Route 954 (and any route with AM/PM-split shape IDs) showing a false frequency tier**: TTC's GTFS gives the morning-peak and afternoon-peak blocks of the same physical route *different* `shape_id`s despite identical geometry (confirmed: both directions' AM/PM shape pairs have identical point counts). The phase-1 "most common shape" analysis filter — added earlier to stop short-turn branches from skewing headway — picked whichever block had marginally more trips and silently discarded the other, so a rush-hour-only express (954) was analyzed using only its PM block and came back as a normal ~12 min tier instead of `span`. Fixed by grouping shape_ids by point-count equivalence before filtering, so geometrically identical AM/PM blocks are now analyzed together; genuine branches/short-turns (which differ in length) are still excluded as before.
- **Route info panel showing duplicate "directions"**: The panel matched every feature for a route across all three day types (Weekday/Saturday/Sunday) instead of just the currently selected day, so a 2-direction route like DRT 905 showed up as 6 "directions." `SidebarControls` now filters by the active day before building the directions list.
- **Stale Blob data after refresh**: Agency GeoJSON is served from Vercel Blob with `cache-control: max-age=2592000` (30 days). Browsers that had already fetched an agency's data would keep serving the pre-refresh version for up to 30 days, making weekly auto-refreshes invisible until a hard refresh. `useAgencyData` now fetches with `cache: 'no-store'` so refreshed data is picked up on a normal reload.
- **School/shuttle routes claiming false frequency tiers**: Routes whose trips are compressed into less than 90 minutes of the analysis window (school runs, shuttle bursts, depot moves) were passing the `determineTier` check and showing "every 1 min" or similar impossible headways. Added a span guard: any route with service span < 90 min is classified as `span` and excluded from the tier display. YRT route 417 (Bill Hogarth SS, every 1 min) and similar routes now correctly show as span.
- **DRT 905 only showing Whitby–Oshawa segment**: The full Pickering→Oshawa corridor shape (1921 pts) lost the display-shape selection to a shorter 700-pt shape because it had fewer trips. The new longest-display-shape logic now correctly selects the 1921-pt shape for display. DRT and YRT refreshed to apply both fixes.
- **Bus branch routes not showing full extent**: The pipeline selected the most-common shape per route direction for both display and frequency analysis. On routes with branching variants (e.g. HSR Route 5 via Downtown Dundas), the branch with fewer trips always lost — Route 5's Dundas branches were invisible on the map. Fixed by splitting shape selection into two maps: display uses the longest shape (full branch extent) while analysis keeps the most-common shape (correct headway from main-route trips).
- **Hamilton stale Blob data**: Hamilton Blob data dated from the August 2025 schedule. Route 51 (University, suspended April 26 2026) was appearing as active; Routes 5, 33, 34, 35, 52 were missing from the Dundas area. Refreshed Hamilton from the live HSR feed.
- **ION headway wrong (AI-55)**: GRT Route 301 was showing "every 9 min" instead of every 10 min. The `getActiveServiceIds` function was unconditionally including single-occurrence holiday replacement services (Family Day, Good Friday) alongside the regular weekday service, adding 26 spurious departure times that created artificial 5-minute gaps. Fixed by splitting candidateDates processing into two passes — regular/weekly services first, then count=1 services only if no regular service exists (preserves WSF-style feed support).
- **GO Transit straight-line visuals (AI-56)**: Combined frequency corridor features were being generated for GO Transit's all-rail feed, producing hundreds of 2-point stop-pair chord features that rendered as orange straight lines fanning out from Union Station. Corridors are now skipped for feeds where every route is `route_type=2` (rail), since rail lines run on dedicated single-operator corridors where aggregate stop-pair frequency is not meaningful.
- **GO Transit duplicate route lines (AI-56)**: GO Transit encodes schedule change dates in route IDs (e.g. `04260626-LW` and `06260926-LW` for the same Lakeshore West line in two periods). Both period's routes were active in the analysis window, producing two overlapping LineString features per line. Pipeline now deduplicates route features by `(routeShortName, directionId, day)`, keeping the lower-headway (busier) service period.
- **Combined corridor straight-line diagonals**: Bus-agency corridor features (2-point stop-pair chords from AI-17) were rendering as long diagonal straight lines crossing the map — notably going across Lake Ontario and not following road or rail geometry. On express routes where adjacent stops are far apart, these chords create misleading diagonals that obscure actual route shapes. Corridor features are now hidden entirely in the frontend; individual route lines already convey frequency via colour tier, so corridors added visual noise without useful information.
- **Burlington holiday service inflating weekday frequency**: Burlington Transit encodes holiday service (e.g. Victoria Day) in `calendar.txt` with `start_date === end_date` and all DOW flags set to `1`. These single-day entries were being included alongside regular multi-day weekday service, nearly doubling trip counts and halving the apparent headway (Route 1 appeared to run every 10 min instead of ~30 min). `getActiveServiceIds` Step 1 now uses the same two-pass approach as Step 2: multi-day services in Pass A; single-day entries only in Pass B if Pass A found nothing.
- **Shape filter built from wrong service period (DRT)**: DRT encodes schedule version in shape IDs (e.g. `-2026-04` vs `-2026-06`). The dominant-shape calculation was counting across ALL trips, including future-period trips, which selected a shape ID that no current-period trip matched — silently dropping every trip and producing missing or wildly incorrect headways. Shape counts are now built only from trips whose `service_id` is active in the current period (`detectReferenceDate` + `getActiveServiceIds` across Mon/Sat/Sun). Fixes DRT 905 and any other agency with versioned shape IDs.
- **GO rail lines in wrong tier or hidden**: Rail short-turn trips (e.g. GO Union→Bramalea) were being excluded by the dominant-shape filter, leaving only the handful of end-to-end trips and inflating computed headways by ~6×. Rail routes now bypass the phase-1 shape filter entirely — all trips count toward frequency, while the longest shape is still used for display geometry. Additionally, the rail tier array was missing `60`, so any rail route averaging >30 min fell into `tier=span` and was hidden by default. Added `60` to `modeTierOverrides.rail`.

### Added
- **Headsign-based direction labels**: route panel directions now show "to {headsign}" (e.g. "to Whitby Station") instead of generic "Direction 1"/"Direction 2", with light normalization stripping agency branch-letter prefixes (e.g. DRT's "A - Windfields Farm" → "Windfields Farm").
- **Hide irregular/peak-only routes toggle**: new advanced filter to hide routes with no sustained frequency tier (school runs, shuttles, rush-hour-only express routes) — the existing max-headway slider doesn't catch these since they fall back to raw average headway.
- **Light mode default**: map now defaults to light mode; dark mode still available via the toggle.
- **Auto day-type**: day selector (Weekday/Saturday/Sunday) now initialises to today's actual day instead of always defaulting to Weekday.
- **GO Transit rail**: 7 rail lines (Lakeshore East/West, Kitchener, Barrie, Stouffville, Richmond Hill, Milton) added to the map using a rail-only filtered feed. Routes use actual shape geometry (longest shape per direction, not most-frequent short-turn pattern).
- **Stop dots hidden at regional zoom**: transit stop markers now only appear at zoom ≥ 13; at the regional overview zoom they were covering the entire map in thousands of overlapping circles. Stops mount as a separate Leaflet layer so zooming in/out doesn't remount route lines.

### Added
- **Combined frequency corridors (AI-17)**: overlapping routes on shared stop-to-stop links now emit corridor features with *combined* (union) headway. These render as slightly thicker overlays on top of the per-route lines, so corridor segments visually show the effective frequency provided by multiple routes (e.g. two 12 min routes → ~6 min combined corridor in the tighter color tier). Day and headway filters apply to corridors; station selection filters to corridors involving the stop's routes; search matches corridors via participating route IDs/names.
- **Route info panel (AI-18)**: clicking a route opens a detail panel in the sidebar — route name, agency, and per-direction headways with tier dots. The hover tooltip slims down to route name + headway; the click is now the way to get full detail.

### Changed
- **Viewport-scoped stats (AI-19)**: the "On screen" and Coverage numbers now reflect the current map view instead of the whole region — they recompute as you pan/zoom, using cached per-feature bounding boxes.
- **Clickable legend (AI-20)**: merged the redundant "Show up to" buttons and Legend swatches into one control — each legend tier row is now the frequency filter; tiers above the active threshold dim to show they're hidden. The wordmark also no longer renders all-caps (AI-16).

### Added
- **Clickable Stations**: Users can now click on transit hubs and stations to discover all routes departing from that location.
  - **Spatial Discovery**: Clicking a station filters the regional map to show only the specific routes serving that hub.
  - **Station View HUD**: Added a dedicated sidebar panel that displays the station name and route count when a hub is selected.
  - **Visual Feedback**: Selected stations are highlighted with an indigo pulse and white border for clear spatial focus.
  - **Integrated Reset**: Station selection is automatically cleared when global filters are reset or the map background is clicked.
- **Advanced Map Filtering**: Implemented a comprehensive multi-dimensional filtering system.
  - **Agency Filtering**: Toggle visibility for each of the 13 GTHA agencies (TTC, GO Transit, MiWay, etc.).
  - **Mode Filtering**: Filter routes by vehicle type (Subway, Streetcar, Rail, Bus).
  - **Day Selection**: Support for switching between Weekday, Saturday, and Sunday service levels.
  - **Collapsible UI**: Added an "Advanced Filters" section in the sidebar with active filter indicators and a Reset button.
- **Unit Testing Suite**: Integrated Vitest, JSDOM, and React Testing Library.
  - Added high-coverage tests for `useIntervalStats` hook and color mapping utilities.
- **Clickable Stations (Roadmap)**: Logged feature request for station-level route discovery via spatial mapping.

### Fixed
- **Theme Architecture Refactor**: Centralized all UI colors into CSS variables with a robust `data-theme` switching mechanism on the document root.
- **Persistent Light Mode**: Implemented theme persistence via `localStorage` and synchronized it across the header, map tiles, and side panel.
- **Dynamic Tooltip Colors**: Refactored route overlays to use CSS classes and theme variables, resolving the bug where tooltips remained in dark mode when the app was set to light mode.
- **Header Cleanup**: Removed the hardcoded "Greater Toronto & Hamilton Area" label from the masthead to reflect the expanded regional coverage.
- **Header Theme Consistency**: Fixed the menu bar/header failing to update colors in light mode by linking its background and text to the new theme architecture.

### Changed
- **Search Relocation**: Moved the route search bar from the sidebar to the global header for better UI space utilization and a more standard navigation experience.
- **Color Logic Extraction**: Moved all headway tiering and color mapping logic into a dedicated `src/utils/colors.ts` for better testability and reuse.
- **Modular 'Clean Architecture' Refactor**: Deconstructed the monolithic `Interval.tsx` into a modern modular structure.
  - Extracted data fetching and processing into `useAgencyData` hook.
  - Extracted search, filtering logic, and statistics into `useIntervalStats` hook.
  - Split UI into `MapCanvas` (Leaflet logic) and `SidebarControls` (HUD/filtering) components.
  - Reduced primary application logic from 14KB to <50 lines, significantly improving maintainability for future filtering features.
- **Full reset to the original premise**: a hosted map of how frequent transit service is. Deleted the OCI server, v0 realtime backend, Express API, router, Zustand, and Firebase. Atlas is now a static Vite + React + Leaflet app with no server and no database.
- Thinner line weights (frequent routes 3→2, others 1.5→1) for a less cluttered map at regional zoom.
- Canvas rendering for the ~1,000 simultaneous polylines.

### Added
- **Greater Golden Horseshoe expansion**: Barrie Transit, Grand River Transit, Guelph Transit, and Niagara Region Transit join the map — 13 agencies total. Bradford was evaluated but BWG Transit is on-demand only (no GTFS exists). GRT and Niagara use the Mobility Database stable mirror because their official URLs are dead or unreliable.
- **Single regional map**: all 9 GTHA networks load in parallel onto one continuous map — pan between cities like Google Maps, no agency switcher. Tooltips show the operating agency.
- **Route search**: search box filters routes by number or name across the whole region; matches highlight while everything else dims, with a live match count.
- **GTHA coverage**: 9 agencies live — TTC, Brampton, Burlington, Durham Region, Hamilton, Milton, MiWay, Oakville, YRT.
- **Pipeline → Blob architecture**: `pipeline/process-core.ts` turns a GTFS zip into GeoJSON (route shapes + weekday headway tiers); data is stored in Vercel Blob, keeping the repo at ~80 KB regardless of agency count.
- **`npm run refresh`**: re-downloads every agency's verified `feedUrl` and rebuilds its Blob data. All 9 source URLs tested live.
- **Weekly automation**: GitHub Action refreshes all feeds every Monday and commits index changes.
- **Production deploy**: https://atlas-gamma-two.vercel.app

### Fixed
- Brampton and Hamilton were built from expired local GTFS zips; both rebuilt from current published feeds.
- Cross-platform lockfile drift (`@emnapi/*`) that broke `npm ci` on Linux CI.
- Tooltip white border: stripped Leaflet's default tooltip background, border, and arrow via `.atlas-tooltip` CSS overrides so only the custom dark popup renders.
- Frequency filter showing routes above threshold: routes with `headway: null` were unconditionally passing the visibility check and rendering at any filter level. Null-headway routes are now hidden unless the filter is set to All.
- Short-turn trips inflating headway: the pipeline was computing headway across all trips for a route+direction, including short-turn variants that only cover part of the corridor. Phase 1 now accepts a shape filter and process-core passes the dominant shape per route+direction, so headway is computed only from trips that run the full pattern. Verified on Guelph Route 99 Mainline: corrected from 8m → 10m.

### Added
- **Route selection**: clicking a route highlights it at full color/weight and dims all other routes to dark grey; click the same route or the map background to deselect.
- **"All" frequency filter**: new button alongside the existing headway thresholds shows every route including infrequent ones (>60m), rendered in the existing Infrequent grey tier.
- **Light mode**: sun/moon toggle in the panel header switches between dark (CartoDB dark) and light (CartoDB light) map tiles with a fully adapted panel theme.

## [0.22.5] - 2026-05-12

### Added
- **Stops & Connections API**: Added new backend endpoints to support spatial intelligence:
  - `GET /api/stops/:agency`: Retrieves up to 2,000 stops for a specific agency.
  - `GET /api/connections/:agency/:stopId`: Identifies all distinct stops connected to a given stop within the same agency.

### Fixed
- **Deployment Script Restoration**: Restored the `scripts/deploy.sh` script to the repository root. It was accidentally moved to `v0/scripts/` during the V0 archive, which was causing the `npm run deploy` command to fail with a missing file error.

## [0.22.4] - 2026-05-12

### Fixed
- **CodeQL Security**: Addressed 4 security vulnerabilities identified by CodeQL and Dependabot:
  - Fixed incomplete URL substring sanitization in `v0/backend/src/ingestion/poller.ts` by explicitly parsing the URL hostname.
  - Added rate limiting via `express-rate-limit` to the SPA fallback route in `v0/backend/src/server.ts` to prevent potential DoS.
  - Set explicit `contents: read` permissions for the `GITHUB_TOKEN` in the `.github/workflows/ci.yml` workflow.
  - Re-generated `v0/backend/package-lock.json` to properly reflect the patched `@tootallnate/once` `>=3.0.1` dependency override.

## [0.22.3] - 2026-05-12

### Fixed
- **SQL Injection Hardening**: Refactored multiple backend services (`VehicleService`, `IntelligenceService`, `import-routes`) to eliminate dynamic SQL string construction, resolving 3 CodeQL security alerts.
- **Vulnerability Remediation**: Patched `@tootallnate/once` to `>=3.0.1` via package overrides to resolve a low-severity security finding.
- **Git Hygiene**: Updated `.gitignore` to exclude agent-specific context files (`CLAUDE.md`, `GEMINI.md`, `ATLASLOG.md`) and session handoff documents.

## [0.22.2] - 2026-05-12

### Fixed
- **Root Lockfile Sync**: Explicitly installed `@emnapi/core` and `@emnapi/runtime` to resolve a persistent `npm ci` failure in GitHub Actions caused by missing peer dependencies for `firebase`.

## [0.22.1] - 2026-05-12

### Fixed
- **Type safety in Alerts route**: Corrected a crash in `v0/backend/src/api/routes.ts` where the system attempted to access properties on a mismatched object type; added `AgencyService.getAgencyAccountBySlug` to properly resolve agency UUIDs.
- **CI/CD Lockfile Sync**: Synchronized all `package-lock.json` files across the repository to resolve build failures in GitHub Actions caused by dependency mismatches.
- **GTFS Route Mappings**: Expanded `getModeCategory` in the frontend to support extended HVT route types (100–1499), resolving a security/quality audit finding.
- **Archive typo**: Corrected "Renamed Strategy" in `CHANGELOG_ARCHIVE.md`.

## [0.22.0] - 2026-05-12

### Added
- **React Router**: Wired up `react-router-dom` with `BrowserRouter`; App becomes the layout shell. Routes: `/interval` (live), `/live` and `/reliability` stubbed as coming-soon nav items.
- **Zustand store** (`src/store/atlas.ts`): Centralized agency list, selected agency, and map center. Agency switcher in the header now writes to the store; Interval reads from it.
- **Interval mini-app extracted** to `src/apps/Interval.tsx`; App.tsx is now a pure layout/router shell.
- **Route names in tooltip**: Shapes endpoint now LEFT JOINs the `routes` table and returns `routeShortName` / `routeLongName`. Tooltip shows route short name + full name instead of raw `gtfs_route_id`.
- **Loading overlay**: Spinning indicator while shapes are fetching for a selected agency.
- **PM2 log rotation**: Installed `pm2-logrotate` on OCI (20MB cap, 3 rotations, compressed). Prevents disk-fill crashes.
- **`src/vite-env.d.ts`** and `vite/client` in tsconfig types so CSS side-effect imports pass type-check.
- **`server/tsconfig.json`**: New server-side tsconfig (CommonJS output, rootDir `src/`, outDir `dist/`).

### Fixed
- **`ChangeView` re-render bug**: Was calling `map.setView()` on every render. Now runs only when `center` coordinates actually change.
- **Hardcoded `http://localhost:3001` URLs**: All frontend fetches now use relative `/api/...` paths through the existing Vite proxy.
- **OCI disk full (100%)**: Systemd journal vacuumed (freed 1.1GB), PM2 out-log truncated, old GTFS zips and stale `dist/` folder removed from home directory.
- **Postgres down on OCI**: Was unable to start due to disk full; resolved by above cleanup.

### Security
- **Dependency patches**: 
  - **Root**: Bumped `vite` to 8.0.12, `postcss` to 8.5.14, `firebase` to 12.13.0, and `react-dom` to 19.2.6.
  - **V0 Backend**: Bumped `firebase-admin` to 13.9.0; fixed `protobufjs-cli` OS command injection vulnerability.
  - **Overrides**: Maintained overrides for `protobufjs` ≥7.5.5, `picomatch` ≥4.0.4, and `rollup` ≥4.59.0.
- **Rate Limiting**: Implemented `express-rate-limit` across all API endpoints (root server and v0 backend) to resolve 29+ code scanning issues and prevent potential DoS.
- **Dependabot**: Added `.github/dependabot.yml` for weekly npm and GitHub Actions scanning.




## [0.21.0] - 2026-05-07

### Added
- **Mini-App Architecture (Reboot)**: Re-engineered the platform around a focused, modular "Workspace" model. Each core feature (Interval, Reliability, Live Map) is now its own isolated mini-app, preventing cross-module bloat.
- **Backend Service Layer**: Extracted 1,000+ lines of raw SQL and business logic from `routes.ts` into a dedicated service layer (`AgencyService`, `VehicleService`, `IntelligenceService`, `LiveService`, `CatalogService`, `AlertService`).
- **Map-First Foundation**: Rebuilt the frontend from scratch, centered around a high-performance Leaflet map designed to serve as the canvas for all mobility intelligence layers.
- **Visual Intelligence**: Introduced 24-hour reliability trend graphs and SVG-based sparklines to provide immediate visual context on network stability.
- **NextGen Roadmap**: Comprehensive platform trajectory documented in `ROADMAP.md` and `docs/ROADMAP_*`.
- **Prototype Archiving**: Moved the legacy prototype codebase (V0) to the `/v0` directory to preserve R&D history while clearing the path for production-grade development.

### Changed
- **Performance Optimization**: Drastically reduced latency for core analytical queries (Network Pulse, Health) by 99%, dropping response times from 45s+ to <0.1s.
- **UI Unification**: Standardized sub-navigation across all platform surfaces using a unified Navigator-style component with consistent Indigo/Glassmorphism aesthetics.
- **Navigation Model**: Replaced complex, heavy tabbed routing with a clean, map-overlay HUD for lower cognitive load.
- **Stability**: Aggressively pruned backend surface area and optimized memory management to eliminate OOM crashes and PM2 restarts.
