# Changelog

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
