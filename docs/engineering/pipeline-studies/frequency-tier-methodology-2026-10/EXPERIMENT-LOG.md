# Frequency-tier experiment log

This is the standardized record for the frequency-methodology work. The full
evidence, tables, and examples remain in [`INDEX.md`](./INDEX.md); this file
records the decision trail in a consistent format.

## Retroactive records

### FREQ-001 — Weekday rollup bias

- **Status:** decided
- **Hypothesis:** Combining Monday–Friday departures can create a schedule
  that never ran on any real day.
- **Comparison:** The merged weekday timetable versus a representative actual
  weekday, with the slowest actual weekday used for tier qualification.
- **Scope:** 1,160 archives; 430,867 daily route-pattern observations;
  66,655 weekday groups with at least two actual weekdays.
- **Result:** 1,726 groups had a faster merged median; 1,349 were at least
  five minutes faster.
- **Decision:** Evaluate weekdays individually and choose a real weekday for
  displayed summaries.
- **Implementation:** `f80bad2a`, `4324636a`.
- **Evidence:** `INDEX.md` § Weekday rollup bias audit.

### FREQ-002 — Internal near-miss allowance

- **Status:** decided
- **Hypothesis:** A tier-specific bounded percentage can preserve ordinary
  schedule variation without retaining the unapproved 30% behaviour.
- **Comparison:** Zero, fixed-count, percentage, sliding-scale, floor, and
  cap candidates against a strict no-exception reference.
- **Scope:** 368,544 observations with at least three departures, across the
  complete local census.
- **Result:** A percentage floor inflated short-period upgrades; an uncapped
  percentage allowed too many exceptions on long periods.
- **Decision:** Use 10% for 5–15-minute tiers and 5% for 20–60-minute tiers,
  with no minimum floor and a three-gap cap.
- **Implementation:** `f72f5408`, `3122cbf`.
- **Evidence:** `INDEX.md` § Results, Tier-specific percentage tests, and
  Sliding-scale tests.

### FREQ-003 — Service-edge allowance

- **Status:** decided
- **Hypothesis:** A genuine opening or closing gap can receive a bounded
  allowance without weakening the internal-gap check.
- **Comparison:** One edge versus both edges; fixed and dynamic ceilings;
  sparse-period safeguards; then full downstream artifact regression.
- **Scope:** Full local census plus 209 affected archives processed end to
  end.
- **Result:** The fixed `T + 10 minutes` ceiling was the clearest candidate.
  Requiring four departures after an edge allowance removed the sparse
  four-trip false-positive found in downstream review. The corrected
  regression had 0 errors, geometry changes, route-set changes, and invariant
  failures.
- **Decision:** Allow genuine opening and closing edges independently, up to
  `T + 10 minutes`, with four departures remaining after edge use.
- **Implementation:** `66a7cbd9`, `5f4494fc`, `0afcba10`.
- **Evidence:** `INDEX.md` § Edge-gap booster follow-up and the archive
  regression output recorded during the implementation.
- **Open accounting question:** Whether a qualifying edge gap should also
  consume one internal near-miss allowance. This is FREQ-006 below.

### FREQ-004 — Hard internal gaps

- **Status:** decided
- **Hypothesis:** A larger hard-gap multiplier might preserve useful tiers
  without making an uneven route appear frequent.
- **Comparison:** Existing boundary versus 1.25×, 1.5×, 1.75×, and 2×
  target thresholds.
- **Scope:** 332,239 eligible periods, with edge allowances disabled.
- **Result:** Wider boundaries produced faster classifications despite large
  internal holes.
- **Decision:** Keep the existing hard boundary.
- **Implementation:** `d4a56105` study record; retained in the reviewed
  candidate policy `f72f5408`.
- **Evidence:** `INDEX.md` § Hard-gap follow-up.

### FREQ-005 — Minimum evidence

- **Status:** decided
- **Hypothesis:** Two departures may be too little evidence for a sustained
  frequency claim; higher thresholds may reject legitimate short periods.
- **Comparison:** Minimums of two, three, four, five, and six departures.
- **Scope:** All 430,867 route/day/direction/pattern observations, with edge
  allowances disabled for the direct comparison.
- **Result:** Two departures produced 34,954 faster classifications. Four or
  more rejected consistent three-departure patterns.
- **Decision:** Keep three departures for ordinary classification; require
  four departures after an edge allowance is used.
- **Implementation:** `ff4aad6c` study record; final guard `5f4494fc`.
- **Evidence:** `INDEX.md` § Minimum evidence.

## FREQ-006 — Does an edge gap consume an internal allowance?

- **Status:** approved and implemented
- **Question:** Should a first or last gap that qualifies for the edge booster
  also use one of the internal near-miss exceptions?
- **Reference:** The current candidate treats the edge gap separately and
  applies the internal allowance only to the remaining middle gaps.
- **Candidate:** The edge gap consumes one exception in the same percentage
  allowance and three-gap cap. The edge gap is included in the allowance count
  while the remaining gaps are still checked against the same hard boundary.
- **Scope:** Complete local GTFS archive census, route-period unit, opening,
  closing, and both-edge cases.
- **Metrics:** Changed observations, upgrades, downgrades, affected tier,
  number of internal exceptions, and representative schedules with one edge
  gap plus middle near misses.
- **Command:** `npx tsx scripts/audit-edge-gap-impact.ts --edge-count-only`
- **Coverage:** 1,160 archives; 1,015 feeds with usable departure rows;
  332,239 route-period observations; 0 baseline mismatches.
- **Result:** With the edge gap kept separate, both-edge treatment changed
  2,336 observations, all upgrades. When each qualifying edge consumed one
  internal allowance, it changed 2,228 observations, all upgrades. The
  count-included version therefore removed 108 upgrades and caused no
  downgrades.
- **Recommendation:** Count a qualifying edge gap against the same bounded
  exception allowance. This prevents the edge booster and internal allowance
  from stacking silently.
- **Example review:** The stratified sample run covered opening, closing, and
  both-edge cases across sparse and longer periods. Stable qualifying examples
  included Wellington route 13 and 32x and Brisbane routes 361 and 603; the
  count-included rule preserved these regular interior patterns while removing
  some upgrades that depended on stacking allowances.
- **Decision:** Approved 2026-10-06. The edge gap counts against the bounded
  allowance, and the full downstream regression passed before final commit.
- **Implementation:** `0afcba10`.
