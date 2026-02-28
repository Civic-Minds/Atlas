# Changelog

## [0.9.1] - 2026-02-28
### Added
- **Frequencies.txt Support**: Full expansion of frequency-based GTFS schedules into individual departures. Template trips are expanded at headway intervals with synthetic trip IDs, supporting agencies like LA Metro that use `frequencies.txt`.
- **Reference Date Auto-Detection**: `detectReferenceDate()` finds the midpoint of the latest service period to prevent merging non-overlapping schedule periods (e.g., summer and winter schedules).
- **GTFS Pipeline Test Script**: `scripts/test-gtfs-pipeline.ts` for validating real-world GTFS feeds, showing trip counts, headways, and service spans per route/direction/day.
- **Global Error Boundary**: Moved `ErrorBoundary` to `src/components/` for app-wide crash protection.
- **Authentication System**: Implemented `useAuthStore` with Zustand for persistent session management. Features a secure-gated access model for all intelligence modules.
- **Premium Auth Gates**: Integrated `ModuleLanding` component with cinematic Framer Motion animations to gate-keep modules for unauthenticated users.

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

## [0.5.0] - 2026-02-20
### Added
- **Predict Module**: Transit intelligence engine for spatial gap analysis.
- **Spatial Grid Engine**: High-fidelity mapping of demand (pop/emp) vs. supply (headway).
- **Intelligence Zones**: Automated ranking of transit deserts.

## [0.4.0] - 2026-02-14
### Added
- **Atlas Map Module**: City-wide frequency heatmap visualization.
- **Web Worker Analysis**: Off-thread GTFS processing for high-performance UI.
- **Persistence**: IndexedDB storage for GTFS data across sessions.

## [0.3.0] - 2026-02-08
### Added
- **Leaflet MVP**: Transitioned from static HTML to a dynamic map-centric interface.
- **GTFS Parser**: Initial implementation of `gtfsUtils.ts` with shape and stop indexing.

## [0.2.0] - 2026-02-01
### Added
- **Framework Migration**: Shifted to Vite + React + TypeScript architecture.
- **Modular Structure**: Initialized `Screener` and `Verifier` modules.

## [0.1.0] - 2026-01-15
### Added
- **GTFS-Screener MVP**: Single-file HTML/JS tool for basic headway analysis.
