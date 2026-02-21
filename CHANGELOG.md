# Changelog

## [1.5.0] - 2026-02-20

### Added
- **Predict Module**: A new transit intelligence engine for identifying service gaps and transit deserts.
- **Spatial Grid Engine**: High-fidelity 500m resolution grid for mapping population and employment density.
- **Frequency-Weighted Supply Analysis**: Algorithm to calculate transit service intensity based on GTFS headway data.
- **Intelligence Zones**: Automated ranking and visualization of urban areas with the highest transit undersupply.
- **Dynamic Heatmaps**: Multi-mode visualization for Demand, Supply, and Service Gaps.

### Changed
- **Generalization**: Refactored the Predict module to remove service-specific branding, adopting neutral transit industry terminology (e.g., "Gap Index", "Intelligence Zones").
- **Navigation**: Added "Predict" to the main navigation and homepage feature sets.

## [1.4.0] - 2026-02-14

### Added
- **Atlas Map Module**: City-wide frequency heatmap visualization (Leaflet-based).
- **Spatial Fallback Engine**: Reconstructs route geometries from stop sequences when shapes are unavailable.
- **IndexedDB Persistence**: Persistent storage for GTFS data and analysis results using `StorageService`.
- **Web Worker Integration**: Off-thread GTFS processing for non-blocking UI in Screener and Verifier.

### Changed
- **UI Standardization**: Completed full Tailwind CSS migration across all modules (Home, Screener, Verifier, Simulator, Atlas).
- **Design System**: Refined "Soft Precision" aesthetic with updated glassmorphism and micro-animations.
- **Home UI**: Fixed alignment issues on dashboard cards (right-justified text and icons).

### Fixed
- Runtime crashes in MapView due to missing optional chainings.
- Data synchronization issues between screening and verification stages.
- Incorrect map container height in Atlas module.
