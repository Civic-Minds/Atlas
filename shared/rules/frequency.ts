/**
 * The one home for every frequency scale and the frequency test's settings (docs/product/FREQUENCY_RULES.md, "Where the
 * scales live"). Ryan, 2026-11-17: "we have some internally frequencies and some externally which is fine but like we
 * need to keep this info centralized". Each scale says whether riders see it (SHOWN) or only the pipeline grades with it
 * (INTERNAL); everything else derives from these, and a guard test (frequencyScales.test.ts) fails on a hand-typed list.
 * The pipeline grades routes with the near-miss settings below, and the Docs page states them from the same constants,
 * so the page can't drift from the rule (CIV-1612).
 */

// ---- Scales ----

/** SHOWN: the map's tiers in minutes (line colours, legend, filter), fastest first; "Infrequent" is past the last. */
export const PUBLIC_TIER_MAXES: number[] = [10, 15, 20, 30, 60];

/**
 * CIV-1813. Ryan, 2026-11-17: "why the fuck are there any separate freqeucnies between buses and rail", then "like we
 * can have 5 mins or 8 mins or 12 mins or whatever and not expose it to th epublic and put it under the next highest
 * one if we want", then "I do not know why I am repeating myself when I ask why there are any separate frequency
 * bands between modes". So there is ONE grading scale, the same for every mode (bus, rail, streetcar, ferry): the
 * public grades plus finer INTERNAL grades, 5 and 8, that riders see as 10 (publicTierOf). No mode has a list of its
 * own; a guard (frequencyScales.test.ts) fails if one appears. Until now rail graded on 5-8-10-15-30-60 (no 20, from
 * 75c2d8422, never approved) and buses on 10-60.
 */
/** INTERNAL: the finer grades under the fastest public grade; publicly both count as 10. */
const FINER_TIER_MAXES = [5, 8];
/** INTERNAL: the one grading scale, every mode: the release gate, TIER_RANK, the near-miss shares, audits. */
export const TIER_MAXES: number[] = [...FINER_TIER_MAXES, ...PUBLIC_TIER_MAXES];

/** A headway's grade on a scale: the first grade at or above it, or null past the last (Infrequent). */
export function headwayGradeOn(headway: number, tiers: readonly number[]): number | null {
  return tiers.find(t => headway <= t) ?? null;
}

/** The public grade a tier counts as: the next public grade at or above it (5 and 8 count as 10). */
export function publicTierOf(tier: number): number | null {
  return PUBLIC_TIER_MAXES.find(t => tier <= t) ?? null;
}

// ---- Near misses ----

/** A gap within T + max(GRACE_MINUTES, T × GRACE_PERCENT) of a tier T is a near miss, not a failure. */
export const GRACE_MINUTES = 5;
export const GRACE_PERCENT = 0.15;
/** The near-miss allowance for a tier T: "max(5 min, 15% of T)", rounded to whole minutes. */
export const nearMissGrace = (tier: number): number => Math.max(GRACE_MINUTES, Math.round(tier * GRACE_PERCENT));

/** The share of a sample's gaps that may be near misses: 10% on the 5–15 min tiers, 5% on the 20–60 min tiers. */
export const VIOLATION_PERCENT = 0.05;
/** INTERNAL: the tiers at or under this many minutes take the frequent share (10%); the rest take VIOLATION_PERCENT. */
const FREQUENT_SHARE_TIER_MAX = 15;
const FREQUENT_VIOLATION_PERCENT = 0.10;
export const VIOLATION_PERCENT_BY_TIER: Readonly<Record<number, number>> = Object.fromEntries(
  TIER_MAXES.map(t => [t, t <= FREQUENT_SHARE_TIER_MAX ? FREQUENT_VIOLATION_PERCENT : VIOLATION_PERCENT]),
);
/** Never more near misses than this, whatever the share allows. */
export const MAX_NEAR_MISSES = 3;

/**
 * A sample with at least this many gaps may always carry one gap inside the grace. The
 * allowance is a share of the gaps (violationPercent, 5% on the 20-60 tiers), floor-rounded, so
 * an hourly line read over a 12-hour weekend window (12 gaps) or a 16-hour weekday (16 gaps)
 * allowed none: one 61-minute gap failed it, at its origin and at every stop downstream where
 * running time drifts a minute (wmata P72 Saturday, ttc 79, 7,088 of 60,628 catalog lines graded
 * stop by stop). Eight gaps is nine departures over at least eight hours at the hourly tier, a
 * whole-day sample, and one gap in eight (12.5%) is in line with the 10% the frequent tiers
 * already allow; under eight a single long gap is a seventh of the day or more and still fails.
 */
export const GRACE_FLOOR_MIN_GAPS = 8;

/**
 * The maximum total gap allowed for each true service-edge exception.
 *
 * This is deliberately applied only to the first or last departure in the
 * raw service list. A gap created by the analysis window is not an edge of
 * the service and cannot use this allowance.
 */
export const EDGE_GAP_ALLOWANCE_MINUTES = 10;


/** CIV-238: the bit a public grade has in a route's edge-wait mask (pipeline/edgeWaits.ts), or null for any other number. */
export function edgeWaitBit(grade: number): number | null {
  const i = PUBLIC_TIER_MAXES.indexOf(grade);
  return i < 0 ? null : 2 ** i;
}

/** #720: three repeated departures are the minimum evidence for a schedule; one or two trips are one-off. */
export const MIN_SCHEDULE_DEPARTURES = 3;

/**
 * A pooled value is published only when no gap inside its window exceeds this times the mean
 * gap. Two 30-minute branches 3 minutes apart (gaps 3, 27: 1.8 times the mean) or 5 apart (5,
 * 25: 1.67) are bunched, not one service; an hourly variant over a half-hourly base (15, 15, 30)
 * is one service, and its 30 is 1.5 times the mean, more where a window edge cuts the list.
 */
export const POOLED_MAX_GAP_RATIO = 1.75;
/**
 * On a dense pooled service the ratios bite on a single held bus: ttc 52 westbound at midday,
 * four branches every 20 merged to every 5 over 73 departures, has one 9-10 minute gap at
 * 14:31 from stop 26 on (running-time drift), and 1.6 times 5 is 8, so the stop published
 * nothing and read its own 20, a 14-stop hole in the Lawrence stretch. Each ratio allows at
 * least this many minutes over its base (the mean, the value), the tier grader's grace, so the
 * ratios only decide on services around 8 minutes and slower, where a 1.6x gap is a real
 * alternation.
 */
export const POOLED_MAX_GAP_GRACE_MINUTES = 5;
/**
 * CIV-2976 F6: the period range (computePeriodHeadwayRanges) leaves out one exceptional hole: its largest gap, when that is at
 * least RANGE_HOLE_MIN_EXTRA_MINUTES longer than the next largest and at least RANGE_HOLE_MIN_RATIO times it. Named here from
 * the numbers the function already used; not yet shared with typicalOfGaps' own long-gap rule.
 */
export const RANGE_HOLE_MIN_EXTRA_MINUTES = 10;
export const RANGE_HOLE_MIN_RATIO = 1.6;
/**
 * CIV-2232 (Ryan, 2026-11-24, "1" to "Need at least 4 trips in the period to show a number; 2–3 trips read Irregular"): a route
 * card row read from its own trips shows a number only with at least this many of them in the period. Card wording only.
 */
export const MIN_CARD_ROW_DEPARTURES = 4;
/** CIV-1411: a slow start's steady run must cover at least this many departures (#571: 4 after an allowance). */
export const SLOW_START_MIN_DEPARTURES = 4;
/** CIV-1411: no gap in a steady run is over this many times its typical gap. */
export const SLOW_START_STEADY_RATIO = 1.5;
/**
 * #1239 (Ryan, 2026-10-31): a gap goes into a row's words ("every 6 min, with a 25 min gap") only when it is at least this
 * many times the row's usual wait. "every 63 min, with a 66 min gap" (AC Transit 281 AM) isn't worth mentioning.
 */
export const ROW_GAP_WORDS_RATIO = 1.5;

/**
 * The widest range a route card row or list shows by itself: its slow end at most this many times its fast end (CIV-1143
 * rule B, Ryan 2026-10-30; TTC 102 PM: 7 against 30 reads "every 30 min"). CIV-2909 (Ryan, 2026-11-26, "No cap"): a list
 * shows a wider range when its slow line gets its own number (3 or more evenly spaced trips, rule D); a slow end that is
 * the shared stretch keeps this cap.
 */
export const RANGE_MAX_RATIO = 4;
