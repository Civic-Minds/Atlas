# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

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
