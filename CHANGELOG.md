# Changelog

All notable changes to this project will be documented in this file.

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
