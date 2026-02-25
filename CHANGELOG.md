# Changelog

## [Unreleased]

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
