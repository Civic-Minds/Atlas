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

## How much of Atlas is tested

There are two different levels of testing:

1. **Rule testing:** the frequency calculation is rerun across the complete
   local route-period census. This is the broad test: every eligible
   route/day/direction/period observation in the study is compared under the
   candidate rule. It tells us how many classifications would change and
   which kinds of service are affected.
2. **Pipeline testing:** selected affected GTFS archives are then processed
   end to end, from the feed through route geometry, stops, corridors, and
   output metadata. This checks that a frequency change does not break the
   generated products. The final edge-gap candidate regression covered all
   209 affected archives and found no errors, route-set changes, geometry
   changes, or invariant failures.

This means we do test the rule against essentially every eligible route-period
in the local data, but we do not rebuild every archive for every experimental
variant. The expensive full-pipeline run is reserved for the candidate that
has survived the census analysis and focused review.

## Experiment register

Each candidate rule is treated as a separate experiment. The detailed evidence
for each experiment appears in the sections below; this register keeps the
hypothesis, comparison, result, and decision visible in one place.

| Experiment | Hypothesis | Test and result | Decision/status |
| --- | --- | --- | --- |
| Weekday rollup | Combining Monday–Friday departures may create a cadence that never ran on a real day. | Full archive census; 1,726 groups had a faster merged median, including 1,349 that were at least five minutes faster. | Implemented representative real-weekday rollups and slowest-weekday tiering. |
| Q1 edge amount | A genuine first/last-service gap can be treated more leniently without weakening internal-gap checks. | Compared absolute and percentage ceilings across the full census and reviewed a stratified route sample; the edge-gap distribution had a long tail, while regular schedules supported a bounded total allowance. | Use the fixed `T + 10 minutes` branch candidate; do not use an uncapped percentage. |
| Q1 edge count | Both service edges may be exceptions if the internal schedule remains sustained. | Fixed `T + 10` changed 2,948 periods with both edges versus 2,901 with one; the difference was 47, all upgrades. | Both genuine edges are allowed independently, subject to the remaining-trip and internal-gap checks. |
| Q2 internal allowance | A tier-specific sliding percentage may preserve ordinary schedule variation without retaining the unapproved 30% rule. | Tested tier curves, floors, and caps against a strict zero-exception reference; a zero floor and three-gap cap avoided short-period over-qualification. | Implemented `10% / 5%` tier-specific allowances with no floor and a three-gap cap. |
| Q3 hard gap | A larger internal gap multiplier might be acceptable if the rest of the schedule is regular. | Tested 1.25×, 1.5×, 1.75×, and 2× boundaries; wider boundaries created faster tiers despite 70–120 minute holes. | Keep the existing hard boundary. |
| Q4 minimum evidence | Two departures might be enough to identify a sustained frequency pattern. | Two departures produced 34,954 faster classifications; four or more rejected many consistent three-trip patterns. The downstream edge regression found that trimming an edge from four departures could still over-qualify a sparse period. | Retain three departures for ordinary classifications; require four departures after an edge allowance is used. |
| Q5 display | Cautious wording can communicate scheduled cadence without implying a guarantee. | Reviewed route-card labels, longest-gap notices, limited/irregular states, and exception notices against the underlying metrics. | Use `about every`, separate service-state labels, and side-panel explanations. |
| Q6 edge accounting | A qualifying edge booster should not silently stack on top of the internal near-miss allowance. | Full local census comparison: counting each qualifying edge as one exception removed 108 of 2,336 both-edge upgrades and caused no downgrades. | Approved: count the edge against the bounded allowance. |

## Candidate questions

1. **Service edges:** How many true opening or closing gaps may be excepted,
   and how much longer may they be?
2. **Internal near misses:** Should any middle-of-service exceptions be
   allowed, and should they use a fixed count, a percentage, or a bounded
   combination?
3. **Hard failures:** Should a sufficiently large internal gap fail a tier no
   matter how many other gaps pass?
4. **Minimum evidence:** How many departures must a route-period contain before
   Atlas can claim sustained frequency?
5. **Display:** How should Atlas describe sustained frequency and any active
   exceptions without overstating what the data proves?

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

The former middle-gap rule was unbounded: it allowed at least two near misses,
then allowed more as the number of gaps grew (`max(2, floor(30% of gaps))`).
That 30% value was implementation behaviour, not an approved product decision.
The production policy now uses a tier-specific percentage, a zero minimum floor,
and a cap of three near misses: 10% for 5–15-minute tiers and 5% for
20–60-minute tiers.

For this Q2 follow-up, the gap-size rule was held constant: a near miss is a
gap above the target but no longer than `T + max(5 minutes, 15% of T)`. The
question was only how many such internal near misses may be allowed. A
percentage is calculated from the number of internal gaps, rounded down. A
floor guarantees a minimum number of allowances; a cap prevents the allowance
from growing indefinitely.

The full Q2 follow-up census covered 368,544 observations with at least three
departures. Each candidate was compared with the same strict reference: zero
internal exceptions, the current gap-size grace, the current hard boundary,
and a three-departure minimum. The results below are therefore changes from
strict service, not claims about a final production policy.

### Tier-specific percentage tests

These candidates apply the listed percentage only to the named tier, with a
zero floor and a cap of three. The values show how many observations would
qualify for a faster tier than the strict reference:

| Target tier | 5% | 10% | 15% | 20% | 25% |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 5 minutes | 34 | 49 | 56 | 68 | 70 |
| 8 minutes | 73 | 135 | 162 | 171 | 174 |
| 10 minutes | 1,046 | 1,257 | 1,355 | 1,519 | 1,612 |
| 15 minutes | 2,393 | 2,867 | 3,102 | 3,432 | 3,704 |
| 20 minutes | 3,015 | 3,917 | 4,168 | 4,482 | 4,664 |
| 30 minutes | 6,715 | 10,274 | 11,779 | 12,544 | 13,076 |
| 60 minutes | 4,350 | 11,768 | 14,408 | 16,919 | 18,556 |

The impact is not proportional to the number of trips alone. The 60-minute
tier has many more observations affected because its five-minute grace band
can absorb a large number of otherwise disqualifying schedules. The 10-minute
tier is also sensitive: in a three-hour period with roughly 17 internal gaps,
10% permits one near miss when the result is rounded down. A 30-minute period
with roughly five internal gaps gets zero allowances at 10%, unless a floor is
added. This is why a single fixed number does not behave consistently across
tiers.

### Sliding-scale tests

Three complete curves were tested across the published tiers. The curves use
the surface tiers 10, 15, 20, 30, and 60, with the nearest corresponding value
for rail tiers. Each result uses a cap of three:

| Curve from fastest to slowest | Floor 0 | Floor 1 |
| --- | ---: | ---: |
| 20%, 15%, 10%, 5%, 5% | 19,800 | 36,025 |
| 15%, 10%, 10%, 5%, 5% | 19,383 | 35,873 |
| 10%, 10%, 5%, 5%, 5% | 18,351 | 35,115 |

The floor is the major decision, not a small implementation detail. A floor of
one more than doubles the number of changes in these tests because even a
short period receives one exception. That can make a three-trip period with
one near miss look sustained, which is difficult to defend. A floor of zero
lets the percentage respond to the amount of evidence available.

The cap also matters. For the most conservative curve, `10%, 10%, 5%, 5%, 5%`
changed 18,351 observations with a cap of three, compared with 20,482 with no
cap and 19,516 with a cap of five. The cap prevents long schedules from
accumulating a large number of individually small exceptions.

The candidate taken into focused review was therefore the bounded,
sliding-scale shape `10%, 10%, 5%, 5%, 5%`, with no minimum floor and a cap of
three internal near misses. This is the most conservative complete curve
tested that still scales the allowance with the number of gaps.

## Weekday rollup bias audit

The weekday rollup was audited separately from the frequency-tier policy. The
question was whether combining Monday through Friday departure times could make
the displayed cadence look faster than any real weekday schedule.

The corrected full census covered:

- 1,160 GTFS archives;
- 62 archives that could not be opened or parsed;
- 897 feeds with usable departure rows;
- 430,867 daily route-pattern observations; and
- 66,655 weekday route-pattern groups containing at least two actual weekdays.

The merged weekday departure list produced a faster median than the daily
results in 1,726 groups (2.59%). In 1,349 groups (2.02%), the displayed
median was at least five minutes faster. The effect was concentrated in
surface transit: 1,707 of the faster-median cases were surface groups and 19
were rail groups.

This did not mean the current tier rollup was making the same claim: tier
qualification already uses the worst actual weekday. The confirmed issue was
the displayed cadence and related statistics, which were still being computed
from a Monday–Friday union in the non-rail path.

The production correction selects a representative actual weekday instead.
The representative day is the one whose departure count is closest to the
median count across the available weekdays. The tier remains the worst actual
weekday, and missing weekdays continue to generate a warning. This keeps the
published statistics internally coherent: every displayed departure belongs
to a schedule that actually ran on one day.

The affected cases are not primarily once-a-day community routes. Of the 820
groups that would receive a faster tier if the merged timetable were used, 573
(69.9%) have at least 16 departures per actual weekday, while 88 (10.7%) have
four or fewer. The displayed-median effect is broader: 450 of its 1,726 cases
(26.1%) have four or fewer departures per weekday. Groups with only one
departure cannot produce a daily headway and are not included in this specific
comparison; the sparse cases here have at least two departures on at least two
actual weekdays.

### Weekday tier variation and route-card notice

The follow-up census also compared the actual weekday results before deciding
whether the route card needed a notice:

- 794 groups (1.19%) had different frequency tiers on different weekdays;
- 784 of those groups were surface transit and 10 were rail;
- 1,309 groups (1.96%) had weekday median headways at least five minutes
  apart; and
- 522 groups (0.78%) had a weekday median headway at least twice another
  weekday's median.

The notice is therefore tied to the clearest product-relevant condition:
different actual weekdays produce different tiers. The route card says that
weekday schedules vary and that the displayed tier reflects the slowest
weekday. The side panel explains that Atlas checks each weekday separately and
does not combine departures from different days.

### Q2 representative-example review

The candidate was reviewed against 40 full-census upgrades: 10 resulting in
each of the 10-, 20-, 30-, and 60-minute tiers. The sample was stratified by
mode, day type, direction, and trip-count bucket where the census provided
enough examples.

| Resulting tier | Examples reviewed | Assessment |
| ---: | ---: | --- |
| 10 minutes | 10 | All looked like sustained 10-minute service with only small, isolated deviations. |
| 20 minutes | 10 | All looked like sustained 20-minute service with one or two small deviations. |
| 30 minutes | 10 | All looked like sustained 30-minute service with one small deviation. |
| 60 minutes | 10 | Eight looked like hourly service with one small deviation. Two had mostly 15-minute service interrupted by one 63-minute gap, and correctly fell back to 60 because the faster tier was broken. |

The two F21 examples are not false 15-minute classifications. The 63-minute
gap causes the faster tier to fail; the candidate then reports the fastest
slower tier that survives. This is the intended fallback behaviour, and the
review did not find a candidate that incorrectly continued to claim the faster
tier after a major interruption.

The representative-example review therefore approves this Q2 candidate for a
separate production implementation. This approval does not itself change
production logic or published data. The implementation should retain the
current gap-size grace, hard-gap boundary, edge treatment, and the ordinary
three-departure minimum, with four departures required after edge trimming.

For historical comparison, the earlier fixed and 30% candidate results were:

| Internal allowance | Changed observations | Faster | Slower |
| --- | ---: | ---: | ---: |
| No internal exceptions | 73,496 | 0 | 73,496 |
| One exception | 32,165 | 0 | 32,165 |
| Two exceptions | 16,935 | 0 | 16,935 |
| Three exceptions | 12,869 | 1,943 | 10,926 |
| 30%, capped at three | 10,926 | 0 | 10,926 |
| 30%, capped at five | 5,854 | 0 | 5,854 |

Those historical results should not be read as approval of the 30% rule or of
the previous fixed-two recommendation. The Q2 decision is now approved for
implementation using the reviewed sliding-scale candidate above.

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
large gaps. The edge allowance therefore needs an explicit absolute ceiling.
The edge is still identified separately from a middle-of-service gap, but a
qualifying edge consumes one slot in the same bounded exception count so the
allowances cannot stack silently.

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
frequency tier. This is why the percentage-only candidates were not selected.

Adding a tier-plus-ten-minute ceiling produced these results:

| Booster beyond normal grace | Maximum | Changed observations |
| ---: | ---: | ---: |
| 10% of tier | tier + 10 minutes | 1,686 |
| 15% of tier | tier + 10 minutes | 2,074 |
| 20% of tier | tier + 10 minutes | 2,855 |
| 25% of tier | tier + 10 minutes | 3,620 |
| 20% of tier | tier + 15 minutes | 3,659 |

Every change in these bounded tests was an upgrade. The results do not identify
a uniquely correct percentage, and they show that an uncapped percentage is
not safe: the observed edge-gap tail includes very large gaps. The current
branch candidate is the simpler boundary: each genuine edge gap may be
accepted only when it is no more than `T + 10 minutes` in total. Both the
opening and closing edge may use the allowance because they are separate
service boundaries, not middle-of-service holes. This is not ten minutes
beyond the ordinary grace allowance. The ordinary internal gap rule remains
unchanged, and at least four departures must remain after removing an edge
departure. Ordinary classifications retain the separate three-departure
minimum.

The existing public/Beta “Hide irregular routes” and Beta “Hide limited-service
routes” settings are useful for reviewing the visible consequences of a
candidate. They do not participate in the tier calculation and are not a
substitute for the census.

### Edge-rule comparison matrix

The follow-up simulation compared the edge limits across the full archive
census. The counts below use both genuine edges and show route-periods whose
reported tier changed from the no-edge reference; every change was an upgrade
and no candidate produced a downgrade.

| Edge rule | Changed observations | Difference when both edges are allowed instead of one |
| --- | ---: | ---: |
| Fixed `T + 10` total | 2,948 | 47 |
| Dynamic 10% booster, capped at `T + 10` | 1,561 | 6 |
| Dynamic 15% booster, capped at `T + 10` | 2,080 | 18 |
| Dynamic 20% booster, capped at `T + 10` | 2,185 | 23 |

The candidate with a five-minute minimum booster is equivalent to the fixed
`T + 10` rule at these tiers. The dynamic 10% rule reduces the number of
upgrades substantially, but it rejects the illustrative 10-minute route with
one 20-minute opening gap.

### Qualitative route review

The matrix was followed by a stratified review of 40 actual tier-changing
observations under the fixed `T + 10` candidate and 40 under the dynamic 10%
candidate. The sample covered the 8-, 10-, 15-, 20-, 30-, and 60-minute tiers,
surface and rail where available, and periods with 3–4, 5–6, 7–10, and 11+
departures. It is a review sample, not a replacement for the full census.

| Example | Gaps in the analyzed period | Result | Assessment |
| --- | --- | --- | --- |
| Wellington Metlink route 13, Monday | `20, 20, 20, 20, 20, 30` | 30 → 20 minutes | Good edge case: consistent 20-minute service with one 30-minute closing gap. |
| Brisbane Translink route 736, Monday | `60 × 9, 70` | span → 60 minutes | Good edge case: regular hourly service with one 70-minute edge gap. |
| TransLink Vancouver route 004, weekday | `22, 14, 14, 14, 15` | 30 → 15 minutes | Plausible edge case: one longer opening gap followed by sustained 14–15-minute service. |
| Wellington Metlink route 32x, Monday | `30, 20, 15, 15, 10, 10, 10, 10, 15, 15, 30` | 30 → 20 minutes | Mixed but defensible: both edge gaps are 30 minutes and the interior remains within the existing policy. |
| Adelaide Metro G20X, Monday | `37, 23, 30, 27` | 60 → 30 minutes under dynamic 10% | Needs caution: only five departures and broadly uneven service; this is mainly a minimum-evidence/internal-allowance question. |
| Brisbane Translink route 381, Monday | `18, 22, 37` | 60 → 30 minutes under the earlier candidate | Rejected by the updated rule: only four departures means an edge allowance would leave just three, which is not enough evidence for an edge-based upgrade. |

The review supports allowing both genuine edges under the fixed `T + 10`
ceiling. It does not support an uncapped percentage, and it does not show a
benefit from making the edge amount dynamic: the dynamic 10% version rejects
the intended 10-minute pattern with a single 20-minute opening gap. The sparse
examples are the reason for the stricter edge-specific evidence requirement:
three departures remain sufficient for ordinary classification, but not when
the classification depends on removing an edge departure. A qualifying edge
also consumes one slot in the bounded near-miss allowance.

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

## Minimum evidence

“Short period” was imprecise terminology for this question. The issue is not
only how long the clock window is; it is whether there are enough departures in
the analysed period to show a repeated schedule. The Beta **Hide irregular
routes** setting is a display filter for the resulting irregular classification,
not the rule that determines a frequency tier.

The production classifier currently requires three departures before a
limited-service period can be treated as sustained. The edge-specific rule
requires four departures after trimming an edge. The Q4 audit tested the
minimum against two, four, five, and six departures. Each candidate was
compared with the same frequency rule and the current hard-gap boundary, with
edge allowances disabled so this question was not mixed with the service-edge
decision.

The corrected full-census comparison covered all 430,867 route/day/direction/
pattern observations. The three-departure candidate was used as the reference
for every Q4 comparison; it produced zero changes against itself.

| Minimum departures | Changed observations | Faster | Slower | Affected departure counts |
| ---: | ---: | ---: | ---: | --- |
| 2 | 34,954 | 34,954 | 0 | 2 trips: 34,954 |
| 3 | 0 | 0 | 0 | — |
| 4 | 18,569 | 0 | 18,569 | 3 trips: 18,569 |
| 5 | 29,941 | 0 | 29,941 | 3 trips: 18,569; 4 trips: 11,372 |
| 6 | 37,738 | 0 | 37,738 | 3 trips: 18,569; 4 trips: 11,372; 5 trips: 7,797 |

Allowing two departures is too weak: a single gap can make two trips look like
10-, 15-, 20-, 30-, or 60-minute service. For example, two departures exactly
60 minutes apart would qualify for the 60-minute tier even though there is no
repeated cadence to observe.

Requiring four or more departures is more conservative, but it rejects
repeated patterns that already show a consistent cadence. For example, three
departures with 30-minute gaps meet the 30-minute tier under the existing rule;
requiring four departures would label that period irregular despite both
observed gaps matching the tier exactly.

The Q4 recommendation is therefore to retain **three departures as the minimum
evidence** for ordinary sustained-frequency claims, and require **four
departures after an edge allowance**. This preserves the existing Beta
behaviour for ordinary periods: one- and two-trip periods remain irregular, while three repeated
departures can still represent a real short-window schedule. This is a study
recommendation, not a production change.

## Display

Q5 is a communication decision, not another frequency calculation. The display
should tell people what Atlas can support from the schedule without turning
every processing detail into a route-card warning.

### Recommended labels

| Data state | Recommended display | Explanation when opened |
| --- | --- | --- |
| Finite sustained tier | `about every N min` | The representative scheduled gap in the selected period, without implying exact regularity. |
| Sustained branch range | `about every X–Y min` | The branch has a range of scheduled gaps rather than one exact value. |
| Uneven period with a useful range | Add `longest gap N min` | The longest wait is materially longer than the typical range, so the typical value should not be read as a guarantee. |
| Predictable part-day service (`time-limited`) | Keep the numeric frequency and add a `limited service` label where the period or card needs context | Service operates during only part of the normal window but has a repeated schedule while operating. |
| No finite sustained tier (`infrequent`) | `infrequent` | Atlas could not confirm a sustained finite frequency tier; it should not present a faster numeric cadence as the route's normal service. |
| Exceptional or unsustained pattern (`irregular`) | `irregular service` or `no sustained frequency` | Atlas found too little repeated service or a pattern too uneven to support a sustained frequency claim. |
| Confirmed no departures in the selected period | `no scheduled service` | The route has no scheduled departures in this period. |
| Metric unavailable or not safely computable | `no data for this period` | Atlas does not have enough reliable data to make a claim. This is intentionally different from confirmed no service. |

The route card and related scheduled-service labels now render numeric cadence
as `about every N min` (for example, `about every 7 min`). The code also
contains branch ranges,
longest-gap text, `limited service`, `no scheduled service`, and `no data for
this period` in different surfaces. The study recommendation is to use the
cautious wording consistently and make the underlying distinction explicit:
`time-limited` means a predictable schedule that operates during part of the
window; `irregular` means Atlas cannot confirm sustained frequency. The current
shared “limited” treatment is too ambiguous for those two cases.

### Data-quality and exception notices

Keep these notices separate from the frequency number:

- **Outdated schedule:** keep the existing notice and explain that Atlas kept
  the last successful schedule because the source feed may be out of date.
- **New schedule data:** keep the review notice while Atlas checks the feed.
- **Corrected data:** keep the notice when Atlas filtered or corrected a known
  source problem, with the explanation of what changed.
- **Route data quality:** keep a route-specific warning when geometry or another
  source problem affects interpretation.
- **First/last-trip allowance:** keep the small info icon and side-panel
  explanation. The concise copy should remain: “Atlas added a small allowance
  for the first or last trip of the day.” It must also say that this does not
  apply to gaps in the middle of the day.

Internal near-miss counts and hard-gap checks should remain in the technical
methodology rather than appearing beside every route. They affect whether a
tier qualifies, but exposing the arithmetic on every card would imply a level
of precision the display is not trying to provide.

### Q5 recommendation

Use plain-language state labels on the route card, use cautious `about every`
wording for numeric cadences, distinguish `time-limited` from `irregular`, and
reserve the side panel for explanations about stale, reviewed, corrected, or
edge-allowance data.

## Decision log

- Edge-gap proposal: each true service edge may use one fixed tier-plus-ten-minute
  ceiling, with both edges allowed independently, after the full-census and
  full-pipeline validation.
- Edge accounting: each qualifying edge consumes one slot in the same bounded
  near-miss allowance; two qualifying edges consume two slots. This prevents
  the edge booster from stacking on top of the internal exception budget.
- Internal near-miss policy: use 10% for 5-, 8-, 10-, and 15-minute tiers and
  5% for 20-, 30-, and 60-minute tiers, with a zero minimum floor and a
  three-gap cap. This was approved after the full-census and representative-
  example review.
- Hard-gap policy: recommendation is to retain the existing grace boundary;
  no larger multiplier should be allowed to turn a large internal gap into a
  near miss.
- Minimum evidence: retain three departures for ordinary classifications, but
  require four after an edge allowance so a sparse four-trip period cannot be
  upgraded solely by trimming its first or last gap.
- Display: use `about every N min`, distinguish predictable time-limited
  service from irregular service, and keep processing exceptions in notices or
  the side panel rather than route-card arithmetic.

## Supporting artifacts

- Experiment log: `EXPERIMENT-LOG.md`
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
