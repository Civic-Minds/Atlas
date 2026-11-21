/**
 * Live's thresholds in one place (rules audit 4.1, move 2): how late and early count, the minimum sample, bunching, how
 * old a position may be, the polling interval and its cache, and the archive buckets. Imports nothing, so the app, the
 * local API, the scripts and the archiver can all read it. The functions that use these stay where they were
 * (shared/liveDelayStatus.ts, shared/bunching.ts, local-api/liveStore.ts), and the old homes re-export.
 */

// ---- Late and early ----

/** A departure this many minutes ahead of schedule or more is early. */
export const EARLY_AT_OR_BELOW_MIN = -1.5;
/**
 * Late is MORE than 5½ min behind, as Live says it (LATE_DEFINITION, LATE_THRESHOLD: "more than 5½ min late"); a delay of
 * exactly 5.5 is on time (CIV-1812 item 7). The analysis files' `lateAtOrAboveMin` field keeps its stored name.
 */
export const LATE_ABOVE_MIN = 5.5;

// ---- Minimum sample ----

/** A stop, stretch, hour or route needs at least this many departures, gaps or trips before Live states a figure for it. */
export const LIVE_MIN_SAMPLE = 30;

// ---- Minimum days (CIV-1812 item 9) ----
// Five rules, each its own meaning and value; they are not one number set five ways, so each keeps its own name.

/** A figure resting on fewer good days than this reads as thin: dimmed, with the tile's hover text (Late by hour). */
export const LIVE_MIN_GOOD_DAYS = 3;
/** A measure needs daily values on at least this many days for a day-to-day spread; with fewer, FIXED_NOISE stands in. */
export const LIVE_MIN_SPREAD_DAYS = 3;
/** Each of two weeks needs this many healthy days before they are compared. */
export const LIVE_MIN_HEALTHY_DAYS_PER_WEEK = 4;
/**
 * A route gets Live figures (the hosted MCP's private files, CIV-1860) once its latest week has this many good days.
 * Reuses the week-comparison bar until Live sets its own rule for this.
 */
export const LIVE_MIN_DAYS_TO_SHOW = LIVE_MIN_HEALTHY_DAYS_PER_WEEK;
/** A day is compared with the median of at least this many other days of its own type; with fewer, with every other day. */
export const LIVE_MIN_SAME_TYPE_DAYS = 2;
/** A stop, stretch or stop pair is shown only with evidence from at least this many days. */
export const LIVE_MIN_EVIDENCE_DAYS = 5;
/**
 * An agency joins Studio's Live page once one of its routes has this many days of recordings (Ryan, CIV-1828: "How about
 * 7 days but since this is internal we could make it less"). On the dev server, which is internal, the shortest section
 * minimum (LIVE_MIN_GOOD_DAYS) is used instead, so a new agency shows sooner: liveStudioMinDays.
 */
export const LIVE_STUDIO_MIN_RECORDED_DAYS = 7;
/** Live's figures cover the last this many service days, bad-recording days left out and named ("Rolling 7 days only", docs/product/DECISIONS.md; Studio's stop pairs too, CIV-1828). */
export const LIVE_WINDOW_DAYS = 7;

// ---- Bunching (shared/bunching.ts) ----

/** A gap under this many seconds is bunched. */
export const BUNCHED_GAP_SEC = 120;
/** A gap over this many times the scheduled gap is too long. */
export const GAPPED_FACTOR = 2;
/** A rise counts as a step (bunching "forms" there) when the bad share jumps by at least this much (0.10 = 10 points)... */
export const RISE = 0.1;
/** ...and the stops after it stay up: each is at least half the rise above where it started... */
export const STAYS_UP_SHARE = 0.5;
/** ...for at least the next 3 stops or about 1 km, whichever is longer. Recovering later (terminal regulation, short turns) does not undo where it formed. */
export const STAYS_UP_STOPS = 3;
export const STAYS_UP_M = 1000;
/** The baseline is the mean bad share over this many first stops with enough gaps. */
export const BASELINE_STOPS = 3;
/** Smaller climbs than RISE that add up to at least this much over the route are called gradual. */
export const GRADUAL_CLIMB = 0.05;

// ---- How old a position may be ----

/** Positions older than this aren't used for "Right now". */
export const LIVE_STALE_SEC = 180;
/** "Right now" names a time only once the vehicles' newest report is older than this: "Right now · last updated 2:04 PM" (CIV-1034). */
export const RIGHT_NOW_STALE_SEC = 2 * 60;
/** A feed's age, in seconds, at the top of each status: fresh up to 90 s, degraded to 5 min, stale to 15 min, then unavailable. */
export const FEED_AGE_LIMITS_SEC = { fresh: 90, degraded: 300, stale: 900 } as const;

// ---- Polling ----

/** The Live map asks for vehicles this often, and the vehicles answer is cached at the edge for as long. */
export const LIVE_POLL_SEC = 15;

// ---- Archive ----

/** The R2 bucket every archived agency is recorded to (CIV-1906: one Live bucket, kept 60 days). */
export const DEFAULT_LIVE_ARCHIVE_BUCKET = 'atlas-live';
/**
 * Agencies archived to a bucket of their own (each archiver's wrangler file binds the same one: liveRules.test.ts). None
 * since CIV-1906 moved Kingston into atlas-live; kept so a future agency that needs its own bucket says so in one place.
 */
export const LIVE_ARCHIVE_BUCKET_BY_SLUG: Readonly<Record<string, string>> = {};

/**
 * The cut-offs a planner may set for themselves (CIV-1869), in the units they set them. Steps match the counts Live
 * keeps (shared/liveCutoffs.ts), so every figure is exact. Ranges settled by the manager (2026-11-18), not by Ryan.
 */
export const CUTOFF_LIMITS = {
  lateAfterMin: { min: 0, max: 30, step: 0.5 },
  earlyBeforeMin: { min: 0, max: 10, step: 0.5 },
  bunchedWithinMin: { min: 0.5, max: 10, step: 0.5 },
  gappedFactor: { min: 1, max: 6, step: 0.25 },
} as const;
