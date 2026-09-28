# Fixed-period edge-transition gap experiment

Status: validation complete on `experiment/fixed-period-transition-gap`; not enabled in production filtering or map classification.

## Question

Can a fixed-period route remain eligible when the only schedule irregularity is one unusually long gap at the beginning or end of the period, such as a BRT route that starts with a 20-minute gap before settling into 10-minute service?

## Scope

The experiment adds `headwayByPeriodSustainedEdgeTransition` beside the existing strict `headwayByPeriodSustained` field. It does not change `periodCoverageHeadway`, frequency filters, tiers, route geometry, or published R2 data.

The tolerance is the branch's existing experimental rule: one first or last internal gap may exceed the median period headway by up to `max(5 minutes, 15%)`; all other internal gaps must stay within that same limit. At least three usable gaps are required.

## Validation set

The local static GTFS reprocess covered seven agencies across three countries and three feed-host families:

| Agency | Country | Feed source family |
|---|---|---|
| Omaha Metro | United States | Mobility Database-hosted feed |
| Toronto Transit Commission | Canada | Toronto open-data CKAN |
| MiWay | Canada | Agency-hosted feed |
| Madison Metro Transit | United States | Agency-hosted feed |
| NFTA | United States | Agency-hosted feed |
| STAR Rennes | France | French open-data FTP |
| TBM Bordeaux | France | Bordeaux open-data GTFS endpoint |

This includes the motivating agency, six additional agencies, foreign feeds, multi-branch networks, and sparse/short-window service cases.

## Commands

All commands were read-only with respect to Atlas publishing and wrote only under `tmp/`:

```sh
npm run audit:reprocess -- --slugs=omahametro,ttc,miway,madison-metro,nfta,rennes,bordeaux --out-dir=tmp/edge-transition-baseline-2026-09-28
npm run audit:reprocess -- --slugs=omahametro,ttc,miway,madison-metro,nfta,rennes,bordeaux --out-dir=tmp/edge-transition-candidate-2026-09-28
npm run experiment:edge-transition:diff -- --baseline=tmp/edge-transition-baseline-2026-09-28 --candidate=tmp/edge-transition-candidate-2026-09-28 --out=tmp/edge-transition-diff-2026-09-28.json
npm run audit:reprocess -- --slugs=omahametro,ttc,miway,madison-metro,nfta,rennes,bordeaux --out-dir=tmp/edge-transition-candidate-exact-2026-09-28-v2
npm run experiment:edge-transition:terminal -- --candidate=tmp/edge-transition-candidate-exact-2026-09-28-v2 --audit-dir=tmp/edge-transition-candidate-exact-2026-09-28-v2 --out=tmp/edge-transition-terminal-audit-exact-2026-09-28-v2.json
```

## Results

- 7/7 agency reprocesses succeeded.
- 31,077 features compared.
- 0 existing-property changes.
- 0 newly-null values.
- 0 newly-present values outside the additive experiment field.
- 0 materially different existing numeric values.
- 110 strict-false to experimental-true period results.
- 0 strict-true to experimental-false results.

The 110 changes are therefore isolated to the intended additive diagnostic. No unexplained baseline output change was found. Omaha contributed three transitions; the motivating feed does not show a broad change to existing route classification.

## Full applicability audit

The first route-level check was not sufficient because Atlas can use terminal/shape-scoped departures instead of route-wide departures. I added an opt-in audit result to the actual pipeline selection path and reran the local candidate processing while saving the audit records beside each artifact. This avoids feed drift between the output and the evidence.

| Agency | Transition cases | Applicable | Missing/ambiguous/invalid |
|---|---:|---:|---:|
| TBM Bordeaux | 10 | 10 | 0 |
| Madison Metro | 6 | 6 | 0 |
| MiWay | 14 | 14 | 0 |
| NFTA Buffalo | 9 | 9 | 0 |
| Omaha Metro | 3 | 3 | 0 |
| STAR Rennes | 26 | 26 | 0 |
| TTC | 42 | 42 | 0 |
| **Total** | **110** | **110** | **0** |

Every case had exactly one audit record and satisfied the intended rule: one oversized first or last internal gap, at least three remaining gaps, stable cadence after removing that edge gap, and valid period boundary coverage. The audit also covers the branch-level fallback used by sparse and overnight features that exit before terminal stop resolution.

## Automated coverage

The unit suite includes the transition-gap edge cases and a legitimate fixed-period case. The full suite and typecheck are launch gates for this branch. The experiment remains branch-only until a product decision is made about whether this diagnostic should affect qualification.

## Decision

The implementation is safe to evaluate further: it is additive, deterministic, and produces no existing-output changes across the seven-agency validation set. The full terminal-level audit found 110/110 applicable cases with 0 missing, ambiguous, or invalid results. This supports continuing the experiment, but does not by itself authorize changing Atlas's frequency qualification rules.
