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

## Edge-gap booster follow-up

The edge audit was extended to measure genuine opening and closing gaps against
the candidate tier and against the median internal gap in the same period. It
covered the same 1,160-archive census and excluded analysis-window boundaries
when service continued outside the window.

| Tier | Genuine edge candidates | Median edge / tier | 75th-percentile edge / tier | Captured by +10% | +20% | +50% |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 8 | 86 | 1.25× | 2.38× | 0 | 18 | 50 |
| 10 | 1,007 | 1.60× | 3.10× | 109 | 238 | 481 |
| 15 | 2,233 | 1.67× | 3.07× | 273 | 454 | 948 |
| 20 | 3,354 | 1.50× | 3.00× | 422 | 612 | 1,777 |
| 30 | 8,301 | 2.00× | 4.97× | 985 | 1,694 | 2,981 |
| 60 | 11,870 | 1.75× | 5.00× | 2,532 | 3,754 | 5,449 |

This means a single percentage booster is unlikely to describe every edge
case. A small booster captures only a minority of genuine edge candidates,
while a booster large enough to capture most candidates would also admit very
large gaps. The next test should compare percentage boosters with an explicit
maximum, and should keep the edge booster separate from the internal-gap
exception count.

The full-census impact test used one total edge exception and measured the
booster as an addition to the existing per-gap grace:

| Edge booster beyond normal grace | Changed route-period observations | Upgrades | Downgrades |
| ---: | ---: | ---: | ---: |
| 5% of tier | 1,389 | 1,389 | 0 |
| 10% of tier | 2,389 | 2,389 | 0 |
| 15% of tier | 3,031 | 3,031 | 0 |
| 20% of tier | 4,332 | 4,332 | 0 |
| 25% of tier | 5,297 | 5,297 | 0 |
| Existing +10-minute proposal | 4,207 | 4,207 | 0 |

The 20% candidate has a similar total impact to the existing +10-minute
proposal, but it is not equivalent: its absolute allowance grows with the
frequency tier. This is evidence for testing a percentage booster, not yet a
final choice. The next review should compare the percentage rule's actual
maximum gaps by tier and decide whether it needs an absolute ceiling.

Adding a tier-plus-ten-minute ceiling produced these results:

| Booster beyond normal grace | Maximum | Changed observations |
| ---: | ---: | ---: |
| 10% of tier | tier + 10 minutes | 1,686 |
| 15% of tier | tier + 10 minutes | 2,074 |
| 20% of tier | tier + 10 minutes | 2,855 |
| 25% of tier | tier + 10 minutes | 3,620 |
| 20% of tier | tier + 15 minutes | 3,659 |

Every change in these bounded tests was an upgrade. The results do not identify
a uniquely correct percentage, but they do show that an uncapped percentage is
not safe: the observed edge-gap tail includes very large gaps. The defensible
shape is therefore a percentage booster plus an absolute ceiling, with the
percentage and ceiling still requiring a product decision.

The existing public/Beta “Hide irregular routes” and Beta “Hide limited-service
routes” settings are useful for reviewing the visible consequences of a
candidate. They do not participate in the tier calculation and are not a
substitute for the census.

## Hard-gap follow-up

The Q3 comparison used only periods with at least four selected departures so
that the unresolved short-period question did not determine the result. It
also kept the edge allowance disabled and compared each hard-gap threshold
against the same internal-gap policy with the current hard boundary.

The full census contained 332,239 eligible periods. A candidate hard boundary
was tested under both bounded internal-gap policies considered for Q2:

- fixed two internal near misses; and
- 30% of gaps, capped at three near misses.

| Hard boundary | Fixed 2: changed | Fixed 2: faster / slower | 30% capped at 3: changed | 30% capped at 3: faster / slower |
| --- | ---: | ---: | ---: | ---: |
| Existing grace boundary | 0 | 0 / 0 | 0 | 0 / 0 |
| 1.25× target | 9,095 | 7,191 / 1,904 | 10,696 | 8,263 / 2,433 |
| 1.5× target | 21,230 | 21,210 / 20 | 25,105 | 25,085 / 20 |
| 1.75× target | 25,866 | 25,864 / 2 | 30,602 | 30,600 / 2 |
| 2× target | 34,585 | 34,585 / 0 | 40,814 | 40,814 / 0 |

“Faster” means the candidate allowed a period to claim a faster frequency
tier. That is the dangerous direction for this question: a route with a very
large internal hole can look more frequent because the hard boundary was
relaxed.

The examples show why the wider thresholds are not defensible. With a 1.25×
boundary, one Wellington Cable Car period moved from irregular to a 60-minute
tier with gaps including 70 minutes among otherwise roughly hourly service.
With a 1.5× boundary, another period moved to a 60-minute tier despite an
82-minute internal gap. With a 2× boundary, a period with two 120-minute gaps
could qualify for a 60-minute tier.

The Q3 recommendation is therefore to keep the existing hard boundary:

> Any internal gap longer than the normal grace limit — `T + max(5 minutes,
> 15% of T)` — automatically fails that candidate tier. The internal near-miss
> allowance may not excuse a gap beyond this limit.

This is a recommendation, not a production change. It should remain separate
from the pending decisions about the number of internal exceptions and the
minimum evidence required for short periods.

## Decision log

- Edge-gap proposal: one true service-edge exception total, with a fixed
  tier-plus-ten-minute ceiling, was approved for implementation after the
  full-census and full-pipeline validation.
- Internal near-miss policy: pending this study.
- Hard-gap policy: recommendation is to retain the existing grace boundary;
  no larger multiplier should be allowed to turn a large internal gap into a
  near miss.
- Short-period and combined-rule review: pending this study.

## Supporting artifacts

- Candidate rule harness: `scripts/frequency-candidate-rules.ts`
- Candidate rule tests: `scripts/frequency-candidate-rules.test.ts`
- Census audit: `scripts/audit-frequency-candidates.ts`
- Edge-gap distribution audit: `scripts/audit-edge-gap-amounts.ts`
- Edge-gap impact audit: `scripts/audit-edge-gap-impact.ts`
- Full-pipeline comparison: `scripts/audit-edge-gap-pipeline.ts`
- Related issues: [#567](https://github.com/Civic-Minds/Atlas/issues/567),
  [#568](https://github.com/Civic-Minds/Atlas/issues/568),
  [#569](https://github.com/Civic-Minds/Atlas/issues/569),
  [#570](https://github.com/Civic-Minds/Atlas/issues/570), and
  [#571](https://github.com/Civic-Minds/Atlas/issues/571)
