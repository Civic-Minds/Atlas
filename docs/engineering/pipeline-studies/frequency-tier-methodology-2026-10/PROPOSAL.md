# Frequency methodology proposal

**Status:** Internal draft

**Purpose:** Turn the frequency-methodology study into a decision record that
can guide implementation review. This is not an external white paper and does
not itself approve a production or published-data change.

## Executive summary

Atlas should describe scheduled frequency only when the observed departures
show a sustained pattern. The study found that three things need particular
care:

1. Monday–Friday should not be blended into a fictional weekday schedule.
2. A genuine first or last service gap is different from a hole in the middle
   of service.
3. A percentage-based internal allowance must be bounded so a long period does
   not receive dozens of exceptions.

The current analysis-branch candidate therefore keeps the rules explicit:

- evaluate real weekdays individually before producing weekday summaries;
- allow genuine opening and closing edge gaps independently, up to `T + 10`
  minutes total for the tested tier `T`;
- count each qualifying edge gap against the same bounded exception allowance
  used for internal near misses;
- retain the tier-specific internal allowance and three-gap cap documented in
  the study;
- retain the existing hard-gap boundary; and
- require at least four departures after an edge departure is removed; ordinary
  classifications still use the three-departure minimum.

These are branch candidates, not a public commitment. The study and the
implementation must still be reviewed together before publication.

## What the evidence says

The evidence is based on the complete local archive census described in
`INDEX.md`, plus a stratified review of route-period examples.

### Weekday handling

Blending Monday–Friday departures can create a median cadence that did not
occur on any actual weekday. The implementation therefore uses real weekday
observations for displayed statistics and applies the conservative weekday
result when the days differ materially.

### Edge gaps

The full matrix found that uncapped percentage allowances admit very large
edge gaps. A fixed `T + 10` ceiling was easier to explain and preserved the
intended case of a route that starts with one longer gap and then runs at the
target cadence.

Allowing both genuine edges changed only 47 more observations than allowing
one edge under the fixed rule. The route sample included plausible cases such
as hourly service with one 70-minute closing gap and 20-minute service with one
30-minute closing gap.

The sparse examples were not treated as proof that large edge gaps are broadly
safe. They remain tied to the separate minimum-evidence decision.

### Internal gaps and hard failures

The study rejected the former uncapped 30% interpretation because its allowed
number of near misses grew with the number of departures. A long period could
therefore receive many exceptions. The replacement candidate is bounded and
tier-specific.

The hard-gap tests also showed that relaxing the maximum internal gap can make
periods with 70–120 minute holes claim faster tiers. The existing hard boundary
should remain in place.

## Decision status

| Area | Current branch status | What remains before publication |
| --- | --- | --- |
| Weekday rollup | Implemented and tested on the analysis branch | Confirm final product wording and complete the production archive regression. |
| Edge count | Both genuine edges supported | Implemented and regression-tested. |
| Edge amount | Fixed `T + 10` candidate | Implemented and regression-tested. |
| Edge accounting | Edge gaps consume the bounded allowance | Approved and implemented after full-census comparison. |
| Internal allowance | Tier-specific bounded candidate | Implemented and regression-tested. |
| Hard gap | Existing boundary retained | No further change proposed unless new evidence appears. |
| Minimum evidence | Three departures for ordinary classifications; four after an edge allowance | Implemented and regression-tested. |
| Display | Conservative wording candidate | Implemented in the candidate UI. |

## Required approval record

Before any candidate is promoted, record:

1. the exact rule in plain English and code terms;
2. the full-census impact, including upgrades and downgrades;
3. route examples that represent both accepted and rejected cases;
4. downstream artifact differences;
5. focused tests, the full test suite, type-checking, and archive regression;
6. the implementation commit and rollback path; and
7. the date and decision-maker for each rule.

## Validation completed on this branch

- Full automated suite: 801 tests passed.
- Focused frequency and edge tests: 38 tests passed.
- Type-checking: passed for the application and API configurations.
- Production build: passed.
- Downstream artifact comparison: all 209 affected archives completed with no
  errors, geometry changes, route-set changes, or invariant failures. The
  approved comparison found 149 archives and 577 route features with expected
  frequency-related property changes.

This is a local candidate-branch regression, not a production promotion. The
candidate has not been published.

## Future external white paper

An external paper should wait until the rules are stable, implemented, and
validated. It should explain the problem, data inputs, quality-control
principles, frequency calculation, limitations, and examples without exposing
credentials, deployment details, or private maintainer procedures.

The internal study is the source of truth while the methodology is changing.
The future public document should be a shorter, edited explanation derived
from the final approved rules, not a copy of this working record.

## Related record

See [`INDEX.md`](./INDEX.md) for the experiment register, census counts,
simulation tables, route examples, and detailed unresolved questions. The
retroactive decision record is in [`EXPERIMENT-LOG.md`](./EXPERIMENT-LOG.md).
