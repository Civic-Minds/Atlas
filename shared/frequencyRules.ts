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


/** Rail's own midday window (09:30 to 14:30, minutes after midnight), used by its tier scale and the rail roll-up, and named on the Docs page. */
export const RAIL_TIER_WINDOW = { start: 570, end: 870 } as const;
