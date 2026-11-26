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

/** On time is between these: early at or below `earlyAtOrBelowMin` (negative: ahead), late above `lateAboveMin`. */
export interface OnTimeWindow {
  earlyAtOrBelowMin: number;
  lateAboveMin: number;
  /** Early only when MORE than |earlyAtOrBelowMin| ahead (TTC: ">1 min early", Ryan's words), not at it. */
  earlyStrict?: boolean;
}

/** Atlas's window, kept for every agency that publishes none of its own. */
export const DEFAULT_ON_TIME_WINDOW: OnTimeWindow = { earlyAtOrBelowMin: EARLY_AT_OR_BELOW_MIN, lateAboveMin: LATE_ABOVE_MIN };

/**
 * CIV-2222 (Ryan, 2026-11-24: "I think we do 1 but no Atlas one for now"): an agency's figures use its own published on-time
 * window. TTC: 1 min early to 5 min late (his OK for those two numbers). Add an agency only with its published definition.
 */
export const AGENCY_ON_TIME_WINDOWS: Readonly<Record<string, OnTimeWindow>> = {
  ttc: { earlyAtOrBelowMin: -1, lateAboveMin: 5, earlyStrict: true },
};

/** The window an agency's figures use, and whether it is the agency's own (published) or Atlas's default. */
export function onTimeWindow(slug: string | null | undefined): OnTimeWindow & { published: boolean } {
  const own = slug ? AGENCY_ON_TIME_WINDOWS[slug] : undefined;
  return own ? { ...own, published: true } : { ...DEFAULT_ON_TIME_WINDOW, published: false };
}

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

/**
 * The TTC routes Live analyses: the streetcars and, since CIV-2174, the Ten-Minute Network routes.
 * The one list: the cloud's Studio build reads it (scripts/studio-live-cloud.ts); live-analyze.sh and
 * live-report-refresh.yml keep shell copies, which liveRules.test.ts checks against it.
 */
export const LIVE_TTC_ANALYSED_ROUTES: readonly string[] = [
  // The streetcars.
  '501', '503', '504', '505', '506', '507', '509', '510', '511', '512',
  // CIV-2174 (Ryan, 2026-11-23, "Yes TTC approved"): the TTC's Ten-Minute Network routes, by its rule (10 min or better
  // all day on weekdays) applied to Atlas's schedule.
  '7', '16', '22', '25', '27', '36', '41', '44', '45', '47', '60', '63', '72', '87', '89', '95', '100', '116', '165', '900', '927', '929', '960',
];

/**
 * Two stop ids are one place when they are under this far apart: the Live analysis ranks a stop listed twice in a row
 * once (TTC 501 "Queen St East at Parliament St" then "QUEEN ST. E. AT PARLIAMENT AVE.", 16 m apart), and CIV-2047 takes
 * a trip update's stop for an analysis stop of the same name under it (the two key stops differently, GTFS id vs public
 * stop number, and a name alone repeats across a city).
 */
export const SAME_STOP_M = 30;

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

/**
 * Each Live feed's pace in seconds (CIV-2073, measured 2026-11-21 over 4 min at 5 s polling; docs/operations/LIVE_POLLING.md):
 * the slower of the feed's own refresh and its vehicles' GPS reports, by median; SF 90 s, positions only, inside 511's limit (Ryan, CIV-2074 to revisit). The recorder polls at it, and Live's status
 * pill calls positions late past twice it (CIV-2084). An agency not measured uses LIVE_POLL_SEC.
 */
export const LIVE_FEED_PACE_SEC: Readonly<Record<string, number>> = {
  ttc: 30, yrt: 30, burlington: 30, halifax: 30, edmonton: 30, hamilton: 60, sfmta: 90,
};
/**
 * Agencies the recorder reads vehicle positions only for, no trip updates (CIV-2073, Ryan said "1" twice, knowing their
 * cards then show no delay, destination or next stop): SF, to stay inside 511's ~60 requests an hour at 90 s. Revisit
 * when 511 raises the limit (CIV-2074).
 */
export const LIVE_POSITIONS_ONLY_SLUGS: readonly string[] = ['sfmta'];
/**
 * CIV-2073 step B (Ryan, 2026-11-24): the routes the cloud recorder (atlas.live.v2) keeps for an agency, where they differ
 * from its archive feed's route filter (shared/liveArchiveFeeds.ts). TTC: the routes Live analyses (the streetcars, and the
 * Ten-Minute Network routes once CIV-2174 adds them to LIVE_TTC_ANALYSED_ROUTES), not the whole fleet; with trip updates.
 */
export const LIVE_RECORDER_ROUTE_IDS: Readonly<Record<string, readonly string[]>> = {
  // YRT: every Viva route (CIV-2176), not only the Blue Live shows; route ids from YRT's GTFS routes.txt, 2026-11-24.
  yrt: ['601', '60102', '603', '60301', '605', '607'],
};
/**
 * CIV-2939 option 2 (Ryan, 2026-11-25, "1": keep every TTC route's positions, 60 days like everything else): agencies the
 * cloud recorder keeps whole, every vehicle on a route. Live, the Live report and Studio Live still read only the routes
 * they analyse (LIVE_TTC_ANALYSED_ROUTES), so nothing anyone sees changes.
 */
export const LIVE_RECORDER_ALL_ROUTES: readonly string[] = ['ttc'];
export const livePaceSec = (slug: string): number => LIVE_FEED_PACE_SEC[slug] ?? LIVE_POLL_SEC;
/**
 * CIV-2990 (#1832; Ryan, 2026-11-26, picked "Not on a trip: 622, of which 521 at garages"): a vehicle with no trip is
 * "at a garage" when it stands still (speed under GARAGE_STANDING_SPEED_MS, or no speed reported) with at least
 * GARAGE_MIN_VEHICLES such vehicles, itself included, within GARAGE_RADIUS_M. No garage list: a garage is where parked
 * vehicles gather. Ryan's word-for-word OK on all three numbers, 2026-11-26 (under 1 m/s, groups of 5+, within 100 m;
 * DECISIONS.md, CIV-2990).
 */
export const GARAGE_MIN_VEHICLES = 5;
export const GARAGE_RADIUS_M = 100;
export const GARAGE_STANDING_SPEED_MS = 1;
/** Positions older than this many paces read as late (CIV-2084, Ryan: "within 2× the agency's pace"). */
export const LIVE_STALE_PACES = 2;

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

/**
 * CIV-2919 (Ryan, 2026-11-26, option 1: "Use them as starting values and check later"): the Speed view's minimums. Below any
 * of them a stretch shows no figure ("Not measured"). Starting values: 400 m, 30 trips and 10 per slot are untested prototype
 * guesses and 7 weekdays is Strategy's proposal; they are tested on TTC, HSR and MBTA routes before anything ships.
 */
export const SPEED_MINIMUMS = {
  /** A stretch is consecutive stops merged until it is at least this long (metres along the route shape). */
  stretchM: 400,
  /** Weekdays with at least one recorded trip over the stretch. */
  weekdays: 7,
  /** Recorded weekday trips over the stretch, all times of day together. */
  trips: 30,
  /** Recorded weekday trips over the stretch in one time-of-day slot. */
  tripsPerSlot: 10,
} as const;
