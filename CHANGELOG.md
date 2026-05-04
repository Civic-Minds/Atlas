# Changelog

All notable changes to this project will be documented in this file.

## [0.19.2] - 2026-05-04

### Fixed
- **OCI server weekly OOM crash / SSH unreachable**: Root cause was 1GB RAM being exhausted by Postgres (~300MB) + Redis loading 410MB RDB dump + Node.js heap. Fix: permanently disabled Redis (`systemctl disable redis`, deleted dump.rdb) and removed BullMQ entirely from the ingestion path. Poller now calls `matchPositions` + DB writes directly as fire-and-forget async ops. Redis freed ~300–500MB; server has been stable since.
- **PM2 wrong cwd → env vars undefined**: PM2 was started without `--cwd /home/ubuntu/atlas-server`, so `dotenv/config` loaded from the wrong directory and all API keys resolved as `undefined`. Fixed by restarting with explicit `--cwd` flag.
- **Matcher hang — static DB queries blocking indefinitely**: Two root causes: (1) initial LRU fill queries for large agencies (MBTA: 137 trips → 52–82s on cold Postgres) and (2) per-route fallback queries (~10s each for TTC with 100+ unmatched routes) were exhausting the static DB connection pool and holding match slots forever. Fixes: initial LRU fill wrapped in `Promise.race` with 20s timeout (returns 0 matches for the cycle; subsequent cycles progressively warm the Postgres buffer cache); per-route fallback query wrapped in `Promise.race` with 7s timeout; 25s total fallback budget per agency; static pool capped at `max: 3` with `connectionTimeoutMillis: 180000`; `MAX_CONCURRENT_MATCH` reduced from 4 → 2; `MAX_CACHE_SIZE` increased from 500 → 3000 so trip schedules aren't evicted across 18 agencies.
- **matcher.ts log noise**: Replaced hundreds of `console.log` debug lines in the matcher and fallback loop with structured `log.info/warn` calls. PM2 out.log is now a usable diagnostic surface instead of an unreadable wall of text.
- **`Promise.race` static pool connection leak — permanent backpressure**: `Promise.race` returned a timeout sentinel but the underlying DB query kept running and holding the pool connection for 82–131s. With `max: 3` and 18 agencies all cold-starting simultaneously, the pool was permanently exhausted. Fix: replaced `Promise.race` with dedicated `client.connect()` + `SET statement_timeout = N` so Postgres actually cancels the query and releases the connection after the deadline. Applied to both LRU fill (20s) and `getRouteScheduleAroundTime` (7s).
- **LRU cache cleared on every agency — 0% match rate**: `scheduleCache` was a single Map keyed by `tripId` with a module-level `lastFeedVersion`. Each of the 18 agencies has a different `versionId`, so every agency call set `lastFeedVersion` to its own value and cleared the entire shared cache. No agency could accumulate cached trips. Fix: re-keyed cache as `${versionId}:${tripId}` and removed the `lastFeedVersion` clear — version upgrades now age out naturally via LRU eviction.
- **Zombie DB queries accumulating across restarts**: Before `statement_timeout` was added, every `pm2 restart` left in-flight LRU fill queries running in Postgres indefinitely. After several restarts, 24+ zombie queries were holding all static pool slots, causing permanent `connectionTimeout` on new connections. Fix: killed all existing zombies with `pg_terminate_backend`; new `statement_timeout` prevents future accumulation.
- **Halifax delay values systematically wrong (−25 hours)**: GTFS extended-time convention: trips that run past midnight use arrival_times > 1440 minutes (e.g. 25:10 = 1510 min). `localSecondsFromMidnight` returns 0–86399 for the current calendar day, so for a 1:10 AM observation against a 25:10 scheduled stop, `delay = 4200 − 90600 = −86400s`. Fix: after computing the raw delay, if `rawDelay < −43200`, add 86400 to observedSeconds to align with the schedule's service day.
- **Halifax missing timezone — delays off by 1 hour**: Halifax fell back to `America/Toronto` (UTC−4) instead of `America/Halifax` (UTC−3). Added explicit `timezone: 'America/Halifax'` to the Halifax agency config.
- **Benchmark query timing out every 15 min (>300s on full 24h window)**: `vehicle_positions` had no index on `(agency_id, observed_at)` — every benchmark run was a full sequential scan of a multi-million-row table. Fix: added `vehicle_positions_agency_time_idx` (CONCURRENTLY); reduced benchmark window from 24h → 6h; refresh interval 15 min → 30 min.
- **`stop-adherence` endpoint including stale trip data**: Added `ABS(delay_seconds) < 3600` filter to the stop-adherence query so readings from vehicles stuck reporting a finished trip's ID (e.g. STA showing +3h delays) are excluded.
- **Server build not compiled on deploy**: Root `npm run build` only builds the Vite frontend (`noEmit: true` in root tsconfig). Server changes to `server/src/` require `cd server && npm run build` before rsyncing `server/dist/`. Updated `CLAUDE.md` with explicit two-step build instructions.
- **Frontend unreachable in production**: End users were previously unable to access the dashboard because the UI wasn't deployed anywhere (it required running `npm run dev` locally with an SSH tunnel). Fix: Made the OCI Express server a full-stack host. It now statically serves the compiled Vite `dist/` folder and handles React Router SPA fallbacks via `app.get('/{*splat}')` (updated for Express 5 routing). Opened port 3001 in iptables so the app is now publicly accessible.

### Added
- **Single-command deployment**: Created `scripts/deploy.sh` (mapped to `npm run deploy`) which builds both the Vite frontend and Node server, rsyncs them to OCI, ensures firewall port 3001 is open, and restarts PM2 automatically.
- **`GET /api/intelligence/stop-adherence`**: Per-stop schedule adherence endpoint. Params: `agency`, `route`, `hours` (1–72, default 24). Aggregates `vehicle_positions.delay_seconds` (match_confidence ≥ 0.7) grouped by `(stop_id, stop_sequence)`, returning `avgDelaySeconds`, `medianDelaySeconds`, `onTimePct`, `earlyCount`, `lateCount`, `sampleCount` per stop. Secondary lookup against static DB for `stop_name`, `stop_lat`, `stop_lon`. No new schema — uses existing `vehicle_positions` data.

### Changed
- **Ingestion pipeline — Redis/BullMQ removed**: `poller.ts` no longer enqueues jobs to Redis. `startPositionWorker` removed from `server.ts`. `position-queue.ts` and `position-worker.ts` remain as dead code (unused, harmless). The queue layer was the single point of failure during Redis LOADING state hangs and is now completely absent from the data path.

### Fixed
- **Halifax matching (0% match rate)**: Root cause was missing stop_times — Halifax was imported in March before stop_times streaming was added to the importer. Re-imported 2026-04-20 via `https://gtfs.halifax.ca/Static/google_transit.zip` to populate stop_times. RT trip IDs (4306xxx) don't match static (4301xxx) but route IDs do — time-based spatial fallback handles matching.
- **Importer silent stop_times failure**: Added post-write verification that `COUNT(*) > 0` in `stop_times` for the new feed version. Import now throws explicitly if stop_times produced 0 rows instead of silently creating a broken feed version.
- **AGENCIES.md tiering**: Restructured to reflect the actual beta state — Tier 1 (full-network + static: Halifax, STA), Tier 2 (partial + static: TTC), Tier 3 (partial, data collection only: all others). Previously listed all agencies as equivalent.

### Added
- **`tsconfig.scripts.json`**: Separate TypeScript config for compiling `server/scripts/` with `rootDir: "."` and `outDir: "./dist-scripts"`. Lets import scripts be compiled and deployed to OCI independently of the main server build.

### Fixed
- **PerformanceView `Cannot read properties of undefined`**: Added extensive defensive handling (`?? []`) to all `PerformanceView` tabs to ensure `.map()` and `.length` calls are safe if API responses are empty or missing expected arrays.
- **PerformanceView `as any` casts**: Replaced four unsafe casts in `OverviewTab`'s `Promise.all` catch fallbacks with properly typed `BottleneckResponse`, `NetworkPulseResponse`, `GhostResponse`, and `MatchingStatsResponse` returns.
- **PerformanceView duplicate loading/error JSX**: Extracted shared `TabLoading` and `TabError` components and replaced 7 identical inline spinner/error blocks across all tab components.
- **SimulatorView JSX and structure**: Resolved critical structural errors in `src/modules/simulator/SimulatorView.tsx` where extra closing div tags and syntax discrepancies were breaking the Vite/Babel build process.
- **PerformanceView type safety**: Fixed a TypeScript assignment error in `src/modules/performance/PerformanceView.tsx` by correctly typing the navigation `TABS` constant with `LucideIcon` and resolving `ComponentType` incompatibilities.
- **Stale local/cloud runtime ambiguity**: Removed the leftover local Discovery Lab poller entrypoints (`server/scripts/discovery-lab.ts`, `server/scripts/setup-lab.ts`) that were causing agents and docs to conflate old local experiments with the live OCI runtime.
- **Spokane polling docs drift**: Updated `docs/AGENCIES.md` to match the actual config — STA is now documented as full-system polling (`ROUTE_FILTER.sta = null`), not a partial route subset.
- **Agency switcher dropdown persistence**: The TopNav agency menu now closes on route change and on outside click instead of staying open across pages.
- **Broken import/runtime errors**: Fixed stale relative imports in `StrategicAudit.tsx`, added the missing `useViewAs` import in `ScreenerView.tsx`, and repaired `SimulatorView.tsx` JSX syntax errors that were breaking Vite parsing.
- **Performance KPI mislabeling**: Reworked the misleading Performance overview cards so feed-quality scoring is no longer presented as generic "health", live reporting is counted as vehicles instead of a confusing route fraction, and the duplicate route-gap table was removed from Performance instead of shadowing Pulse.
- **Performance overview signal**: Added a plain-English "What Matters Now" summary band at the top of Performance so the page now leads with an operational readout instead of forcing users to infer the situation from abstract KPI cards.

### Changed
- **Production runtime documentation**: Added an explicit OCI runtime statement to `README.md`, `CLAUDE.md`, `GEMINI.md`, `docs/NOTION_REGISTRY.md`, `gtfs-test-log.md`, and `server/src/intelligence/notion-sync.ts` so the repo now clearly states that live vehicle data is cloud-backed and not dependent on a local machine.
- **TopNav simplification**: Removed the theme toggle and promoted Map to a first-class top-level nav item.
- **Map UI redesign**: Reworked `MapView.tsx` around stronger operational context with a live summary panel, route activity list, vehicle inspector, lighter basemap styling, and clearer failure diagnostics instead of low-signal status chrome.
- **Analyze page density**: Removed redundant Analyze page heading chrome, compressed the tab rail, renamed tabs to task-oriented labels (Routes, Corridors, Audit, Operations), and pulled the first real content much higher above the fold.
- **Performance / Pulse / Alerts density**: Replaced oversized section headers with compact inline headers, tightened the tab rails, simplified tab labels, and moved the first meaningful content much higher on the page.
- **Performance page purpose**: Tightened the Performance intro copy so it now frames the module around feed quality, delay build-up, ghost trips, dwell friction, and corridor reliability rather than repeating Pulse-style route gap monitoring.
- **Performance navigation model**: Flattened Performance into one continuous page with anchored sections for overview, reliability, delay, ghosts, dwells, corridors, and service audit instead of forcing users through seven content-switching tabs.
- **Performance section flow**: Reordered the module into a single scrollable operational narrative with compact jump links and explicit section intros, so the page reads as one monitoring surface instead of seven separate micro-pages.
- **Shared module header language**: Added a reusable compact `ModuleIntro` pattern and applied it across Analyze, Performance, Pulse, and Alerts so the modules now open with the same visual hierarchy.
- **Simulate header alignment**: Brought Simulate onto the same compact intro + tightened tab pattern as the rest of the core modules, with shorter tab labels and much less dead space before the main canvas.
- **Admin header alignment**: Switched Admin to the shared `ModuleIntro` pattern and tightened the top spacing so it no longer feels visually separate from the other modules.
- **Shared module rhythm**: Tightened `.module-container` vertical padding and moved the intro typography into shared CSS utilities (`.module-kicker`, `.module-subtitle`) so page openings stay more consistent across the app.
- **Module intro scale**: Reduced the shared module title treatment from oversized display text back to a compact header so pages feel closer to the original product rhythm and stop competing with the content.
- **Module title placement**: Removed the duplicated in-page module names from the shared intro blocks and restored the active module label beside `Atlas` in the top bar to reclaim vertical space without losing context.
- **Core 5 Navigation**: Streamlined the global navigation to a 5-verb "Core Process" (Analyze, Performance, Pulse, Alerts, Simulate). The Map module has been moved to a globally accessible utility icon in the TopNav to reduce clutter and distinguish spatial tracking from categorical analysis steps.
- **UI Architecture Unification**: Consolidated all 5 core modules under a standardized layout pattern using `ModuleHeader`, `ModuleSubNav`, and `.module-container`.
- **Module Consolidation**: Merged the "Strategic Audit" / "Intelligence" module directly into **Analyze**, deprecating the standalone Monitor route. Consolidated legacy "Intelligence Hub" tools into a single diagnostic workspace.
- **Simulate Module Modernization**: Integrated the Simulator into the standard UI architecture, adding a `ModuleHeader` and unified tab navigation while maintaining the full-screen map experience.
- **Alerts Module Modernization**: Refactored the Alerts view to support the new navigation standards and added professional incident logging stubs.
- **Professional Terminology Standardization**: Replaced colloquial developer shorthand and vague metrics with industry-standard transit terminology across the platform.
    - `Freq. Promise` $\rightarrow$ **Reliability Audit** (Performance Tab)
    - `Health Score` $\rightarrow$ **System Health** (MRI Card)
    - `Match Rate` $\rightarrow$ **Data Integrity** (MRI Card)
    - `Routes Active` $\rightarrow$ **In-Service Routes** (MRI Card)
    - `Alerts` $\rightarrow$ **Network Friction** (MRI Card)
    - `Intelligence / Monitor` $\rightarrow$ **Strategic Audit** (Analyze Tab)


## [0.20.0] - 2026-04-19

### Fixed
- **CI failures (ScreenerView)**: Pre-existing TypeScript errors at lines 291/383/406 (invalid `modeToggle` prop, `"catalog"` not in `"map" | "data"` union) were blocking CI since v0.19.1. Fixed by replacing the dead local-mode branch with the simplified server-only version already in use.

### Changed
- **Spatial match buffer 300m → 500m**: Vehicles mid-segment between stops were being rejected by the 300m threshold, causing the 0% match rate observed in live testing. Raised to 500m; confidence formula updated to use the new ceiling. Fallback score normalisation comment updated to match.

### Added
- **Per-agency match diagnostics**: `matcher.ts` now tracks `noTripId`, `tripIdInStaticGtfs`, `fallbackResolved`, `tripIdMismatch`, `spatialRejected`, `fullyMatched`, and up to 5 sample unmatched RT trip IDs per agency per poll cycle. Latest diagnostics are stored in a module-level Map.
- **`GET /api/intelligence/match-diagnostics`**: New endpoint exposes the in-memory diagnostics as JSON for one or all agencies. No DB query — returns the most recent matcher run result immediately.
- **Diagnostics panel in CommandCenter**: Each row in the RT Matching panel now has a "diagnose" toggle. Expanding it shows the full failure breakdown (vehicles polled, trip ID resolution path, spatial rejections, fully matched count) and sample unmatched RT trip IDs — making 0% match rate debuggable without reading server logs.

## [0.19.1] - 2026-04-19

### Fixed
- **CI build errors**: Resolved 7 TypeScript errors that were failing the Pages deploy — duplicate `useViewAs` import in `AlertsView`, `CatalogRoute` imported from wrong module in `population.ts` and `usePopulationStore`, missing `routeLongName` on `AnalysisResult`, missing scoring fields on `CatalogRoute`, and missing `Bus`, `Database`, `Zap` lucide imports in `RouteDetailModal` and `SystemReportView`.

## [0.19.0] - 2026-04-19

### Changed
- **Simulate module wired to cloud GTFS**: Simulator no longer requires local GTFS file uploads. `SimulatorContext` now fetches routes and stop sequences from the static DB via two new server endpoints (`GET /simulate/routes`, `GET /simulate/route/:routeId`). Representative trip is the longest stop-sequence trip for direction_id=0; shape is pulled from `route_shapes` and coordinate order flipped from GeoJSON `[lon,lat]` to Leaflet `[lat,lon]`. Admin empty state prompts to select an agency via the nav switcher.

## [0.18.0] - 2026-04-19

### Fixed
- **Systemic blank pages (DEV auth race)**: All modules were mounting before Firebase resolved, causing `fetchWithAuth` to send no token and receive 401s everywhere. Fixed by keeping DEV mode bypass (`isAuthenticated: true, isLoading: false`) but starting `role: null` so `isAdmin` is false until Firebase confirms the role — admin UI only appears after auth resolves, and API calls gate on `user` being set.
- **Agency switcher appearing then vanishing**: `useAuthStore` catch block was setting `role: 'viewer'` on any `/api/me` network failure, stripping admin status. Changed fallback to `role: 'admin'` to match server default for unregistered users.
- **CommandCenter infinite "Loading" state**: `loading` was initialized to `true` but the effect returned early when `user` was null, never setting it to `false`. Changed initial state to `false`; loading only activates when the fetch actually starts.
- **Alerts page redirect**: `/alerts` was silently redirecting to `/` when no agency was selected. Now shows an inline empty state with instructions instead.
- **NetworkScreener not reacting to nav agency switcher**: Screener now reads `viewAsAgency` from `useViewAs` and auto-runs `screenRoutes` when it changes. For admins with no agency selected, shows a clear prompt instead of a blank filter panel.
- **NetworkScreener defaulting to STA for admins**: Admin default is now blank — agency comes from the nav switcher, not a hardcoded slug preference.
- **NetworkScreener `isAdmin` missing researcher role**: `role === 'admin'` check updated to include `'researcher'`.
- **Debug artifacts removed**: `/api/whoami` endpoint and `console.log('[ME]')` line removed from server.

### Added
- **Tab descriptions in Analyze**: Each tab (Routes, Corridors, Monitoring) now shows a one-line description of what it does below the tab bar.
- **Empty states in Analyze**: Routes and Corridors tabs show instructional empty states before Screen/Find Corridors is clicked, replacing a blank void.
- **`npm run tunnel` script**: `package.json` now includes a `tunnel` script that opens the SSH tunnel to OCI for local dev (`ssh -L 3001:localhost:3001`).

### Changed
- **Matcher vehicle cache**: `MAX_VEHICLE_CACHE` increased from 2,000 to 10,000 to prevent constant eviction for large agencies (MTA etc.).

### Added
- **Command Center Homepage** (`CommandCenter.tsx`): Replaced the marketing hero splash page with an operational admin dashboard. Shows system KPI strip (Agencies, Total Routes, RT Observations, Avg Health, Match Rate), scrollable Agency Registry with health scores and click-to-"View As", RT Matching panel with per-agency match rates, and a 6-module quick access grid. Authenticated users without a tenant agency now land on actionable data instead of a pitch deck.
- **Backend Stability**: Restored real-time data ingestion and API availability by re-starting the backend server and verifying local database connectivity.
- **Theme Support**: Implemented a responsive Light/Dark mode system with a manual toggle in the TopNav, utilizing a technical HSL-based palette for clinical clarity.
- **Route click-to-details in Analyze**: Clicking any row in the Route Screener table now opens the `RouteDetailModal` with full frequency and reliability breakdown for that route.

### Fixed
- **Monitor — Before/After Audit button silent failure**: `handleAudit` was catching errors and setting component state that was never rendered, making the button appear broken. Now surfaces a toast: "requires at least 2 imported feed versions" when the agency doesn't have enough history, or a generic error toast otherwise.
- **Command Center KPI strip**: Fixed misleading/unclear cards — "2 with GTFS data" sub was redundant when value was already 2 (now shows "X with live RT"); Observations sub now says "last 5 min" (actual query window); Avg Health no longer shows "0 / Degraded" when there's no RT data (now shows "— / No RT data"); Match Rate sub clarified to "trip matching · 5 min"; Last Refresh card (just showed page-load time) replaced with "RT Agencies" — count of registered agencies actively reporting right now.
- **TopNav breadcrumb slash**: Removed the `/ ` separator between "Atlas" and the module name — "Atlas" now dims when on a module page, "Analyze" etc. renders at full weight beside it.
- **RouteDetailModal — "Commit this feed" message**: Removed dead local-pipeline message ("Commit this feed to the catalog to enable route verification") from the verification panel. It returned `null` now when no catalog route is found.
- **Agency switcher moved to nav bar**: Inline agency pickers removed from Performance, Pulse, Map, and NetworkScreener filter panel. Admins switch agency via the nav bar dropdown (already had `useViewAs` wired). Tenant users see no picker — they're always scoped to their agency. Admin default changed from hardcoded 'ttc'/'sta' to blank — shows "Select an agency" prompt until one is chosen.
- **Tenant scoping — Performance, Pulse, Map**: All three modules now read `agencyId` from the auth store at mount. Tenant users (STA planners) see their agency's data immediately — no picker visible. Admin users see a picker, which defaults to whatever agency was selected in CommandCenter via `useViewAs`.
- **AtlasView syntax error**: Fixed two syntax issues in `AtlasView.tsx` — the `FitBounds` component was missing its closing `};`, and the `timelineDates` `useMemo` had its declaration removed leaving an orphaned loop body. Both caused Vite to refuse compilation.
- **Duplicate "Analyze" heading**: Removed redundant `ModuleHeader` from ScreenerView network mode — it duplicated the module name already shown in the TopNav breadcrumb and displayed a "NETWORK" badge already conveyed by the mode toggle below it.
- **Screener Navigation Bar**: Consolidated the Network/Local mode toggle and the Route/Corridors/Monitoring tabs into a single unified navigation bar to save vertical space and reduce visual clutter.
- **RT Matching panel scope**: Was showing all 19 polled agencies; now filtered to only registered agencies (those with static GTFS in the catalog). Observations KPI rounded to integer.
- **Agency Registry click**: Clicking an agency now navigates to `/performance` instead of reloading the home page. RT Matching panel uses display names with consistent font instead of raw slugs in monospace.
- **Tenant scoping — `/api/import/agencies`**: Endpoint was unauthenticated and returned all agencies to anyone. Now requires auth + tenant middleware; non-admin users only receive their own agency. Client `fetchAgencies()` updated to send the auth token.
- **Analyze page defaults**: Now defaults to STA (over Halifax alphabetically) and auto-runs the screen on load so results appear immediately without clicking Screen.
- **Map page blank**: Fixed blank map caused by Leaflet not resolving `h-full` in flex layout. Added `min-h-0` to flex parent and explicit `style={{ height: '100%' }}` on MapContainer.
- **Monitor — "Action Required" badge**: No longer shows on Geometric Optimization Proposals when the list is empty.
- **Home page — duplicate nav links**: Removed redundant "Live Map / Alerts / Monitor" pill buttons at the bottom of the Command Center (already present in the top nav).
- **Predict page dead state**: Replaced "Upload a GTFS feed in the Admin panel" empty state (pointing at a removed admin flow) with an honest "migrating to cloud backend" message.

### Changed
- **STA full system polling**: Removed route filter for Spokane Transit Authority — now polling all routes (previously limited to routes 90, 25, 9, 6, 66). 100% of STA positions include `stop_id`.
- **Nomenclature Consolidation**: Standardized module titling to match the TopNav navigation labels. Removed meaningless "Intelligence Hub" and "Route Health" jargon in favor of the single source of truth in the sticky breadcrumb. 
- **UI Redundancy Elimination**: Stripped redundant page titles from `ModuleHeader` across `Performance`, `Pulse`, and `Monitor` views. This eliminates the "double titling" issue and reclaims vertical screen real estate for data visualization.

## [0.17.0] - 2026-04-15

### Added
- **Configurable Analysis Criteria**: Added a UI panel (`CriteriaPanel.tsx`) in the Screener module allowing users to adjust the time window (e.g., 7am-7pm) and strictness (grace minutes, max violations) for local GTFS analysis without modifying source code.
- **Batch GTFS Ingestion**: Upgraded the `AdminView` upload flow to accept multiple `.zip` files simultaneously. Includes a batch progress indicator and automatically commits each processed feed directly to the regional catalog.
- **Network Timeline Slider**: Added a date-based slider to the Atlas Map View sidebar. Allows users to scrub through historical catalog snapshots (e.g., comparing the network now vs. 2 years ago) by filtering `currentRoutes` based on their `committedAt` timestamp.
- **Catalog Explorer**: Introduced a dedicated "Catalog" tab within the Screener module (`CatalogExplorer.tsx`), providing a master table view of all committed routes across all agencies in the region, complete with search and CSV export.
- **Regional System Report**: Updated the System Report (`SystemReportView.tsx`) to support a "Regional" mode. It now aggregates 15-minute coverage and reliability metrics across all agencies present in the persistent catalog, rather than just the latest analyzed feed.
- **Persona Switching Core**: Implemented a multi-tier identity model (Admin, Researcher, Planner) with a Global/Tenant toggle in the UI. Automatically scopes data visibility to the user's agency while allowing researchers to view the unified regional network.
- **Static Population Coverage (Equity-Lite)**: Added the capability to ingest Census population CSVs and overlay them on the transit map. Dynamically calculates the percentage of the population served by the active frequent network filter.

### Changed
- **Technical Roadmap**: Added "Snap-to-Road Geometry Interpolation" to `ROADMAP_TECHNICAL.md` to track future integration of RDP/Mapbox/OSRM for smoothing routes from agencies missing `shapes.txt`.

## [0.16.0] - 2026-04-15

### Added
- **Performance Module** (`/performance`): New agency-facing operational dashboard with 7 tabs — **Overview**, **Frequency Promise**, **Bottlenecks**, **Ghost Buses**, **Dwell Analysis**, **Live Corridors**, and **Service Audit**.
- **Agency Dashboard** (Home): When a user has a tenant agency (from auth) or an admin selects "View as agency", the homepage now shows a live KPI dashboard instead of the marketing splash. 6-metric KPI strip (Health Score, Vehicles Now, Routes Active, Frequent, Wide Gaps, Ghost Trips), top 3 bottlenecks, worst 5 routes by gap.
- **Alerting UI** (`/alerts`): Built a brand-new frontend configuration panel to manage automated threshold alerts for bunching, delay, match rate, and ghost percentage.
- **Board Report Export**: Added native PDF export capabilities to the Performance Module via the 'Export Board Report' button.
- **Gap Distribution panel in Pulse Route Detail**: Shows inter-arrival gap histogram across all stops on a route over 7 days.
- **Network Overview tab in Pulse**: Ranks all active routes for an agency by worst observed headway in a single table. Sortable by worst gap, avg gap, or vehicles.
- **Route Health Heatmap**: New `/pulse` module showing a 7-day hours × days heatmap of observed service frequency per route.
- **`/api/benchmark` endpoint**: Cross-agency reliability benchmark using real inter-arrival gaps at AT_STOP positions.
- **Live Stop Performance**: New panel in the Monitor module showing actual arrival times at any stop over the last 60 minutes.
- **Live API endpoints**: foundation for agency ops layer: `/api/live/routes`, `/api/live/stops`, `/api/live/arrivals`, `/api/live/route-health`.
- **`scripts/import-gtfs.js`**: Admin script to import any GTFS feed directly into the static DB without HTTP/auth.
- **New agencies activated**: King County Metro (kcm), Sound Transit, San Diego MTS. 21 agencies total.

### Changed
- **Silent Routes tab in Pulse**: surfaces routes that have gone dark for 15+ minutes.
- **`route_last_seen` summary table**: New realtime DB table maintained by the position-worker to accelerate silent-route queries.
- **TTC GTFS import completed**: 4.3M stop_times written for Spring 2025 feed.
- **Time-based fallback matcher**: Improved GTFS-RT trip resolution when trip_id doesn't match static schedule (crucial for TTC/Clever Devices).
- **Frequency Tiering Refinement**: Upgraded audit engine to use p90 gap threshold to ignore minor schedule anomalies.
- **Dynamic Service Period Selector**: Interactive time-of-day selector (AM/PM Peak, etc) in Intelligence Hub.
- **Terminology Refinement**: Replaced product jargon with industry terms like "Frequent Service Density" and "Geometric Circuity".

### Fixed
- **GTFS import performance**: Optimized batch inserts using `unnest` array bindings (5–10× speedup).
- **Timezone bug in Pulse endpoints**: Added agency-specific timezone handling for hourly bucketing.
- **Live Map auth**: Added Firebase Bearer tokens to vehicle position requests.
- **MapView unclosed div**: Fixed structural JSX error in map controls.
- **Shape column error in detour matcher**: Fixed join condition between `route_shapes` and trips.
- **Server recovery**: Resolved prepared statement mismatch after April 1 crash.

## [0.15.0] - 2026-04-02

### Added
- **View as Agency**: Admins can now select any agency from the static database via a nav dropdown. Loads full route catalog without re-upload.
- **Homepage Restoration**: Restored original design with city hero and 400px feature cards.

### Changed
- **Module Renames**: Strategy → Analyze, Intelligence → Monitor. Standalone Optimize module merged into Analyze as a Map tab.
- **Navigation Cleanup**: Nav items right-justified; avatar replaced with display name + Logout.

## [0.14.0] - 2026-04-01

### Added
- **Service Change Auditor**: Automated benchmarking suite comparing 30-day reliability windows around schedule pivot points.
- **Detour Awareness Engine**: PostGIS-powered shape-deviation detection (ST_Distance).
- **Advanced Spatial Matching**: Matches vehicles to nearest stop within 300m when stop_id is missing.
- **Segment-Level Breakdown (MRI)**: Transition detection and real-time delay delta calculation per segment.
- **Dwell Time Analysis**: Backend engine tracking bus time-at-curb (AT_STOP).

### Changed
- **Enterprise Multi-Tenancy**: Implemented `requireTenant` middleware and database partitioning for strict agency scoping.
- **Notion Intelligence Sync**: Background synchronization of health and reliability scores to Notion.
- **Matcher Engine v1.1**: Stateful LRU-based tracking system for transition analytics.

## [0.13.0] - 2026-03-30

### Added
- **Corridor Analysis**: Identifies shared transit corridors and computes combined headways.
- **Network Screener (Cloud)**: Screening mode backed by OCI static database instead of local ZIP.
- **Live Map full-network view**: Renders all active vehicles for an agency with optional route highlighting.
- **Streaming GTFS Parser**: Reduces peak heap from 1.5GB to <200MB, allowing massive feeds on 1GB OCI server.

### Changed
- **Infrastructure**: Retired local Postgres requirement; transitioned entirely to OCI-hosted `static` and `realtime` databases.
- **Module Nomenclature**: RenamedStrategy → Analyze, Intelligence → Monitor. Standalone Optimize module merged into Analyze as a Map tab. (Corrected in 0.15.0)

