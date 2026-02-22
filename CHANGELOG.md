# Changelog

## [Unreleased]

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
