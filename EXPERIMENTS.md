# Experiments

Index of Atlas experiments that need explicit validation before they become part of the product or publishing workflow.

This is for implementation and QA work. Product ideas that are not committed roadmap items live in the [roadmap experiments list](docs/roadmap/EXPERIMENTS.md).

## Active experiments

| Experiment | Status | Next gate |
|---|---|---|
| [Offline stop-hub clustering](docs/experiments/stop-hub-clustering.md) | Local verification passed; map QA pending | Rebuild the stop PMTiles preview and verify the map/search result grouping |
| [Fixed-period edge-transition gap](docs/experiments/fixed-period-edge-transition-gap.md) | Seven-agency validation passed; branch-only diagnostic | Decide whether the diagnostic should inform qualification, then add product/UI treatment if approved |

## Completed or archived

Completed experiments remain linked here with their final decision and evidence. Move the detailed record to `docs/experiments/archive/` only when the active list becomes difficult to scan.

No completed experiments are archived yet.

## Experiment record standard

Each detailed record should state:

- the question or product risk being tested;
- the implementation scope and current status;
- the evidence and named test cases;
- the remaining launch gate;
- the final decision and the commit or issue that records it.
