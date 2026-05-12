# Changelog

All notable changes to this project will be documented in this file.

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
