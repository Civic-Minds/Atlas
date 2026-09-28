# Atlas experiments

Experiments are implementation and QA work that needs evidence before becoming product or publishing behavior. Product ideas live in the [roadmap experiments list](docs/roadmap/EXPERIMENTS.md).

## Current experiments

| Experiment | Status | Next gate |
|---|---|---|
| [Fixed-period edge-transition gap](docs/experiments/fixed-period-edge-transition-gap/README.md) | Passed validation; not enabled | Decide whether it should affect frequency qualification |
| [Offline stop-hub clustering](docs/experiments/stop-hub-clustering/README.md) | Testing | Rebuild PMTiles and complete map QA |

## Statuses

- **Testing** — evidence is still being collected.
- **Passed validation** — evidence passed; product decision or rollout remains.
- **Shipped** — the experiment became normal product behavior.
- **Archived** — closed or superseded; the report remains available for history.

Each experiment has its own folder. Its `README.md` is the decision record; supporting artifacts belong in that folder's `evidence/` directory.
