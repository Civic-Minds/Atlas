# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

### Added
- **Command Center Homepage** (`CommandCenter.tsx`): Replaced the marketing hero splash page with an operational admin dashboard. Shows system KPI strip (Agencies, Total Routes, RT Observations, Avg Health, Match Rate), scrollable Agency Registry with health scores and click-to-"View As", RT Matching panel with per-agency match rates, and a 6-module quick access grid. Authenticated users without a tenant agency now land on actionable data instead of a pitch deck.
- **Theme Support**: Implemented a responsive Light/Dark mode system with a manual toggle in the TopNav, utilizing a technical HSL-based palette for clinical clarity.

### Fixed
- **AtlasView syntax error**: Fixed two syntax issues in `AtlasView.tsx` — the `FitBounds` component was missing its closing `};`, and the `timelineDates` `useMemo` had its declaration removed leaving an orphaned loop body. Both caused Vite to refuse compilation.
- **Duplicate "Analyze" heading**: Removed redundant `ModuleHeader` from ScreenerView network mode — it duplicated the module name already shown in the TopNav breadcrumb and displayed a "NETWORK" badge already conveyed by the mode toggle below it.
- **Screener Navigation Bar**: Consolidated the Network/Local mode toggle and the Route/Corridors/Monitoring tabs into a single unified navigation bar to save vertical space and reduce visual clutter.

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

## [0.10.0] - 2026-03-09

### Added
- **View as Agency**: Admins can now select any agency from the OCI static database via a nav dropdown. Selecting an agency loads their full route catalog (Weekday/Saturday/Sunday) from the `/api/screen` endpoint and populates all modules — no GTFS re-upload needed. A pill indicator shows the active agency with a one-click exit.

### Changed
- **Module renames**: Strategy → Analyze, Intelligence → Monitor. Routes updated accordingly (`/analyze`, `/monitor`).
- **Optimize removed**: The frequency network map is now a Map tab inside Analyze, eliminating a redundant standalone module.
- **Nav cleanup**: Removed circle avatar; replaced with display name + Log out. Nav items moved back to right-justified position.
- **Homepage**: Restored original design (city hero, animated heading, 400px feature cards). Module cards updated to reflect new names and 5-module structure.
- **Map error handling**: Real-time feed errors now stop the retry loop and show a quiet inline banner with a manual Retry button instead of a pulsing red alert.

## [0.14.0] - 2026-04-01

### Added
- **Mobile Navigation**: Implemented a responsive slide-down hamburger menu for the global top navigation, ensuring accessibility on viewports smaller than 768px.
- **Live Map Legend**: Extracted the generic status color text labels into a prominent, floating opaque legend overlaid directly on the Live Map.
- **Dynamic Data Onboarding**: The `useAutoLoadGtfs` hook now seamlessly pulls sample GTFS datasets depending on the authenticated tenant's `agencyId`, falling back to Portland data defaults, to eliminate blank-state friction for first-time signups.
- **Service Change Auditor**: Automated benchmarking suite that identifies GTFS schedule pivot points and compares 30-day reliability windows.
- **Service Change Scorecard**: High-fidelity UI panel in the Intelligence Hub providing side-by-side "Before vs. After" reliability benchmarks.
- **Historical Headway Engine**: Refactored the core performance engine to support arbitrary time-windowed audits and explicit GTFS version overrides.
- **Detour Awareness Engine**: Implemented PostGIS-powered shape-deviation detection (`ST_Distance` via `geography` cast).
...
### Changed
- **Intelligence UX Polish**: Refined the loading state in the Intelligence Hub to overlay the spinner seamlessly beneath the header controls, maintaining visual context when switching agencies instead of unmounting the view.
- **Module Nomenclature Consistency**: Renamed the "Synthesis" module to "Optimize" on the landing page feature cards to align with the application's vocabulary, and included the missing "Intelligence Hub" entry point.
- **Internal UI Structure Standardization**: Corrected the core `.module-container` layout across all modules using standard CSS classes, enforcing flex bounds and eliminating inside scroll bar clipping issues without halting the Vite Tailwind v4 compiler.
- **Locked Default Tenant Dropdown (Strategy View)**: Applied strict RBAC (`isAdmin`) in `NetworkScreener.tsx`. Standard tenant operators are fundamentally locked to their mapped GTFS schema to enforce strict, single-tenant data segregation.
- **Unified Intelligence Types**: Standardized camelCase naming conventions across the API and frontend for robust, type-safe data flow.
- **Reroute Persistence**: Automated calculation and storage of `is_detour` and `dist_from_shape` for all real-time positions.
- **Visual Detour Alerts**: Added Phase 3 markers to Pulse Dashboard; off-route vehicles now trigger Magenta alerts with tooltip distance diagnostics.
- **Intelligence Hub & Freedom Auditor** (`/intelligence`): A strategic dashboard implementing the Jarrett Walker "Turn Up and Go" frequency standard (15-min threshold) to track network accessibility.
- **Geometric Audit Engine**: Backend circuity analysis that calculates a `circuity_index` for every route using Haversine-based geodesic vs. polyline length comparisons.
- **Optimization Proposals**: New UI interface to flag high-circuity "Zig-Zag" routes (>1.4x) as candidates for network straightening.
- **AHW Reliability Scoring**: Upgraded the headway engine with a Coefficient of Variation (CV) algorithm to provide 0-100 reliability scores for corridors.
- **Advanced Spatial Matching**: Haversine-based projection for vehicle positions; matches vehicles to the nearest scheduled stop within 300m when `stop_id` is missing.
- **Pulse Dashboard**: Multi-agency observability suite monitoring ingestion health, match confidence, and "Service Shock" events in real-time.
- **Notion Intelligence Sync**: Background synchronization service mapping local agency health and reliability scores to the global Agencies Database in Notion.
- **Enterprise Multi-Tenancy**: Implemented `requireTenant` middleware and database partitioning to ensure API requests are strictly scoped to the user's agency.
- **Live Map Vehicle Rendering**: Integrated `CircleMarker` rendering for real-time vehicle positions, colored by speed (stopped → moving).
- **Schedule Cache Bounds** (`matcher.ts`): Introduced a global concurrency-safe cache for static trip patterns with a 500-entry eviction guard to prevent unbounded memory growth during full-fleet (8,000+ vehicle) polling.
- **Segment-Level Breakdown (MRI)**: Full-stack implementation of Stop A-to-B travel time analysis. The `matcher.ts` engine now detects vehicle transitions, calculates real-time delay deltas per segment, and persists them to a new `segment_metrics` table.
- **Congestion & Bottleneck Analysis**: New UI panel in the Intelligence Hub that highlights the network's top 5 most delayed segments, providing planners with actionable "MRI" data for infrastructure interventions.
- **Dwell Time Analysis (Backend)**: Implemented a high-fidelity "Dwell State Engine" in the matcher that tracks exactly how long buses remain at the curb (`AT_STOP` status). Data is persisted to a new `stop_dwell_metrics` table to identify fare-payment and boarding bottlenecks.
- **Predictive Demand Hub**: Unified the "Predict" module branding (previously "Optimize") to "Predict: Strategic Growth" and implemented a functional gravity-based demand forecasting engine.
- **Headway N+1 Optimization**: Eliminated per-corridor database round-trips by batch-fetching all arrivals in a single `ANY($1::text[])` query.
- **CORS Whitelist**: Replaced open CORS with an environment-driven origin whitelist (`FRONTEND_URL`).
- **Auth Hardening**: Added `requireAuth` middleware to the GTFS import pipeline and enforced `Bearer` token validation on all protected API endpoints via Firebase ID tokens.
- **Infrastructure Privacy**: Transitioned Firebase project IDs, Notion database IDs, and Static DB credentials to environment variables to remove hardcoded fallback secrets.
- **Global UX Standard**: Applied `cursor: pointer !important` to all interactive elements to ensure consistent interactive feedback.
- **Matcher Engine v1.1**: Upgraded to a stateful LRU-based tracking system that persists "Last Seen" vehicle states across polling intervals—enabling transition-based analytics (Segments/Dwells) while maintaining memory safety for full-fleet polling.
- **Strategic Navigation Priority**: Promoted the Intelligence Hub as the primary strategic entry point in the global navigation, followed by Predict, to align with the Phase 2: Intelligence Layer roadmap.
- **Navigation Pillar**: Promoted "Intelligence" to the primary navigation bar as the strategic entry point for network audits.
- **Halifax Validation**: Verified the Intelligence Hub against the Halifax dataset, identifying 5+ high-priority optimization candidates based on geometric debt.
- **Version Clean-up**: Updated the stale `V0.1.4` branding in the Pulse Dashboard to the current `V0.13.0`.
- **Dynamic Schedule Windows**: Replaced hardcoded 'Weekday' logic with dynamic day-type detection (Weekday/Sat/Sun) for reliability calculations.

### Fixed
- **API URL Construction Reliability**: Fixed critical `Failed to construct 'URL'` exceptions across the platform by standardizing on `window.location.origin` as the fallback base inside `atlasApi.ts` when `ATLAS_BASE` is empty.
- **Live Map Gateway Visibility**: Enhanced the "Could not reach GTFS-RT Gateway" error in `MapView.tsx` to display as a distinct, pulsing red terminal banner instead of a silent text label.
- **Resolved Compilation mismatches for GTFS Analytics**: Standardized the `CorridorPerformance` interface mapping to `snake_case` in `src/services/atlasApi.ts` to seamlessly feed robust typing down to `CorridorMonitor.tsx`.
- **Global Loading State Conflicts**: Patched `VerifierView` checking constraint that was erroneously flashing empty datasets bypassing the `useGtfsWorker` parsing cycle.
- **Database Schema Sync**: Explicitly enforced `notion_sync_status` columns locally using Postgres to stabilize the realtime `ingestion_log`.
- **Precision OTP Matching**: Corrected `delay_seconds` drift by using the vehicle's `observedAt` timestamp instead of the server's wall clock.
- **Midnight Crossing Logic**: Ghost detection now correctly handles arrival windows that cross the midnight boundary using `OR` logic.
- **Postgres Batch Alignment**: Resolved a critical parameter mismatch in storage batch inserts that caused ingestion failure on 14-column records.
- **511.org Rate Mitigation**: Added 30s of random startup jitter and agency-specific polling intervals to prevent `HTTP 429` errors on shared API keys.
- **Memory Leak**: Fixed a Blob URL leak in the CSV export utility by properly revoking object URLs after download.

## [0.13.0] - 2026-03-30
### Added
- **Intelligence Layer (Phase 2)**: Added full schedule persistence with `stop_times` batch-streaming to the local Discovery Lab.
- **OTP Matching**: Fixed a critical units mismatch in `matcher.ts` where `arrivalTime` (minutes) was being subtracted from `currentSeconds` (seconds).
- **Discovery Lab Stress Test**: Successfully polled and ingested the full NYC MTA Bus fleet (~2,700 active vehicles) by overriding the `mtabus` route filter.
- **Matcher Service**: Correlating real-time GPS pings with static schedules to produce `delay_seconds`. Verified on Manhattan M15 corridor.
- **Corridor Analysis** (`Strategy` module, `server`): Identifies shared transit corridors — stop-pair links served by 2+ routes — and computes combined headways. Built as a second streaming pass over stop_times.txt so it works within the same memory-constrained import pipeline. Results stored in a new `corridor_results` table on OCI and exposed via `GET /api/corridors` (filters: agency, maxHeadway, minRoutes, windowStart/End, dayType). Frontend: new Corridors tab in the Network Screener showing segment (stop A → stop B), serving routes with badges, combined trip count, avg/peak headway, and reliability bar. Verified on Halifax (Spring Garden/Barrington corridor, 16 routes), NYC Subway (B/D/F/M trunk, 2/3/4/5 at Nevins/Atlantic), and TTC (Scarborough trunk 38/129/131/133, Eglinton West 27/32/35/71).
- **`corridor_results` table** (OCI `static` DB): Stores per-link corridor data with `analysis_run_id` FK, `route_ids[]` array, combined headways, reliability score. Keyed on `(analysis_run_id, link_id, day_type)`.
- **`parseStopTimesForCorridors()`** (`server/src/import/parse-gtfs.ts`): Second streaming pass over stop_times.txt that builds a `Map<linkId, CorridorLink>` — emits stop-pair departure times only for active trips (passed in as a `Set<string>`). Memory footprint scales with unique links, not raw stop_time rows.
- **`fetchCorridors()`** (`src/services/atlasApi.ts`): Typed API client for the corridors endpoint.
- **Network Screener** (`Strategy` module): New cloud-powered screening mode backed by the OCI static database. Agency picker loads all imported feeds from the server; filters include max headway, service window (start/end time), day type (Weekday/Saturday/Sunday), and directions (at least one / both). Results table shows route short name, long name, mode, tier, avg headway, worst headway, service span, and reliability score. Defaults to Network mode on load.
- **`GET /api/screen`** (`server`): New endpoint querying `route_frequency_results` with headway, service window, day type, and direction filters. `directions=both` requires both direction_id 0 and 1 to independently satisfy all criteria; `directions=one` returns the best-performing direction per route. Resolves agency slug to current feed version via `is_current = TRUE`.
- **`src/services/atlasApi.ts`**: Typed API client for all OCI server interactions — `fetchAgencies()`, `screenRoutes()`, `importFeed()`.
- **Local/Network mode toggle** (`Strategy` module): Mode switcher in the Screener header — Network (cloud) and Local (uploaded file). Switching to Local after uploading a file resumes the local analysis view. Defaults to Network.
- **Server-side GTFS upload** (`CommitModal`): When a file reference is available, committing a feed also POSTs to `/api/import` in addition to the local catalog. Server upload is best-effort and does not block local commit on failure.
- **Live Map full-network view**: Map now loads all active vehicles for the selected agency at once (no route required). Optional route field filters/highlights a single route on top of the full picture — other vehicles dim rather than disappear. Vehicle count in status bar shows filtered vs. total when a route is active.
- **`GET /api/vehicles`** (`server`): New endpoint returning the latest position per active vehicle for an agency (5-minute window, `DISTINCT ON vehicle_id`). Powers the full-network map view.
- **`idx_vp_agency_vehicle_time` index** (`server`): New Postgres index on `(agency_id, vehicle_id, observed_at DESC)` for the all-vehicles query pattern. Applied to `realtime` DB on OCI.
- **Live Map view** (`/map`): Real-time vehicle map powered by the Ouija backend. Shows all vehicles on any route across all 18 agencies, coloured by speed (stopped → crawling → slow → moving). Auto-refreshes every 30s. Agency selector + route input + manual reload button.
- **Tab favicon**: Replaced default Vite logo with 🚇 emoji favicon.
- **Static database** (`atlas_static` / OCI `static`): Postgres schema for persistent GTFS catalog with full feed versioning — every upload is an immutable snapshot, old versions never deleted. Tables: `agency_accounts`, `gtfs_agencies`, `feed_versions`, `routes`, `stops`, `trips`, `calendar_services`, `calendar_exceptions`, `route_shapes` (PostGIS LineString), `analysis_criteria`, `analysis_runs`, `route_frequency_results`, `feed_version_comparisons`, `audit_log`. Multi-tenant with `agency_account_id` on every row for future row-level security.
- **GTFS import pipeline** (`server/src/import/`): Server-side Node.js pipeline that parses a GTFS ZIP, runs phase1 + phase2 frequency analysis, and writes all results to the static database in a single transaction. Supports calendar.txt, calendar_dates.txt, frequencies.txt, and shapes.txt. Synthesises calendar from calendar_dates when calendar.txt is absent.
- **Import API** (`POST /api/import`): Multipart file upload endpoint — accepts a GTFS ZIP + agency metadata, runs the import pipeline, returns feed version ID and summary stats. Also exposes `GET /api/import/agencies`, `GET /api/import/agencies/:slug/versions`, and `GET /api/import/agencies/:slug/routes`.
- **Realtime/static DB separation**: Renamed OCI database `ouija` → `realtime` (vehicle positions). Created separate `static` database for GTFS catalog. Clean separation with no cross-database foreign keys.
- **Streaming stop_times parser**: stop_times.txt is now parsed as a Node.js stream directly from the ZIP (never decompressed to a string). Only the first departure time per trip is retained in memory. Reduces peak heap from ~1.5GB to under 200MB — makes large feeds (TTC 131k trips, NYC MTA) importable on the 1GB OCI server.

### Changed
- **Documentation**: Alphabetized all agency sections in `AGENCIES.md` to improve registry scannability.
- **Infrastructure**: Retired local Postgres requirements; transitioned entirely to OCI-hosted `static` and `realtime` databases. (Local `postgresql@16` service stopped).

### Fixed
- **Spokane Transit (STA)**: Removed stale portal access notes; feed is confirmed active and polling correctly in the live map view.
- **Edmonton (ETS)**: Added note regarding missing LRT data in the vehicle positions feed to prevent false "ghost train" detections.
- **ModuleHeader freezing the app**: `transition-all` combined with `backdrop-blur-xl` on a sticky header caused paint thrashing and multi-second freezes on scroll. Replaced with a slim `border-b` action bar using `transition-colors duration-150`. Title made optional since the nav already shows location.
- **Redundant titles on every page**: Module name appeared in the nav bar, the ModuleHeader hero, and often a third time as an inline heading. Removed duplicate titles — nav is the primary indicator.
- **Nav item URLs didn't match names**: Changed routes to match their nav labels (`/atlas` → `/optimize`, `/verifier` → `/audit`, `/simulator` → `/simulate`).
- **Predict page showing raw "Upload GTFS File" prompt**: End users should never see a file upload prompt. Replaced with an Admin panel redirect, matching the pattern used by other modules.
- **Verifier empty state showed file upload**: Same issue as Predict — replaced with Admin panel redirect.
- **Marketing-speak throughout the UI**: Removed "ADMINISTRATIVE CONSOLE", "Initialising Engine", "Public Transparency Layer", "Intelligence Hub", "NETWORK DIAGNOSTIC", "GEOMETRIC PROPOSALS", "Strategic Growth Engine v1.5", and similar jargon. All user-facing copy rewritten in plain language describing what each module actually does.
- **Oversized text across the app**: `text-7xl`/`text-9xl` hero titles, `text-6xl` empty state headings, `3rem`/`4rem` claim cards in Verifier — all reduced to proportionate sizes for an industry tool.
- **Homepage was a marketing landing page**: Replaced the full-screen hero with gradient animations, 400px decorative cards, and marketing footer with a simple app dashboard — heading + 3-column grid of module cards with plain descriptions.
- **Hardcoded dark-mode colors**: `bg-[#050505]`, `bg-[#111]`, `text-white/*` replaced with CSS variable equivalents (`var(--bg)`, `var(--fg)`, `var(--text-muted)`, etc.) in AuthSplash, App.tsx, and AtlasView.
- **Nav order didn't reflect workflow**: Reordered to Strategy → Optimize → Predict → Simulate → Audit, with Map separated into a secondary group behind a visual divider.
- **CommandPalette out of sync with nav**: Commands reordered and descriptions rewritten to match the updated nav structure and plain-language style.
- **Dead code cleanup**: Removed empty `Screener.css`, unused `CityHero.tsx`/`CityHero.css` (marketing homepage hero), and unreferenced `SimulatorTeaser.tsx`.

## [0.12.0] - 2026-03-27
### Added
- **SF Muni** (`muni`): Muni Metro light rail (J/K/L/M/N/T), Van Ness BRT (49), and Rapid routes (38R, 14R, 5R, 9R) via 511 SF Bay API.
- **AC Transit** (`actransit`): Tempo BRT (1T, Uptown Oakland–San Leandro BART), Route 51A (Broadway–Santa Clara), Route 72R (San Pablo Rapid) via 511 SF Bay API. Same key as Muni.
- **VTA** (`vta`): Rapid 522 (El Camino Real), Rapid 523 (De Anza), Rapid 500 (Diridon–Berryessa), Rapid 568 (Gilroy–Diridon) via 511 SF Bay API (agency code `SC`). Note: VTA route_ids include `"Rapid "` prefix with space.
- **Sound Transit** (`soundtransit`): Stubbed — ST Express 512 (Everett–Northgate) and 545 (Redmond–Seattle via SR 520). Pending OBA API key from oba_api_key@soundtransit.org (same key unlocks KCM).
- Updated KCM stub to drop `removeAgencyIds=true` and use prefixed route_ids (`1_` prefix) to match actual feed values.
- **ROADMAP.md**: Restructured to match Navigator/Transit Stats pattern — NextGen, Agencies, and Research each get their own sentence below the bullet list.
- **AGENCIES.md**: Added SF Muni, AC Transit, VTA to Active table; Sound Transit to Pending; noted SD MTS and LA Metro API keys requested 2026-03-27; added note that 511 key also covers BART, Caltrain, and SamTrans.

## [0.11.0] - 2026-03-27
### Fixed
- **`getActiveServiceIds` Short-Period Service Exclusion (MiWay Pattern)**: `MIN_OCCURRENCES = 4` excluded legitimate services that run for only 3–4 weeks (e.g. a schedule block covering 3 Mondays). MiWay's `26JA05` block had exactly 3 Monday calendar_dates entries, cutting weekday trip counts roughly in half vs. Tuesday–Friday. Added a secondary inclusion path: if count ≥ 3 and all consecutive date gaps are exactly 7 days (a regular weekly service), include it. Distinguishes a genuine 3-week schedule (gaps: 7, 7) from irregular holiday replacements like Spokane's Thanksgiving/Christmas/New Year's (gaps: 28, 7). MiWay Route 28 Monday: 53 → 100 trips.
- **`getActiveServiceIds` Single-Date Service Invisible (Pre-existing)**: Services appearing on exactly one calendar_dates entry (count = 1) were excluded by both `MIN_OCCURRENCES = 4` and the new weekly-spacing check, making one-off services invisible even when the pipeline was explicitly given a matching reference date. Added a third path: count = 1 → include unconditionally. Single-trip services have negligible impact on frequency analysis.
- **`parseCsv` UTF-8 BOM on First Column Header**: Some agencies (e.g. Kingston Transit) emit a UTF-8 BOM (`\uFEFF`) at the start of GTFS files. The BOM lands on the first column header name, causing all field lookups on that column to return `undefined`. Added `.replace(/^\uFEFF/, '')` to `transformHeader` so the BOM is stripped before the header key is stored. Affected `service_id` in `calendar_dates.txt` and `trip_id` in `stop_times.txt` — both made the service-ID and departure-time resolution fail silently.
- **`detectReferenceDate` Sanity Check Overrides Correct Reference (Kingston Pattern)**: The existing sanity check (`if calendarDates midpoint is >90 days from calendar-derived reference, use calendarDates midpoint`) was designed to fix phantom year-long `calendar.txt` entries. However, it broke for feeds that have a phantom all-year `calendar_dates` service (e.g. Kingston Transit service 1774: no trips, runs 365 days) alongside real short-window services (1775–1781: March–May only). The all-year service skewed `calendarDates` midpoint to September while the calendar-derived reference correctly anchored in April. The sanity check then overrode April → September, putting the real services outside the 90-day window. Fixed: the sanity check now only overrides when `datesMid < calendarRef` (the Foothill Transit pattern, where calendarDates is earlier than the placeholder-inflated calendar reference). When `datesMid > calendarRef`, the calendar-derived reference is already anchored in the correct early service window and is not replaced. Kingston Transit: 0 → 99+ weekday routes.
- **`test-gtfs-pipeline.ts` Bypasses `parseGtfsZip`**: The diagnostic script had its own `parseCsv` without BOM stripping or `transformHeader`, and did not call `synthesizeCalendarFromDates` for calendar-dates-only feeds. This meant Kingston Transit and similar BOM/synthesis-dependent feeds produced 0 departures in the script even after the core pipeline was fixed. Refactored the script to use `parseGtfsZip` for all parsing, keeping the per-file record-count output.
- **`detectReferenceDate` Multi-Period Feed Selection**: Previously selected the schedule block with the most `service_id` entries, which for feeds with two non-overlapping periods (e.g. Spokane Transit summer 661.* vs fall 660.*) picked the wrong block — the 7-week summer period (20 entries) over the 17-week fall period (18 entries). Changed to pick the **most recently started** period with multiple service entries, since agencies always publish the active schedule last. Singleton-only feeds (WSF-style, every group size 1) retain the existing median fallback.
- **`getActiveServiceIds` Holiday Service Bleed into Regular Counts**: Calendar_dates-only services (e.g. holiday replacement schedules — Thanksgiving, Christmas, New Year's) were included in regular day-of-week analysis if they fell on the right day-of-week within the 90-day window, regardless of how rarely they ran. Spokane's holiday replacement service (`660.0.4`, 3 Thursdays) merged with regular weekday service (`660.0.1`), inflating Thursday trip counts from 63 to 92. Added `MIN_OCCURRENCES = 4` — a calendar_dates-only service must appear on the target day-of-week **at least 4 times** within the window to be included.
- **`CommitModal` Side Effect in `useMemo`**: `setAgencyName` was called inside a `useMemo` callback, which is a React anti-pattern that can cause stale closures and unexpected re-renders. Moved the auto-detect logic to a `useEffect` so state is only set when `feedMetaPreview` changes.
- **`baseHeadway` Wrong Value in Weekday Rollup**: In `applyAnalysisCriteria`, the rolled-up `baseHeadway` field was set to `Math.round(stats.avg * 10) / 10` (the average headway) instead of `Math.round(stats.baseHeadway * 10) / 10` (the actual base/worst headway). Route Detail Modal was showing avg headway as base headway.
- **Simulator Empty State Shows Wrong Module Name**: The `EmptyStateHero` in `SimulatorView` displayed `title="Predict"` instead of `title="Simulate"`.
- **`VerifierView` Stats `unsure` Counter NaN**: The `stats` state was initialized as `{ correct: 0, wrong: 0, total: 0 }` without an `unsure` key. When a user clicked "Unsure", `prev.unsure + 1` evaluated to `NaN`. Added `unsure: 0` to the initial state.
- **`VerifierView` URL Memory Leak**: Both export handlers (`Export Verified Data` and the header `Export` button) called `URL.createObjectURL` without the corresponding `URL.revokeObjectURL` call, leaking blob URLs on every export. Added `revokeObjectURL` after each `a.click()`.
- **`AtlasView` Map Refits on Every Tier/Agency Toggle**: `FitBounds` received bounds derived from `filteredMapData`, so every tier or agency filter change refitted the map and overrode the user's pan/zoom. Bounds are now computed from all routes for the active day (independent of tier/agency filters), so the map only refits when the underlying data or day type changes.
- **`computeRawDepartures` Crash on Missing Required Files**: When a feed's zip contained no `routes.txt`, `trips.txt`, `stops.txt`, or `stop_times.txt` (e.g., Melbourne PTV's nested-zip format), the function crashed with `TypeError: Cannot read properties of undefined (reading 'map')`. Added an early return guard so feeds missing required files produce an empty result instead of a hard crash.
- **Noisy "Multiple service_ids" Warning Removed**: The warning fired whenever more than one `service_id` contributed trips to the same route on the same day — which is standard GTFS practice for peak supplements, school service, and Monday-only patterns. Affected nearly every real-world feed (378 warnings on TTC alone, also CTA and Valley Metro). Since `referenceDate` filtering already prevents cross-period merging, the warning provided no actionable signal and buried the legitimate `direction_id` missing warning. Removed.
- **`calculateCorridors` Reference Date Filtering**: Corridor analysis used raw `service.monday === '1'` checks with no date range filtering, meaning non-overlapping schedule periods (e.g., summer + winter service both marking `monday=1`) would be merged and corridors would appear twice as frequent. Refactored to use `getActiveServiceIds` with `detectReferenceDate`, consistent with how `computeRawDepartures` handles service resolution. Also accepts an optional `referenceDate` parameter to match the rest of the pipeline API.
- **`synthesizeCalendarFromDates` All-Zero Entries Block Calendar Dates Lookup**: When a service had too few dates to clear the synthesis threshold (e.g., a one-off special service with a single date), `synthesizeCalendarFromDates` created an all-zero calendar entry that incorrectly blocked `getActiveServiceIds` Step 2 from rescuing the service via direct `calendar_dates.txt` lookup. Services with fewer dates than threshold are now excluded from the synthesized calendar entirely, allowing Step 2 to resolve them correctly.
- **`detectReferenceDate` Cascade with Empty Synthesized Calendar**: When the synthesized calendar is empty (all services below threshold), `detectReferenceDate` fell back to today's date, placing all `calendar_dates` entries outside the 90-day window and making every service invisible. Now accepts an optional `calendarDates` argument and derives the reference from the midpoint of the calendar_dates date range when the synthesized calendar is empty.
- **Negative Departure Times Accepted Silently**: `t2m()` previously parsed `"-1:00:00"` as `-60` minutes, which was stored as a valid departure time and displayed as `span=-1:00`. Added `mins < 0` guard — negative times now return `null` and are excluded from analysis.
- **Frequency Expansion Float Accumulation**: The `expandFrequencies` loop used `t += headwayMins` floating-point addition over potentially hundreds of iterations, producing departure times like `22:59.999999999072315` instead of `23:00`. Refactored to use integer-second arithmetic (`s += headwaySecs`) and divide back to minutes at each step, eliminating the accumulation entirely.
- **Sub-Minute Headway Creates Explosion of Synthetic Trips**: `frequencies.txt` entries with `headway_secs < 60` (e.g., a 1-second headway) would generate tens of thousands of synthetic trips per template trip with no warning. Tightened the guard from `headwaySecs <= 0` to `headwaySecs < 60` — sub-minute headways are invalid for scheduled transit analysis and are now rejected.
- **Duplicate `trip_id` Not Caught by Validator**: `validateGtfs` checked for duplicate `route_id` and `stop_id` values but not `trip_id`. Feeds with duplicate trip IDs silently dropped all but one copy in `buildTripDepartures`. Added E032 check for duplicate `trip_id` values in `trips.txt`.
- **Hardcoded `E00F` Validation Error Code**: `validateRequiredFields` used the same error code `E00F` for every missing-field issue, making it impossible to distinguish which field caused the error programmatically. Changed to `E040_{fieldName}` (e.g., `E040_route_id`, `E040_stop_lat`) so each field has a unique, addressable code.
- **`detectReferenceDate` Dominant-Period Selection**: Previously selected the single calendar entry with the latest `start_date`, which could pick a holiday-only service entry (e.g., a Sunday-only entry starting Jan 4) as the reference period. Now groups calendar entries by `start_date` and selects the group with the most entries (the dominant schedule period), breaking ties by latest date. Fixes Montréal STM feed showing all routes as Sunday-only.
- **`parseCsv` Whitespace Trimming**: Added PapaParse `transform` option to `.trim()` all field values, preventing service ID mismatches caused by leading/trailing spaces in real-world feeds (e.g., Sacramento SacRT's `calendar.txt` had `" 1"` instead of `"1"`). Fixes zero-departure output for such feeds.
- **`detectReferenceDate` Null Guard**: Added `!calendar ||` before `calendar.length === 0` to prevent a crash when a feed has no `calendar.txt` (calendar_dates-only feeds like Kingston Transit). The function now falls back to today's date as the reference.
- **Extended GTFS Route Type Support**: `getModeName()` previously only recognized the 8 base GTFS route types (0–7). Added range-based fallback covering the full HVT extended type spec: 100–199 (Commuter Rail), 200–399 (Bus), 400–599 (Tram/Light Rail), 600–699 (Subway/Metro), 700–899 (Bus), 900–999 (Tram/Light Rail), 1000–1199 (Ferry), 1300–1499 (Gondola). Fixes TTC (type 700) and TransLink (type 715) showing as generic "Transit" instead of "Bus".
- **Missing `direction_id` Warning**: When a GTFS feed's `trips.txt` has no `direction_id` column, all trips are merged into a single direction (`dir=0`). Added a warning to affected raw departure records so users can see this in the pipeline output. Affects feeds like Kingston Transit.
- **`getModeCategory` Extended Rail Type Support**: `getModeCategory()` (used to select rail vs. surface tier thresholds) only recognized base GTFS types `0`, `1`, `2`, `12`. Feeds using GTFS extended types for metro/subway (e.g., type `400` — Urban Railway Service) were incorrectly assigned surface thresholds, preventing subway routes from reaching Rapid/Freq++ tiers. Added range checks for HVT extended types: 100–199 (Commuter Rail) and 400–599 (Urban Rail/Metro/Underground) now correctly map to the `'rail'` category. Fixes TTC `Toronto.zip` (type 400) subway routes being incorrectly capped at Freq+ instead of earning Rapid/Freq++ tiers.

- **`determineTier` Uses Window Span Instead of Service Span**: `applyAnalysisCriteria` passed `end - start` (the full analysis window width, e.g. 900 min for 7am–10pm) as `spanMinutes` to `determineTier`, which used it to compute `minTrips = ceil(spanMinutes / T)`. A peak-hour route running 7am–9am at 7-min headway has 18 trips — correctly qualifying for T=10 — but `ceil(900/10) = 90` required trips, so it was silently demoted to T=60 (Infreq). Changed to use the actual service span (`lastDeparture - firstDeparture` within the window), so the trip-count gate scales to how long the route actually operates. CTA Route 143 (18 trips, 7-min headway, 2-hr rush window): T=60 → T=10.
- **`detectReferenceDate` Placeholder Calendar Causes 0 Routes**: Some agencies (e.g. Foothill Transit CA, Durham Area Transit NC) publish a year-long `calendar.txt` with service_ids that don't match any trips (placeholder entries), while the actual service window lives entirely in `calendar_dates.txt` (a 6-week range). `detectReferenceDate` computed the midpoint of the year-long calendar range (September), putting all `calendar_dates` entries >150 days outside the 90-day Step 2 window → 0 active services → 0 routes. Fixed: after computing the calendar reference date, if `calendarDates` type-1 entries exist and their midpoint is >90 days away, use the calendarDates midpoint as the anchor instead. Foothill Transit: 0 → 71 weekday routes. Durham Area Transit: 0 → 32 weekday routes.
- **`parseGtfsZip` Throws on Valid Exception-Only Feeds**: Feeds that use `calendar_dates.txt` as the sole source of service data but produce an empty synthesized calendar (because each `service_id` appears only once — e.g. Go Transit ON, UP Express, Hullo Ferries BC) triggered the "must contain either calendar.txt or calendar_dates.txt" error even though `calendarDates` had valid data. `getActiveServiceIds` Step 2 already handles these natively; the guard now only throws when **both** `calendar` and `calendarDates` are empty.
- **`getActiveServiceIds` Single-Day Calendar Services Ignored**: Feeds that encode every operating day as a separate one-day `service_id` in `calendar.txt` (start_date = end_date, e.g. Washington State Ferries) produced 0 analysis routes. `detectReferenceDate` picked the latest date (often a weekend), and the Step 1 range check `refDate < start_date || refDate > end_date` required an exact match, so only that one service passed. Added a ±90-day proximity window for single-day services (matching the same tolerance used in Step 2 for calendar_dates). WSF: 0 → 38 weekday routes.
- **`detectReferenceDate` Picks Weekend for Single-Day Service Feeds**: When every calendar entry has a unique `start_date` (all groups size 1), the tiebreaker picked the latest date which could be a weekend or outlier. Changed to use the **median** `start_date` for all-singleton feeds, producing a more central reference anchor.
- **`calculateStopSpacing` NaN Guard for All-Invalid Coordinates**: If every stop in a route had unparseable coordinates (all NaN), the `distances` array would be empty, causing `avgSpacing = 0/0 = NaN` and the function to return a result with `NaN` spacing values. Added an early `return null` when `distances.length === 0` so callers receive a proper null signal rather than a poisoned result object.
- **`VALID_ROUTE_TYPES` Full HVT Range Coverage**: `validateGtfs()` used a fixed Set of extended route types that only covered the first 20 values of each range (e.g., 700–719) instead of the full HVT spec range (700–799). Any feed using a valid extended type outside those 20-value windows (e.g., type 745 or 920) would generate spurious W021 "non-standard route_type" warnings. Replaced the Set with a range-based `isValidRouteType()` check covering all valid HVT extended types (100–1799).

### Added
- **Atlas NextGen Backend (`server/`)**: Scaffolded the Atlas NextGen persistence backend inside the Atlas repo. Node.js/TypeScript/Express server with a Postgres database, continuous GTFS-RT ingestion per agency, and structured ingestion health logging. Polls configured agencies every 30 seconds and writes every observed vehicle position to a `vehicle_positions` table — building the historical record needed for OTP analysis.
- **Atlas NextGen — 15 Live Agencies**: DRT (PULSE BRT + N1/N2), TTC (all streetcars + Line 6 Finch West LRT), MBTA (Green Line B/C/D/E + Routes 28/66/23/39 + Silver Line SL1–SL5), SEPTA (subway-surface trolleys + Route 23), OC Transpo (Transitway BRT), TriMet (MAX + FX2 + Streetcar + Route 72), Metro Transit Minneapolis (Arterial/Freeway BRT), MTA NYC Bus (all SBS routes), GCRTA Cleveland (HealthLine + rail), Edmonton (Routes 4/8/9 — zero-padded as 004/008/009; LRT absent from feed), Milwaukee MCTS (CONNECT 1 BRT + MetroEXpress + Route 30), WeGo Nashville (all 8 Frequent Network corridors), Halifax Transit (Route 1), TransLink Metro Vancouver (RapidBus R1–R5 + 99 B-Line + Routes 25/49), Spokane Transit (City Line BRT + Routes 6/9/25/66).
- **Atlas NextGen — Pending Stubs**: Miami-Dade, Las Vegas RTC, LA Metro Rail (all Swiftly — one key unlocks all three); SF Muni (511 key); King County Metro Seattle (OBA key); Madison Metro (API key); San Diego MTS (API key); Foothill Transit Silver Streak (IP whitelist); CTA Chicago (custom JSON adapter required, key in hand).
- **Atlas NextGen Docs**: Restructured roadmap and docs suite — `ROADMAP_NEXTGEN.md` (technical phases with accurate [x] status), `ROADMAP_PRODUCT.md` (builder dashboard + agency dashboard product specs), `AGENCIES.md` (full live registry), `RESEARCH.md` (agency pain points synthesis from FTA/APTA/TransitCenter literature). All linked from `ROADMAP.md`.
- **"Ouija" → "Atlas NextGen"**: Renamed throughout all files, comments, package.json, and docs. `.env.example` database name updated.
- **`getActiveServiceIds` All-Zero Calendar Entry (Wellington Metlink Pattern)**: Some feeds (e.g. Wellington Metlink NZ) write every service to `calendar.txt` with all day-of-week fields set to `'0'` as placeholder entries, then define actual run dates entirely via `calendar_dates.txt` exception_type=1. The old code excluded any service_id present in `calendar.txt` from Step 2 calendar_dates lookup, so all 17,318 exception entries were silently skipped and 0 departures were produced for the entire feed. Fixed by filtering `calendarServiceIds` to only include services that have at least one day field set to `'1'` — all-zero placeholder entries now fall through to Step 2. Added 2 tests covering the fix and the no-calendar_dates case.
- **Test Coverage: `t2m` Negative Time Rejection**: Added tests confirming `t2m('-1:00:00')` and `t2m('-0:30:00')` return `null`. The `-0` case exposed a gap in the original `mins < 0` guard (JavaScript `-0 === 0`), fixed by checking for a leading `-` in the string before parsing.
- **Test Coverage: Sub-Minute Frequency Headway Rejection**: Added tests for `headway_secs=1`, `headway_secs=59` (rejected), and `headway_secs=60` (accepted minimum), plus a float-accumulation test confirming all departure times are exact integers after a 17-hour frequency block with 900s headway.
- **Test Coverage: `validateGtfs` Duplicate `trip_id` (E032)**: Added test confirming duplicate `trip_id` values are detected, the issue carries the correct code, and the `examples` array contains the offending ID.
- **Test Coverage: `computeRawDepartures` Crash Guard**: Added test confirming that feeds with missing `routes`, `trips`, or `stopTimes` return `[]` rather than crashing.
- **Test Coverage: Single-Date Service Visibility (Cascade Fix)**: Added test reproducing the `synthesizeCalendarFromDates` + `detectReferenceDate` cascade bug where a single-date service was invisible end-to-end. Confirms the fix: all-zero entries excluded from synthesized calendar, reference date derived from `calendarDates` midpoint.
- **Test Coverage: `calculateCorridors` (0 → 6 tests)**: Added a complete `calculateCorridors` describe block covering: corridor detection on shared stop pairs, single-route exclusion, empty-window returns, combined-frequency headway reduction, ascending sort order, and Saturday day type handling.
- **`transit-logic.ts` Refactored into Focused Modules**: Extracted the 990-line god file into six focused modules: `transit-utils.ts` (t2m/m2t/computeMedian/getModeName), `transit-calendar.ts` (detectReferenceDate/getActiveServiceIds), `transit-phase1.ts` (computeRawDepartures), `transit-phase2.ts` (determineTier/computeHeadwayStats/applyAnalysisCriteria/calculateTiers), `transit-corridors.ts` (calculateCorridors), `transit-spacing.ts` (calculateStopSpacing). `transit-logic.ts` is now a pure re-export barrel — all existing imports remain unchanged.

### Scripts Fixed
- **`stress-test-tiers.ts` Tier Label Mapping**: The batch stress-test script was comparing against human-readable tier labels (`'Rapid'`, `'Freq++'`, etc.) when the pipeline actually stores numeric string keys (`'10'`, `'15'`, `'20'`, `'30'`, `'60'`). This caused all non-span tiers to be invisible in the summary table. Fixed the `tierOrder` array and added a `tierLabels` mapping to display both the friendly label and the count correctly.
- **`stress-test-tiers.ts` `readFileSync` Crash Guard**: If a zip file was listed by `readdirSync` but disappeared or became inaccessible before `readFileSync` ran (e.g., partial downloads being cleaned up), the script threw an unhandled ENOENT error and aborted the entire batch run. Wrapped `readFileSync` in a try-catch so individual bad files are skipped gracefully.

### Added
- **Firebase Authentication Engine**: Integrated real Firebase Auth supporting Email/Password and passwordless Magic Link sign-in.
- **App-Wide Auth Guarding**: Implemented a root-level authentication gate with a cinematic loading state to ensure secure access to all platform modules.
- **Magic Link Handler**: Added logic to automatically complete sign-in when users click magic links from their email.
- **Environment Configuration**: Established a secure `.env.local` framework for managing Firebase credentials and other sensitive deployment secrets.
- **JetBrains Mono Integration**: Explicitly loaded JetBrains Mono via Google Fonts in `index.html` to guarantee the platform's technical aesthetic across all devices.
- **Multi-Dimensional Roadmap Architecture**: Restructured the project roadmap into a modular directory (`docs/`) to separate Product, Technical, and Platform (Vision) trajectories.
- **Product Vision Statement**: Created a new `VISION.md` articulating the "Planner's Loop" philosophy and the transition to a Generative Transit Intelligence platform.
- **Automated Sample Ingestion**: Added a "Load Portland Sample" shortcut to the Audit module's empty state for rapid data pipeline verification.
- **Frequency Bucket Validator**: Created `scripts/check-buckets.ts` for deep-dive auditing of route frequency tiers and exclusion policy violations (grace minutes/max grace errors).
- **Secondary Action Framework**: Enhanced `EmptyStateHero` to support dual-action layouts for modular onboarding.

### Changed
- **Dynamic Deployment Routing**: Updated `vite.config.ts` to automatically adjust the `base` path during CI builds, resolving the blank-page issue on GitHub Pages.
- **Theme Persistence Engine**: Overhauled the theme hook to persist user preferences (light/dark mode) to `localStorage`, with automated fallback to system OS preferences.
- **Roadmap Evolution**: Updated `ROADMAP_TECHNICAL.md` to define the next-gen stack: Firebase for identity, MongoDB Atlas for the cloud catalog, and Cloudflare R2 for GTFS storage.
- **Planning Logic Alignment**: Refined the 5-pillar core architecture (Audit, Strategy, Simulate, Predict, Optimize) to synchronize nomenclature across the platform.
- **Homepage Narrative**: Upgraded module descriptions and CTAs on the landing page to focus on transit engineering outcomes (e.g., "Verify Claims", "Design Network").
- **Audit Module Refinement**: Standardized the Audit module description to focus on "Technical GTFS validation and AI-generated frequency claim auditing."

### Fixed
- **Async Transaction Safety**: Resolved a critical anti-pattern in `storage.ts` where asynchronous database rejections were silently swallowed.
- **Worker Error Visibility**: Engineered error handlers for Web Workers in the Screener and Corridor analysis to surface failures as actionable user toasts.
- **React Reconciliation Keys**: Fixed a bug where table rows used array indices as `key` props, causing UI glitches when filtering analysis results.
- **Dark Mode CSS Specificity**: Corrected the `CityHero` CSS selector to properly target the `.dark` class on the root element.
- **Command Palette Audit**: Removed a non-existent `/map` command and synchronized version labels and module descriptions with the latest platform nomenclature.

### Removed
- **Legacy Icon Imports**: Stripped 11 unused icon imports from `TopNav.tsx` to reduce unused code overhead.
- **Stub Authentication**: Replaced the previous manual toggle-based auth with the real Firebase identity provider.
- **Reports Module Pillar**: Relegated "Reports" from a primary navigation pillar to a platform feature/output, streamlining the global navigation to the five core strategic modules.


## [0.10.0] - 2026-03-09
### Added
- **Frequencies.txt Support**: Full expansion of frequency-based GTFS schedules into individual departures. Template trips are expanded at headway intervals with synthetic trip IDs, supporting agencies like LA Metro that use `frequencies.txt`.
- **Reference Date Auto-Detection**: `detectReferenceDate()` finds the midpoint of the latest service period to prevent merging non-overlapping schedule periods (e.g., summer and winter schedules).
- **GTFS Pipeline Test Script**: `scripts/test-gtfs-pipeline.ts` for validating real-world GTFS feeds, showing trip counts, headways, and service spans per route/direction/day.
- **Global Error Boundary**: Moved `ErrorBoundary` to `src/components/` for app-wide crash protection.
- **Authentication System**: Implemented `useAuthStore` with Zustand for persistent session management. Features a secure-gated access model for all intelligence modules.
- **Premium Auth Gates**: Integrated `ModuleLanding` component with cinematic Framer Motion animations to gate-keep modules for unauthenticated users.
- **Unified Brand Experience**: Redesigned the "Atlas by Civic Minds" navigation architecture, standardizing on a high-fidelity text-based logo and minimized TopNav.
- **Premium Home Page Redesign**: Engineered a data-driven "Burner" home page at `/burner` featuring full-bleed map visualizations and Bento Box grids. Standardized on a "Technical Precision" aesthetic with high-contrast light mode and CartoDB Positron mapping.
- **Functional UI Visualization**: Replaced abstract icons with functional mock telemetry and metric grids to demonstrate platform capabilities immediately ("Show, Don't Tell").
- **Optimized Strategy Module**: Enhanced `ScreenerView` with a "Commit to Catalog" workflow, allowing analyzed GTFS feeds to be permanently stored in the system-wide Atlas.
- **Feed Management UI**: Refined the `AdminView` adding a "Cataloged Feeds" overview showing metadata and providing single-click deletion controls for committed GTFS libraries.
- **UI Transparency**: Added a detailed "Reliability Breakdown" panel to the `RouteDetailModal` to explicitly show the arithmetic of consistency scores, bunching penalties, and outlier penalties.
- **Atomic Commits**: Engineered a `runTransaction` helper in the IndexedDB storage layer and applied it to catalog commits to guarantee transaction safety and prevent partial data corruption.
- **Data Protection**: Added an "Export DB" feature to the Screener module allowing users to securely download their entire mapped catalog history as a portable JSON backup.

### Changed
- **Platform Nomenclature**: Synchronized all product pillars and navigation to the new "Audit / Strategy / Simulate / Predict / Optimize" framework.
- **Catalog Route Lookups**: Replaced redundant `.find()` calls with pre-built `Map` lookups for O(1) route resolution.

### Fixed
- **NaN Propagation in `t2m()`**: Malformed departure times (e.g., `"7:abc:00"`) now return `null` instead of leaking `NaN` into downstream headway computations.
- **NaN Propagation in `stop_sequence`**: Malformed sequence values are skipped instead of corrupting departure ordering.
- **NaN Guards in Shape/Stop Parsing**: Added `Number.isNaN()` guards to coordinate parsing in shapes, stop spacing, and polyline fallbacks.
- **Calendar Date Range Filtering**: `getActiveServiceIds()` now filters calendar entries by `[start_date, end_date]` range, preventing stale or future schedule periods from inflating trip counts.
- **Routing Engine Stability**: Resolved a critical mapping regression where intelligence paths (e.g., `/atlas`) were misrouted to incorrect view components.

### Removed
- **Dead Code**: Removed unused `BurnerHomePage`, duplicate `ErrorBoundary` in simulator, and dead `routeToStops` map in `PredictContext`.

## [0.9.0] - 2026-02-27
### Added
- **Persistent Route Catalog**: New catalog layer (`src/types/catalog.ts`, `src/core/catalog.ts`, `src/types/catalogStore.ts`) that stores committed routes permanently in IndexedDB. Upload GTFS, screen routes, commit to catalog — data persists across sessions.
- **Multi-Agency Support**: Multiple agencies coexist in the catalog. Upload LA Metro, then BART — both persist and are filterable on the Atlas map.
- **Multi-Agency GTFS Parsing**: Parser now reads `agency.txt` and assigns per-route `agency_id` from `routes.txt`. Combined feeds (e.g., MassDOT with 20+ operators) properly attribute routes to their operators.
- **Route Shape Storage**: Shapes resolved at commit time (most common `shape_id` per route/direction, fallback to stop-sequence polyline) and stored inline on each catalog entry for instant map rendering.
- **Route History Tracking**: Every feed upload creates new catalog snapshots. Old entries are never deleted. Routes grouped by `routeKey` show frequency changes over time (e.g., Route 10 went from 10min to 30min headway).
- **Direction Pairing**: `routePairKey` groups Dir 0 and Dir 1 of the same route together in the database, associating both directions as a single logical route.
- **Schedule Change Detection**: When re-uploading for the same agency, compares tier, avgHeadway (within 2min), and tripCount (within 10%). Unchanged routes inherit verification status; changed routes reset to unreviewed.
- **Commit Flow**: "Commit to Catalog" button in Screener opens a modal with agency name auto-detection, feed date ranges, and change detection preview before writing to catalog.
- **Verification Controls**: Verify / Flag / Skip buttons in the Route Detail Modal, with notes field for flagged routes. Persists to IndexedDB via catalog store.
- **Route Detail Audit View**: Complete rewrite of `RouteDetailModal` with Summary and Departure Audit tabs. Audit tab shows per-individual-day breakdown (Mon-Sun), departure table, headway timeline scatter plot, gap distribution chart, and departure strip visualization.
- **Gap Distribution Chart**: Visual bar chart showing "10 gaps of 10min, 2 gaps of 12min" with red highlighting for gaps exceeding tier threshold.
- **Two-Phase Analysis Engine**: Complete rewrite of `transit-logic.ts` splitting analysis into raw extraction (per individual day, no filtering) and criteria application (time windows, tier classification, weekday rollup using worst-tier-across-days).
- **Configurable Analysis Criteria**: `AnalysisCriteria` type with per-day-type time windows, tier thresholds, grace minutes, and mode-specific overrides. `DEFAULT_CRITERIA` in `src/core/defaults.ts`.
- **Per-Day Raw Departures**: `RawRouteDepartures` stores every departure time, every gap, service span, and service_id provenance for each route/direction/individual-day combination.

### Changed
- **Atlas Map Rewrite**: `AtlasView.tsx` now reads from the catalog store instead of staging stores. Shapes are pre-resolved. Added agency filter sidebar, tier counts, auto-zoom via `FitBounds`, and verification status in route popups.
- **IndexedDB Schema**: Bumped to v4 with two new stores (`route_catalog`, `feed_meta`). Added `getAllItems()` and `putItems()` batch methods to `StorageService`.
- **GTFS Type Extensions**: Added `GtfsAgency` interface, `agency_id` to `GtfsRoute`, `agencies` array to `GtfsData`.

## [0.8.1] - 2026-02-25
### Added
- **Developer Experience Optimization**: Simplified the Vite `base` configuration to root (`/`) for local development, eliminating the forced redirect to `/Atlas/` when opening `localhost`.
- **Module Nomenclature Alignment**: Synchronized all primary module titles and paths across `TopNav`, `HomePage`, and individual module landing pages to: Audit, Strategy, Simulate, Predict, and Atlas.
- **Improved Routing Architecture**: Corrected the routing logic in `App.tsx` to ensure that specific URLs correctly map to their intended functional views (e.g., `/strategy` to `ScreenerView`, `/predict` to `SimulatorView`).
- **Module Landing Pages**: Implemented high-fidelity, agency-agnostic landing pages for all core modules (Verify, Strategy, Simulate, Predict, Atlas) that provide feature summaries for signed-out users.
- **Premium Component Library**: Engineered a reusable `ModuleLanding` component with Framer Motion micro-animations and a focused "Swiss-style" layout.

### Changed
- **Unified Branding**: Standardized the "Atlas by Civic Minds" logo presentation and module headers for a more cohesive platform experience.
- **Navigation Clarity**: Refined the global header to use standardized pathing (`/strategy`, `/simulator`, `/predict`, `/atlas`, `/verifier`) that remains robust across different base URL configurations.
- **UI Focus**: Removed redundant security and uptime telemetry from landing pages to prioritize core feature visibility.
- **TopNav Refinement**: Removed UI clutter from the global navigation, including the dark/light mode toggle and login/logout icons. Standardized "Atlas" and "by Civic Minds" to exactly the same font size. Capitalized "Log In" and "Log Out".
- **Homepage Minimalism**: Removed the small version text ('Civic Minds Atlas v1.5') above the main headline. Adjusted the rotating gradient word in the feature headline to randomly initialize on page load rather than shifting via an interval.
- **Premium Design System Update**: Enhanced global design tokens with multi-layered elevation shadows and glassmorphism utilities in `index.css`.
- **Enhanced Visual Hierarchy**: Refined typography across module headers and navigation items, focusing on high-contrast tracking and bold accents.
- **Redefined Branding**: Transitioned to "Intelligence for Mobility" as the core architectural philosophy.
- **Unified Nomenclature**: Standardized all module titles and internal labeling to "Screen", "Simulate", and "Verify" (tense-shifted) for professional parity.
- **Improved Visual Parity**: Standardized capitalization across hero headlines and synchronized the "A" logo with "by Civic Minds" subtext.
- **Cinematic Backdrop**: Refined the high-fidelity isometric city background with improved full-width scaling and optimized fade-out boundaries for better content clarity.
- **Premium Readme Re-Architecture**: Rebuilt `README.md` with a high-fidelity "Problem/Features/Stack" framework consistent with the Civic Minds ecosystem.
- **Platform Hierarchy Optimization**: Optimized the homepage to move the core feature grid into primary focus.

### Fixed
- **Time String Parsing**: Fixed edge cases in time utility for GTFS extended times past 24:00:00.
- **Analysis Robustness**: Improved air-gap handling in headway calculations to prevent crashes on routes with missing stop-sequence data.
- **Baseline Isolation**: `SimulatorContext` baseline calculation no longer includes per-stop overrides, ensuring an honest unmodified-system comparison.

### Changed
- **Minimalist TopNav**: Removed hover background highlights from the global navigation bar and header buttons for a cleaner, more minimal appearance.
- **Streamlined Global Navigation**: Integrated "Reports" into the primary `TopNav` to ensure all key platform facets are accessible via the main header.
- **Footer Deconstruction**: Removed the redundant global footer from `App.tsx` to favor a cleaner, single-nav architecture and reduce visual clutter.
- **Agency-Agnostic Architecture**: Fully decoupled all legacy TTC/MBTA hardcoding. The platform now dynamically derives routes, colors, and icons from the ZIP data.
- **Mode-Aware Screener**: Updated results table to include "Mode" tracking and specific teal/cyan color coding for high-frequency rail tiers.
- **Dynamic Route Selection**: Overhauled the Simulator's route indexing to support dynamic branding and mode-specific iconography based on GTFS metadata.
- **Integrated Health Audits**: Consolidated validation results and stop-health diagnostics into the primary Screen header.
- **Standardized Nomenclature**: Realigned all module headers and navigation to strict active verbs (Screen, Simulate, Verify).
- **Documented Roadmap**: Aligned `ROADMAP.md` with the completed Intelligence foundation and defined next-steps for Strategy and Discovery phases.
- **Admin Store Sync**: `AdminView` now uses the shared `useGtfsWorker` hook and syncs results to the Zustand store via `useTransitStore().setResults()`, eliminating stale state after GTFS upload.
- **Predict Worker Deduplication**: `PredictView` now uses the shared `useGtfsWorker` hook instead of an inline worker bootstrap, with Zustand store sync for cross-module consistency.
- **Corridor Analysis Off-Thread**: `ScreenerView` dispatches corridor analysis to the GTFS web worker instead of running `calculateCorridors()` on the main thread, preventing UI freezes on large feeds.

### Fixed
- **Time String Parsing**: Fixed edge cases in time utility for GTFS extended times past 24:00:00.
- **Analysis Robustness**: Improved air-gap handling in headway calculations to prevent crashes on routes with missing stop-sequence data.
- **Baseline Isolation**: `SimulatorContext` baseline calculation no longer includes per-stop overrides (custom dwell/accel times), ensuring an honest unmodified-system comparison.
- **Hardcoded Agency Removal**: Removed TTC-specific route entries (504, 501, 510) from `tripPerformance.ts`. Performance data is now generated dynamically for any route.

### Removed
- **Legacy Components**: Deleted the `legacy/` directory and deprecated agency-specific alert services.

## [0.8.0] - 2026-02-24
### Added
- **Color-Coded Visual System**: High-fidelity, color-coded backgrounds and precision lines for all homescreen pillars (Emerald, Indigo, Purple, Rose, Blue).
- **Balanced 5-Pillar Grid**: Optimized homescreen layout to a single horizontal row on desktop for a professional "Enterprise Suite" appearance.
- **Global State Management**: Integrated `Zustand` for seamless data sync across Screener, Verifier, and Simulator modules.
- **Premium Notification System**: Stunning, animated toast component using `Framer Motion` to replace jarring browser alerts.
- **Strict Type System**: Comprehensive `src/types/gtfs.ts` interfaces for all transit entities, providing full IDE support and type safety.
- **Modular Component Architecture**: Extracted complex logic into standalone components (`CorridorAuditModal`, `StopHealthModal`) for better maintainability.
- **Unified Transit Logic**: Centralized core algorithms into `src/core/transit-logic.ts` to ensure code parity between the main thread and Web Workers.

### Changed
- **Ecosystem Consolidation**: Redefined the core product pillars to a streamlined 5-module workflow: Screen, Simulate, Optimize, Explorer, and Predict.
- **Dynamic Ecosystem Stats**: Integrated real-time data providers to the homepage, including a dynamic city count for the Explorer module sourced from the `REPORT_CARDS` database.
- **Goal-Oriented CTAs**: Replaced generic navigational labels with functional, action-oriented calls to action (e.g., "Analyze Integrity", "Model Scenarios") across all product pillars.
- **Copy Refinement**: Standardized hero and footer descriptions to concise, single-sentence value propositions, focusing on "Architecting" and "Precision" while eliminating redundant branding.
- **Footer UI Optimization**: Streamlined the footer architecture to remove redundant tagline text and focus on the core planning toolkit description.
- **TopNav Synchronization**: Fully aligned global navigation with the homepage modules for consistent naming, order, and visual identity.
- **Architectural Optimization**: Reduced `ScreenerView` and `VerifierView` complexity by ~50% via modular extraction and hook-based logic.
- **Worker Orchestration**: Introduced the `useGtfsWorker` custom hook to encapsulate lifecycle, state tracking, and cleanup for GTFS parsing.
- **Persistence Layer**: Streamlined IndexedDB interactions via the global store, ensuring reliable data recovery across sessions.
- **Admin Ingestion Flow**: Re-aligned `ScreenerView` to direct users to the Administrative Console for data assets, ensuring consistent state across the ecosystem.
- **UI Nomenclature**: Standardized primary action secondary labeling to "Initialize Module" for professional parity.

### Fixed
- **Admin Navigation**: Resolved 404 routing issue when accessing the Administrative Console from the Screener module by correcting path resolution for subdirectory deployments.

### Removed
- **Verify Module**: Removed the manual "Verify" auditing module from primary navigation and homepage to favor a more automated "Intelligence-first" workflow.

## [0.7.0] - 2026-02-22
### Added
- **Atlas Ecosystem Roadmap**: Updated `ROADMAP.md` with long-term vision across Intelligence, Strategy, and Discovery phases.
- **Universal Design Language**: Standardized UI across all modules (Home, Predict, Screener, Simulator, Verifier) with high-fidelity glassmorphism and tabular metrics.
- **Alpha Engine Hardening**: Implemented Dynamic Peak Detection (sliding window) and Corridor Aggregation (road-level frequency).
- **Bus Bunching Detection**: Detects and penalizes "clumped" trips (arriving <25% of average headway) in reliability scoring.
- **Direct Ingestion UX**: Added direct GTFS upload paths to both Screener and Predict views, bypassing the Admin console for faster analysis.
- **Stop Spacing Diagnostics**: Integrated spatial redundancy analysis to detect stops with critical walk-shed overlap (<400m).
- **Stop Health Modal**: New UI diagnostic panel in Screener for auditing route-level stop health and spacing parity.

### Removed
- **Legacy Redundancy**: Deleted standalone `Screen`, `Simulate`, `Verify`, and `Stops` folders following full integration into the Atlas core.

### Changed
- **Reliability Scoring**: Refined the algorithm to penalize both wide gaps and bus bunching for professional-grade transit audits.
- **Persistence Layer**: Optimized IndexedDB storage for GTFS data across sessions, ensuring non-blocking UI performance.


## [0.6.0] - 2026-02-20
### Added
- **Premium Design System**: Transitioned to the "Solid Precision" palette with tabular metrics and cinematic map presets.
- **Stability Fixes**: Corrected deployment pathing for subdirectory compatibility.

### Changed
- **UI Unification**: Standardized headers across Predict and Screener modules.
- **Agnostic Logic**: Generalized the Verifier to remove MBTA/Metro-specific hardcoding.

---
*For older releases, see [CHANGELOG_ARCHIVE.md](CHANGELOG_ARCHIVE.md).*
