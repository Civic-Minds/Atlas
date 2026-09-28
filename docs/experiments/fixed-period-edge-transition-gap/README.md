# Fixed-period edge-transition gap

| Field | Value |
|---|---|
| Status | Passed validation; not enabled |
| Branch | `experiment/fixed-period-transition-gap` |
| Decision | Keep as an additive diagnostic pending product approval |
| Commits | `78d135ca`, `d9e6096e`, `032bf258`, `d0371df7` |

## Decision

The experiment is safe to evaluate further, but it does not yet change frequency filters, tiers, map colors, or published R2 data.

## Question

Can a fixed-period route remain eligible when the only schedule irregularity is one unusually long gap at the beginning or end of the period, such as a BRT route that starts with a 20-minute gap before settling into 10-minute service?

## Scope

The experiment adds `headwayByPeriodSustainedEdgeTransition` beside the strict `headwayByPeriodSustained` field. The rule allows one first or last internal gap to exceed the median period headway by up to `max(5 minutes, 15%)`. All other internal gaps must stay within that limit, and at least three usable gaps are required.

It does not change `periodCoverageHeadway`, frequency filters, tiers, route geometry, or published R2 data.

## Evidence

The validation set covered seven agencies across three countries and three feed-host families: Omaha Metro, TTC, MiWay, Madison Metro, NFTA, STAR Rennes, and TBM Bordeaux. It included multi-branch, sparse, foreign-feed, and overnight cases.

The before/after comparison covered 31,077 features:

- 0 existing-property changes;
- 0 newly-null values;
- 0 newly-present values outside the experiment field;
- 0 materially different existing numeric values;
- 110 strict-false to experimental-true results;
- 0 strict-true to experimental-false results.

The full terminal/shape-level audit found:

| Agency | Cases | Applicable | Unresolved |
|---|---:|---:|---:|
| TBM Bordeaux | 10 | 10 | 0 |
| Madison Metro | 6 | 6 | 0 |
| MiWay | 14 | 14 | 0 |
| NFTA Buffalo | 9 | 9 | 0 |
| Omaha Metro | 3 | 3 | 0 |
| STAR Rennes | 26 | 26 | 0 |
| TTC | 42 | 42 | 0 |
| **Total** | **110** | **110** | **0** |

Every case had one oversized edge gap, at least three remaining cadence gaps, and valid period boundary coverage. Sparse and overnight features were also audited through their branch-level fallback.

## Reproduction

All commands were local-only and wrote under `tmp/`; they did not publish to R2:

```sh
npm run audit:reprocess -- --slugs=omahametro,ttc,miway,madison-metro,nfta,rennes,bordeaux --out-dir=tmp/edge-transition-baseline-2026-09-28
npm run audit:reprocess -- --slugs=omahametro,ttc,miway,madison-metro,nfta,rennes,bordeaux --out-dir=tmp/edge-transition-candidate-2026-09-28
npm run experiment:edge-transition:diff -- --baseline=tmp/edge-transition-baseline-2026-09-28 --candidate=tmp/edge-transition-candidate-2026-09-28 --out=tmp/edge-transition-diff-2026-09-28.json
npm run audit:reprocess -- --slugs=omahametro,ttc,miway,madison-metro,nfta,rennes,bordeaux --out-dir=tmp/edge-transition-candidate-exact-2026-09-28-v2
npm run experiment:edge-transition:terminal -- --candidate=tmp/edge-transition-candidate-exact-2026-09-28-v2 --audit-dir=tmp/edge-transition-candidate-exact-2026-09-28-v2 --out=tmp/edge-transition-terminal-audit-exact-2026-09-28-v2.json
npm run typecheck
npm test
```

## Remaining gate

The unit suite and full test suite pass. The next step is a product decision on whether this diagnostic should inform frequency qualification. Until then, it remains branch-only.
