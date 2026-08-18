# Offline stop-hub clustering

**Status:** Local verification passed; map QA pending a PMTiles rebuild.

## Goal

1. Group sibling stops (for example, cross-agency bus bays and rail platforms) offline during the PMTiles build, injecting a static `hubId` into the compiled `stops.pmtiles` file. This avoids viewport-boundary limits and client-side runtime calculations.
2. Consolidate search results for stops sharing a `hubId` into one result with combined routes.

## Evidence

**Metric:** 7/7 test cases passed (100% accuracy) in the dry run.

| Station hub / location | Agency A | Agency B | Distance | Match rule | Dry run | Map QA |
|---|---|---|---:|---|---|---|
| **Rosemont CTA Station** | Pace, “Rosemont Cta Station”<br>`[-87.85965, 42.00045]` | CTA, “Rosemont”<br>`[-87.85915, 41.99912]` | ~155m | Shared token `rosemont` | **Passed** | Pending rebuild |
| **95th Red Line Station** | Pace, “95th Red Line Station”<br>`[-87.624372, 41.721192]` | CTA, “95th/Dan Ryan”<br>`[-87.624391, 41.722596]` | ~156m | Shared token `95th` | **Passed** | Pending rebuild |
| **Cumberland Station** | Pace, “Cumberland CTA Station”<br>`[-87.822000, 41.984000]` | CTA, “Cumberland”<br>`[-87.821000, 41.984100]` | ~85m | Shared token `cumberland` | **Passed** | Pending rebuild |
| **O’Hare Airport** | Pace, “O’Hare Multi-Modal Facility”<br>`[-87.900100, 41.979000]` | CTA, “O’Hare”<br>`[-87.904000, 41.978000]` | ~325m | None; exceeds 250m | **Excluded — transfer** | Pending rebuild |
| **Jefferson Park Hub** | Pace, “Jefferson Park Transit Center”<br>`[-87.7635, 41.9705]` | CTA, “Jefferson Park”<br>`[-87.763, 41.970]` | ~110m | Shared token `jefferson` | **Passed** | Pending rebuild |
| **Davis Street Hub** | Metra, “Davis Street/Evanston”<br>`[-87.6845, 42.0461]` | CTA, “Davis”<br>`[-87.684, 42.046]` | ~100m | Shared token `davis` | **Passed** | Pending rebuild |
| **Howard Station Hub** | Pace, “Howard CTA Station”<br>`[-87.6752, 42.0188]` | CTA, “Howard”<br>`[-87.675, 42.019]` | ~60m | Shared token `howard` | **Passed** | Pending rebuild |
| **Ogilvie vs Union Station** | Metra, “Ogilvie Transportation Center”<br>`[-87.640, 41.882]` | Metra, “Chicago Union Station”<br>`[-87.640, 41.878]` | ~440m | None; different names | **Excluded — transfer** | Pending rebuild |
| **Loop L: Wells/Quincy** | CTA, “Washington/Wells”<br>`[-87.634, 41.882]` | CTA, “Quincy”<br>`[-87.634, 41.879]` | ~330m | None; different names | **Excluded — transfer** | Pending rebuild |

## Launch gate

- Rebuild the local stop PMTiles preview.
- Verify the grouped result on the map and in stop search.
- Check that nearby but distinct transfers remain separate.
- Record the final decision, commit, and any follow-up issue in the experiment index.

[Back to Experiments](../../EXPERIMENTS.md)
