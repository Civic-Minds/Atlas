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
export const SURFACE_TIER_MAXES: number[] = [10, 15, 20, 30, 60];

/** INTERNAL: rail grades on two extra steps below the surface tiers, turn-up-and-go service. */
const RAIL_ONLY_TIER_MAXES = [5, 8];
/** INTERNAL: surface tiers rail's scale leaves out. Rail has no 20 today; whether it should is Ryan's open call. */
const RAIL_SKIPPED_TIER_MAXES = [20];
/** INTERNAL: rail's tiers, 5-8-10-15-30-60 (pipeline/defaults.ts modeTierOverrides). */
export const RAIL_TIER_MAXES: number[] = [...RAIL_ONLY_TIER_MAXES, ...SURFACE_TIER_MAXES.filter(t => !RAIL_SKIPPED_TIER_MAXES.includes(t))];

/** INTERNAL: the grading scale for each mode category (pipeline/defaults.ts getModeCategory). */
export const MODE_TIER_SCALES: Readonly<Record<'surface' | 'rail', readonly number[]>> = { surface: SURFACE_TIER_MAXES, rail: RAIL_TIER_MAXES };

/** INTERNAL: every tier any scale uses, fastest first: the release gate, TIER_RANK, the near-miss shares, audits. */
export const ALL_TIER_MAXES: number[] = [...new Set([...SURFACE_TIER_MAXES, ...RAIL_TIER_MAXES])].sort((a, b) => a - b);

/** INTERNAL: short tier names in pipeline reports and the criteria editor (getTierLabel). Riders see headwayTierLabel. */
export const TIER_LABELS: Readonly<Record<number, string>> = {
  5: 'Rapid', 8: 'Freq++', 10: 'Freq+', 15: 'Freq', 20: 'Good', 30: 'Basic', 60: 'Infreq',
};

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
  ALL_TIER_MAXES.map(t => [t, t <= FREQUENT_SHARE_TIER_MAX ? FREQUENT_VIOLATION_PERCENT : VIOLATION_PERCENT]),
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
