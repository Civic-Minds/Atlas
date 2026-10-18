# Experiments

Index of Atlas experiments that need explicit validation before they become part of the product or publishing workflow.

This is for implementation and QA work. Product ideas that are not committed roadmap items live in the [experiment ideas list](docs/roadmap/EXPERIMENT_IDEAS.md).

## Active experiments

| Experiment | Status | Next gate |
|---|---|---|
| [Offline stop-hub clustering](docs/experiments/stop-hub-clustering.md) | Local verification passed; map QA pending | Rebuild the stop PMTiles preview and verify the map/search result grouping |

## Validated, not enabled

| Experiment | Status | Next gate |
|---|---|---|
| [Fixed-period edge transition gap](docs/experiments/fixed-period-edge-transition-gap/README.md) | Passed validation; not enabled. A diagnostic field only; the shipped edge-gap allowance in [FREQUENCY_RULES.md](docs/product/FREQUENCY_RULES.md) (PR #584) covers the same long-first-gap case by another mechanism | Product decision on whether the diagnostic field is still needed |

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
