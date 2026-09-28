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

I audited 11 of the 110 transitions using the current GTFS departure groups, one deterministic sample every tenth sorted transition. Six reproduced as the intended pattern: one oversized first or last internal gap followed or preceded by a stable cadence. Five did not reproduce cleanly at the route/direction/day/headsign level:

| Sample | Result | Finding |
|---|---|---|
| Bordeaux 7, Sunday evening | Not confirmed | Raw gaps include two oversized internal gaps, 55 and 65 minutes against a 30-minute median. |
| Madison 80, weekday PM peak | Confirmed | One leading 51-minute gap, then 16/15/15-minute service. |
| MiWay 26, weekday AM peak | Not confirmed | Raw group is already strictly sustained at 14–15 minutes; likely terminal/branch-source difference. |
| NFTA 11, weekday midday | Not confirmed | Raw gaps include a 150-minute internal gap against a 60-minute median. |
| Omaha 55, weekday PM peak | Confirmed | One trailing 60-minute gap, then four 30-minute gaps. |
| TTC 114, Saturday late | Confirmed | One trailing 30-minute gap, then eight 15-minute gaps. |
| TTC 301, Saturday overnight | Confirmed | One leading 158-minute gap, then 14–15-minute service. |
| TTC 44, Saturday AM peak | Confirmed | One leading 27-minute gap, then 10-minute service. |
| TTC 52, weekday PM peak | Confirmed | One trailing 33-minute gap, then 17–18-minute service. |
| Rennes 50, weekday PM peak | Not confirmed | No matching raw route/direction/day group in the separately fetched current feed. |
| Rennes 62, weekday evening | Not confirmed | No matching raw route/direction/day group in the separately fetched current feed. |

The five unconfirmed cases are important: the final Atlas feature can select terminal or branch-scoped departure data, while this first audit compared route-level GTFS groups. The two Rennes misses may also reflect the live feed changing between reprocessing and audit. The experiment should remain diagnostic until those source-selection cases are audited against the exact reprocessed feed snapshot.

## Automated coverage

The unit suite includes the transition-gap edge cases and a legitimate fixed-period case. The full suite and typecheck are launch gates for this branch. The experiment remains branch-only until a product decision is made about whether this diagnostic should affect qualification.

## Decision

The implementation is safe to evaluate further: it is additive, deterministic, and produces no existing-output changes across the seven-agency validation set. The 10% sample is not sufficient to authorize changing Atlas's frequency qualification rules; the five unconfirmed cases need exact terminal/branch-source follow-up first.
