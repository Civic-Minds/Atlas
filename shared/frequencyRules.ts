/**
 * The frequency test's near-miss settings (docs/product/FREQUENCY_RULES.md, table A). The pipeline grades routes with
 * these, and the Docs page states them from the same constants, so the page can't drift from the rule (CIV-1612).
 */

/** A gap within T + max(GRACE_MINUTES, T × GRACE_PERCENT) of a tier T is a near miss, not a failure. */
export const GRACE_MINUTES = 5;
export const GRACE_PERCENT = 0.15;
/** The near-miss allowance for a tier T: "max(5 min, 15% of T)", rounded to whole minutes. */
export const nearMissGrace = (tier: number): number => Math.max(GRACE_MINUTES, Math.round(tier * GRACE_PERCENT));

/** The share of a sample's gaps that may be near misses: 10% on the 5–15 min tiers, 5% on the 20–60 min tiers. */
export const VIOLATION_PERCENT = 0.05;
export const VIOLATION_PERCENT_BY_TIER: Readonly<Record<number, number>> = { 5: 0.10, 8: 0.10, 10: 0.10, 15: 0.10, 20: 0.05, 30: 0.05, 60: 0.05 };
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

/** Rail's tiers: the surface tiers plus 5 and 8 min (pipeline/defaults.ts modeTierOverrides). */
export const RAIL_TIER_MAXES = [5, 8, 10, 15, 30, 60];

/** Rail's own midday window (09:30 to 14:30, minutes after midnight), used by its tier scale and the rail roll-up, and named on the Docs page. */
export const RAIL_TIER_WINDOW = { start: 570, end: 870 } as const;
