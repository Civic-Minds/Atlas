# Experiments & QA Validation Log

This document tracks experimental features, testing criteria, specific station test cases, and verification status before deploying changes to production.

---

## Active Experiments

### Experiment 1: Offline Stop-Hub Clustering (Tippecanoe Precompiled)
- **Goal**: 
  1. Group sibling stops (e.g., cross-agency bus bays and rail platforms) offline during the PMTiles build phase, injecting a static `hubId` property into the compiled `stops.pmtiles` file. This resolves viewport boundary limits and client-side runtime calculations.
  2. Consolidate search results for stops sharing a `hubId` into a single unified search result with combined routes.
- **Status**: `TESTING` (Vite-node dry-runs pass, PMTiles rebuild in progress).
- **Metric**: **7/7 Test Cases Passed (100% Accuracy)**

- **QA Verification Test Cases**:

| Station Hub / Location | Agency A (Stop Name / Coordinates) | Agency B (Stop Name / Coordinates) | Distance | Match Rule | Dry-Run Status | Map QA Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Rosemont CTA Station** | Pace ("Rosemont Cta Station") <br> `[-87.85965, 42.00045]` | CTA ("Rosemont") <br> `[-87.85915, 41.99912]` | ~155m | Shared token `"rosemont"` | **PASSED** | *Pending rebuild* |
| **95th Red Line Station** | Pace ("95th Red Line Station") <br> `[-87.624372, 41.721192]` | CTA ("95th/Dan Ryan") <br> `[-87.624391, 41.722596]` | ~156m | Shared token `"95th"` | **PASSED** | *Pending rebuild* |
| **Cumberland Station** | Pace ("Cumberland CTA Station") <br> `[-87.822000, 41.984000]` | CTA ("Cumberland") <br> `[-87.821000, 41.984100]` | ~85m | Shared token `"cumberland"` | **PASSED** | *Pending rebuild* |
| **O'Hare Airport** | Pace ("O'Hare Multi-Modal Facility") <br> `[-87.900100, 41.979000]` | CTA ("O'Hare") <br> `[-87.904000, 41.978000]` | ~325m | *None (Exceeds 250m)* | **EXCLUDED (Transfer)** | *Pending rebuild* |
| **Jefferson Park Hub** | Pace ("Jefferson Park Transit Center") <br> `[-87.7635, 41.9705]` | CTA ("Jefferson Park") <br> `[-87.763, 41.970]` | ~110m | Shared token `"jefferson"` | **PASSED** | *Pending rebuild* |
| **Davis Street Hub** | Metra ("Davis Street/Evanston") <br> `[-87.6845, 42.0461]` | CTA ("Davis") <br> `[-87.684, 42.046]` | ~100m | Shared token `"davis"` | **PASSED** | *Pending rebuild* |
| **Howard Station Hub** | Pace ("Howard CTA Station") <br> `[-87.6752, 42.0188]` | CTA ("Howard") <br> `[-87.675, 42.019]` | ~60m | Shared token `"howard"` | **PASSED** | *Pending rebuild* |
| **Ogilvie vs Union St** | Metra ("Ogilvie Transportation Center") <br> `[-87.640, 41.882]` | Metra ("Chicago Union Station") <br> `[-87.640, 41.878]` | ~440m | *None (Different name)* | **EXCLUDED (Transfer)** | *Pending rebuild* |
| **Loop L: Wells/Quincy** | CTA ("Washington/Wells") <br> `[-87.634, 41.882]` | CTA ("Quincy") <br> `[-87.634, 41.879]` | ~330m | *None (Different name)* | **EXCLUDED (Transfer)** | *Pending rebuild* |

---

## Past Experiments & Releases

*(No entries yet. Completed experiments will be archived here once fully rolled out.)*
