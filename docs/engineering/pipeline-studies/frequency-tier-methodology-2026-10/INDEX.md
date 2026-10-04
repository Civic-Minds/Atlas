# Frequency-tier methodology study

**Status:** In progress

## Question

How should Atlas distinguish genuinely sustained frequency from isolated edge
gaps, middle-of-service near misses, and very large internal gaps?

This study covers the rules that determine a route-period's frequency tier. It
does not use agency policy research as its evidence base; the evidence is the
Atlas processing pipeline applied to the complete local GTFS archive.

## Current production rule

Atlas tests published frequency tiers against the selected departure gaps. A
gap at or below the candidate tier passes. A longer gap may pass through the
existing grace allowance, and the current implementation permits a percentage
of gaps to fall within that grace band. This study tests whether that middle-
gap allowance is too permissive and whether service-edge gaps need separate
treatment.

## Census and unit of analysis

The study reports all of these counts separately:

- GTFS archives inspected;
- feeds that produced usable departure rows;
- raw route/day/direction/pattern rows;
- eligible route-period observations;
- distinct routes and agencies represented;
- weekday, Saturday, Sunday, and rail-midday observations; and
- observations in each baseline tier and gap-count bucket.

The primary unit is an eligible route-period observation, not a unique route.
One route can therefore appear multiple times across directions, day types,
headsings, branches, or service periods.

## Method

The read-only audit runs the same raw GTFS extraction and tier inputs used by
Atlas, then compares candidate rules without writing production data. Each
candidate is measured for:

- tier changes, split into upgrades and downgrades;
- changes by baseline tier, day type, mode, and number of gaps;
- newly qualified or disqualified periods;
- representative departure-time and gap sequences; and
- downstream GeoJSON, corridor, stop-index, geometry, and centre changes when
  a candidate is run through the full processor.

No candidate is promoted to production from the audit alone. A production
change requires an explicit decision, focused tests, full test-suite results,
type-checking, and a complete local archive regression.

## Candidate questions

1. **Service edges:** How many true opening or closing gaps may be excepted,
   and how much longer may they be?
2. **Internal near misses:** Should any middle-of-service exceptions be
   allowed, and should they use a fixed count, a percentage, or a bounded
   combination?
3. **Hard failures:** Should a sufficiently large internal gap fail a tier no
   matter how many other gaps pass?
4. **Short periods and modes:** Do short periods, day types, or rail midday
   windows need different treatment or minimum evidence?
5. **Combined effect:** What does the complete selected rule do when all parts
   are applied together through the production processor?

## Results

The complete local census covered 1,160 GTFS archives:

- 1,015 feeds produced usable departure rows; 62 archives were skipped because
  they could not be processed;
- 895 agency names were represented;
- 22,437 distinct feed-route keys were represented, including 20,202 with at
  least one period containing four or more departures;
- 430,867 route/day/direction/pattern observations were evaluated; and
- the baseline candidate harness matched the production tier result for every
  observation.

The current middle-gap rule is unbounded: it allows at least two near misses,
then allows more as the number of gaps grows (`max(2, floor(30% of gaps))`).
The candidate results below show how many of those observations would receive
a different tier:

| Internal allowance | Changed observations | Faster | Slower |
| --- | ---: | ---: | ---: |
| No internal exceptions | 73,496 | 0 | 73,496 |
| One exception | 32,165 | 0 | 32,165 |
| Two exceptions | 16,935 | 0 | 16,935 |
| Three exceptions | 12,869 | 1,943 | 10,926 |
| 30%, capped at three | 10,926 | 0 | 10,926 |
| 30%, capped at five | 5,854 | 0 | 5,854 |

The three-exception fixed rule creates upgrades because it is more permissive
than the current rule for short periods. The capped percentage rule does not:
it preserves the existing allowance where it is small and stops the allowance
from growing indefinitely on long schedules. Its 10,926 changes are all
downgrades, concentrated in observations with 10 or more gaps; the largest
single transition is 30-minute to 60-minute service (4,072 observations).

This evidence supports allowing middle-of-service near misses, but bounding
them. Because the existing 30% value was not a deliberate product decision,
the recommended rule for the next decision is the simpler fixed cap of two
internal near misses. It is explicit, does not become more permissive just
because a schedule has more trips, and produces no upgrades in the census.
Compared with allowing none or one, it avoids treating ordinary isolated
schedule deviations as a failure while still removing the unbounded allowance
from long schedules. This is a recommendation, not a production change; it
still needs a human decision and a focused review of representative examples
before implementation.

The existing public/Beta “Hide irregular routes” and Beta “Hide limited-service
routes” settings are useful for reviewing the visible consequences of a
candidate. They do not participate in the tier calculation and are not a
substitute for the census.

## Decision log

- Edge-gap proposal: one true service-edge exception total, with a fixed
  tier-plus-ten-minute ceiling, was approved for implementation after the
  full-census and full-pipeline validation.
- Internal near-miss policy: pending this study.
- Hard-gap policy: pending this study.
- Short-period and combined-rule review: pending this study.

## Supporting artifacts

- Candidate rule harness: `scripts/frequency-candidate-rules.ts`
- Candidate rule tests: `scripts/frequency-candidate-rules.test.ts`
- Census audit: `scripts/audit-frequency-candidates.ts`
- Edge-gap impact audit: `scripts/audit-edge-gap-impact.ts`
- Full-pipeline comparison: `scripts/audit-edge-gap-pipeline.ts`
- Related issues: [#567](https://github.com/Civic-Minds/Atlas/issues/567),
  [#568](https://github.com/Civic-Minds/Atlas/issues/568),
  [#569](https://github.com/Civic-Minds/Atlas/issues/569),
  [#570](https://github.com/Civic-Minds/Atlas/issues/570), and
  [#571](https://github.com/Civic-Minds/Atlas/issues/571)
