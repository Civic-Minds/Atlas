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

## Ten-percent applicability audit

I audited 11 of the 110 transitions, one deterministic sample every tenth sorted transition. A first route-level check appeared to confirm only six. The five apparent misses were then traced through Atlas's actual terminal/shape-scoped departure selection. All 11 ultimately reproduced as the intended pattern: one oversized first or last internal gap followed or preceded by a stable cadence.

| Sample | Result | Finding |
|---|---|---|
| Bordeaux 7, Sunday evening | Confirmed at terminal | The route-level group included later departures outside the fixed evening window; the selected terminal window has one edge transition. |
| Madison 80, weekday PM peak | Confirmed | One leading 51-minute gap, then 16/15/15-minute service. |
| MiWay 26, weekday AM peak | Confirmed at terminal | The terminal schedule contains the transition even though the route-level departure group is strictly sustained. |
| NFTA 11, weekday midday | Confirmed at terminal | Terminal departures have one late-period edge gap; the route-level group included a different branch pattern. |
| Omaha 55, weekday PM peak | Confirmed | One trailing 60-minute gap, then four 30-minute gaps. |
| TTC 114, Saturday late | Confirmed | One trailing 30-minute gap, then eight 15-minute gaps. |
| TTC 301, Saturday overnight | Confirmed | One leading 158-minute gap, then 14–15-minute service. |
| TTC 44, Saturday AM peak | Confirmed | One leading 27-minute gap, then 10-minute service. |
| TTC 52, weekday PM peak | Confirmed | One trailing 33-minute gap, then 17–18-minute service. |
| Rennes 50, weekday PM peak | Confirmed at terminal | Terminal/shape-scoped departures reproduce the edge transition. |
| Rennes 62, weekday evening | Confirmed at terminal | Terminal/shape-scoped departures reproduce the edge transition. |

The apparent five misses were false negatives from checking the wrong layer. Atlas's final period flags use the selected terminal/shape-scoped departures, so that is the schedule that must be audited. The exact trace resolved all five; the route-level groups were not authoritative for those features.

## Automated coverage

The unit suite includes the transition-gap edge cases and a legitimate fixed-period case. The full suite and typecheck are launch gates for this branch. The experiment remains branch-only until a product decision is made about whether this diagnostic should affect qualification.

## Decision

The implementation is safe to evaluate further: it is additive, deterministic, and produces no existing-output changes across the seven-agency validation set. The deterministic 10% sample had 11/11 applicable cases at the actual Atlas terminal/shape source. This supports continuing the experiment, but does not by itself authorize changing Atlas's frequency qualification rules.
