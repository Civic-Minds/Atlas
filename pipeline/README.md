# Pipeline layout

`processGtfsBuffer` in `process-core.ts` orchestrates; logic lives in focused modules:

| Stage | Module |
|-------|--------|
| Parse zip | `parseGtfs.ts` |
| Normalize GTFS | `preprocess/run.ts` — filters, letter-suffix merge, agency preprocess, direction synthesis |
| Shape selection | `shape-selection.ts` — display vs analysis shapes, phase-1 filters |
| Frequency analysis | `transit-phase1.ts`, `transit-phase2.ts` |
| Feature build + stop headways | `process-core.ts` (orchestration) |
| Enrichment | `short-turn` in `shape-selection.ts`, `worst-direction.ts` |
| Corridors | `transit-logic.ts` |
| Shared utils | `headway-utils.ts`, `geometry.ts`, `route-metadata.ts`, `synthesize-directions.ts` |

Agency-specific GTFS fixes belong in `transforms/` and are wired through `preprocess/run.ts`.
