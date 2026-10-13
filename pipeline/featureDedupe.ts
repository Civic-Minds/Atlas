/**
 * Feature dedupe: which pattern draws a route line (#596, #716, #740, #772).
 *
 * Phase 2 produces one result per (route, direction, day, headsign, shape). The map draws one
 * line per (route group, direction, day, headsign, branch) slot, so the results of a slot
 * compete for it. The rules below decide, in order, whether a candidate replaces the pattern
 * already holding the slot; each is named after the case that introduced it. They are a pure
 * function of the two patterns' summaries, so the order and the exceptions are in one place.
 */
import { MIN_ALL_DAY_TERMINAL_DEPARTURES } from './headway-utils.js';
import type { DayName } from '../types/gtfs.js';

/**
 * #740: a thin no-daytime result (fewer than MIN_ALL_DAY_TERMINAL_DEPARTURES departures, none
 * 09:00-19:00) only loses the drawn line to a daytime sibling with at least this many unique
 * departures, twice the thin cutoff. Set from the 2026-10-12 catalog scan of the 185 decisions
 * the rule changed: every CapMetro per-trip-shape block that regressed had a daytime sibling of
 * 5 or fewer departures, the intended cases 8 or more (TTC 97A 19, 100 31, 73B 44, 96B 51,
 * 129B 72, 504A 124; NJT 161 26-34).
 */
export const MIN_THIN_REPLACING_DEPARTURES = 8;

/** What dedupe knows about a pattern, candidate or incumbent. */
export interface DedupePattern {
  /** Drawn as a LineString (a route shape), not a mapless Point. */
  hasShape: boolean;
  /** The plain-median midday headway dedupe compares (#772), null when the pattern is not rated. */
  dedupeHeadway: number | null;
  /** The displayed headway (typical reading), null when not rated. */
  headway: number | null;
  /** Unique departure times at the pattern's terminal sample. */
  departures: number;
  /** Any departure 09:00-19:00. */
  hasDaytime: boolean;
  /** Weekday only: the pattern runs on the slot's representative weekday. */
  runsOnRepDay: boolean;
  /** Weekday only: the pattern has at least half of the slot's departures on that weekday. */
  carriesRepDay: boolean;
}

/** #740: no daytime departures and fewer than the all-day sample minimum. */
export function isThinNoDaytime(pattern: Pick<DedupePattern, 'hasDaytime' | 'departures'>): boolean {
  return !pattern.hasDaytime && pattern.departures < MIN_ALL_DAY_TERMINAL_DEPARTURES;
}

export type DedupeDecision = 'keep' | 'replace';

/**
 * Whether `candidate` takes the slot from `incumbent` (undefined: the slot is empty).
 * `repWeekday` is the slot's representative weekday for Weekday slots, undefined otherwise.
 */
export function decideDedupe(
  incumbent: DedupePattern | undefined,
  candidate: DedupePattern,
  repWeekday: DayName | undefined,
): DedupeDecision {
  if (!incumbent) return 'replace';

  // Step 1 (#596): a drawn line always beats a mapless point for the same slot, whichever is
  // more frequent and whichever arrives first, so reprocessing never turns a line into a point.
  if (incumbent.hasShape && !candidate.hasShape) return 'keep';
  const replacesMaplessWithShape = !incumbent.hasShape && candidate.hasShape;

  // Step 2 (#716): between two drawn lines on a Weekday slot, the one that carries the
  // representative weekday holds against one that does not run on it, and a pattern carrying
  // that day takes the slot from one that does not run on it (cata-state-college VE Campus
  // drew the Friday-only shape although the route's typical weekday is Mon-Thu). Every other
  // case falls through to the headway rule.
  const bothDrawn = incumbent.hasShape && candidate.hasShape && repWeekday != null;
  if (bothDrawn && incumbent.carriesRepDay && !candidate.runsOnRepDay) return 'keep';
  const prefersRepDayShape = bothDrawn && !incumbent.runsOnRepDay && candidate.carriesRepDay;

  // Step 3 (#740): a thin result with no daytime service never holds the drawn line against a
  // sibling with daytime service under the same destination (TTC 100 via Linkwood's 3 trips
  // before 06:30 scored their own median, 15, against the 31-trip peak shape's 18). The daytime
  // sibling must be a real sample (MIN_THIN_REPLACING_DEPARTURES): in a feed that gives every
  // 3-5 trip block its own shape (CapMetro, #737) every block is thin-sized and the thin-shape
  // rescue's pooled headline is the right one, so those feeds keep the headway rule.
  const candidateIsThin = isThinNoDaytime(candidate);
  const incumbentIsSample = incumbent.departures >= MIN_THIN_REPLACING_DEPARTURES;
  if (incumbent.hasShape && candidate.hasShape && candidateIsThin && incumbent.hasDaytime && incumbentIsSample) return 'keep';
  const daytimeReplacesThin = isThinNoDaytime(incumbent) && candidate.hasDaytime && candidate.headway != null
    && candidate.departures >= MIN_THIN_REPLACING_DEPARTURES;

  // Step 4 (#772): otherwise the slot goes to the better plain-median headway. A span result
  // (null) never beats a rated one, and the incumbent keeps an equal headway; the plain median
  // decides so that reading alternating gaps honestly never swaps which shape is drawn.
  if (!replacesMaplessWithShape && !prefersRepDayShape && !daytimeReplacesThin
    && (candidate.dedupeHeadway == null
      || (incumbent.dedupeHeadway != null && incumbent.dedupeHeadway <= candidate.dedupeHeadway))) return 'keep';
  return 'replace';
}
