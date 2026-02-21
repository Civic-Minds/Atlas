# Implementation Plan - Predict Module (Transit Desert Finder)

The **Predict** module is designed to bridge the gap between transit supply (where buses run) and demand (where people live and work). This plan outlines the steps to build a high-fidelity "Planning Sandbox" that identifies "Opportunity Zones" for on-demand transit services like Argo.

## Phase 1: Infrastructure & State Management (Complete)
- [x] Create module directory structure: `src/modules/predict/`.
- [x] Register `/predict` route in `App.tsx` and navigation in `TopNav.tsx`.
- [x] Implement `PredictContext.tsx` using React Context for global analysis state.
- [x] Initialize `PredictView.tsx` with a dashboard layout (Metrics + Map).

## Phase 2: Demand Modeling (The "Census" Layer)
- [ ] **Utility**: Create a spatial grid generator that segments the city into 500m cells.
- [ ] **Data Source**: Implement a mock "Census Engine" that simulates Dissemination Area (DA) level data based on GTFS stop density, or allows uploading a Demand CSV.
- [ ] **Metric**: Calculate a `Demand Score` per cell based on (Population + Job Density).

## Phase 3: Supply Mapping (The "Transit" Layer)
- [ ] **Integration**: Pull `AnalysisResult` from the Screener module.
- [ ] **Intensity Score**: For each grid cell, calculate a `Supply Score` based on the proximity and frequency of nearby routes.
    - *Formula*: `Σ (60 / median_headway)` for all stops within 500m.
- [ ] **Visualization**: implement a transparent supply overlay.

## Phase 4: The Predict Engine (Gap Analysis)
- [ ] **The "Argo Ratio"**: Calculate the `Opportunity Score` for every cell.
    - *Formula*: `Opportunity = Demand_Normalized - Supply_Normalized`.
- [ ] **Hotspot Detection**: Highlight cells where Opportunity > Threshold.
- [ ] **Interactive Sliders**:
    - **Resolution**: Toggle between 250m, 500m, and 1km grids.
    - **Walkshed**: Adjust the supply buffer (standard 400m-800m).
    - **Priority**: Weight residential vs. commercial demand.

## Phase 5: UI/UX & Aesthetic Polish
- [ ] **HUD Enhancement**: Add a "Prediction Console" with real-time stats (Total Pop served, Total Gap area).
- [ ] **Spatial Visuals**: Use `react-leaflet` to render a high-performance Grid Heatmap.
- [ ] **Animations**: Add Framer Motion transitions for switching between "Demand Mode" and "Predict Mode".
- [ ] **Export**: Generate a "Opportunity Report" summary card.

## Success Criteria
- A user can load GTFS data, run the "Predict" analysis, and see a heatmap of Transit Deserts.
- The UI identifies at least one "High Opportunity" zone (e.g. Bradford West Gwillimbury scenario).
- Responsive performance even with 10,000+ grid points.
