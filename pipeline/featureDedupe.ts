/**
 * Feature dedupe: which pattern draws a route line (#596, #716, #740, #772, #844).
 *
 * Phase 2 produces one result per (route, direction, day, headsign, shape). The map draws one
 * line per (route group, direction, day, headsign, branch) slot, so the results of a slot
 * compete for it. The rules below decide, in order, whether a candidate replaces the pattern
 * already holding the slot; each is named after the case that introduced it. They are a pure
 * function of the two patterns' summaries, so the order and the exceptions are in one place.
 */
import { MIN_ALL_DAY_TERMINAL_DEPARTURES } from './headway-utils.js';
import { haversineDistance } from './utils.js';
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
  /** A period value in the AM peak, midday, PM peak or evening (#746). */
  runsInDay: boolean;
  /** A midday period value (#746). */
  runsMidday: boolean;
  /** Weekday only: the pattern runs on the slot's representative weekday. */
  runsOnRepDay: boolean;
  /** Weekday only: the pattern has at least half of the slot's departures on that weekday. */
  carriesRepDay: boolean;
  /** The drawn line as [lon, lat] points (#844), absent for a mapless pattern. */
  line?: number[][];
}

/** Two drawn patterns are the same line when their lengths differ by under 2% (#844). */
const SAME_LINE_LENGTH_RATIO = 0.98;
/** Ends further apart than this are different terminals, not two platforms of one (#844). */
const SAME_TERMINAL_METERS = 100;
/**
 * A midday pattern stands for the same service as a no-midday sibling only when its midday reads
 * within 20% of the sibling's own headway (Lethbridge 4: 35 vs 33; REM A3: 15 vs 14). CapMetro
 * gives every 4-9 trip block its own shape (#737): a 9-trip block with an uneven midday must not
 * take 337 Mopac's slot from a 30-minute block.
 */
const SAME_SERVICE_HEADWAY_RATIO = 1.2;

function lineLengthMeters(line: number[][]): number {
  let total = 0;
  for (let i = 1; i < line.length; i++) total += haversineDistance(line[i - 1][1], line[i - 1][0], line[i][1], line[i][0]);
  return total;
}

/**
 * #844: two drawn lines are the same line: lengths within 2% and both ends within
 * SAME_TERMINAL_METERS (REM A3's two Anse-a-l'Orme platforms are 13 m apart; Brantford 3073's
 * Sinclair Blvd and Medical Centre variants, 203 m apart, are different terminals, #865).
 */
export function isSameLine(a: number[][] | undefined, b: number[][] | undefined): boolean {
  if (!a || !b || a.length < 2 || b.length < 2) return false;
  const lenA = lineLengthMeters(a);
  const lenB = lineLengthMeters(b);
  if (!(lenA > 0 && lenB > 0 && Math.min(lenA, lenB) >= Math.max(lenA, lenB) * SAME_LINE_LENGTH_RATIO)) return false;
  const near = (p: number[], q: number[]) => haversineDistance(p[1], p[0], q[1], q[0]) <= SAME_TERMINAL_METERS;
  return near(a[0], b[0]) && near(a[a.length - 1], b[b.length - 1]);
}

/** #844: a midday headway close enough to another pattern's headway to be the same service. */
function readsAsSameService(midday: number | null, other: number | null): boolean {
  return midday != null && other != null && midday <= other * SAME_SERVICE_HEADWAY_RATIO;
}

/** #746: the pattern has a period value somewhere in the day (AM peak to evening). */
export function runsInDay(p: Partial<{ amPeak: number | null; midday: number | null; pmPeak: number | null; evening: number | null }> | undefined): boolean {
  return p != null && (p.amPeak != null || p.midday != null || p.pmPeak != null || p.evening != null);
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

  // Step 3 (#746): a pattern that runs only late at night or before dawn never wins the slot
  // from one that runs through the midday, whatever its headway: YRT Viva Blue's 11 pre-dawn
  // Richmond Hill-Newmarket trips (median 11) took the Newmarket slot from the 85 all-day Finch
  // trips. Only that pair: a pattern with some daytime service but none at midday (a night
  // route's first Sunday-morning trips, TTC 304 and 320) keeps the headway rule. Only between
  // two rated patterns, and the midday side must be a real sample (MIN_THIN_REPLACING_DEPARTURES,
  // the same floor as Step 4): in a feed that gives every 3-5 trip block its own shape (CapMetro,
  // #737) a midday block reads its own few trips (320 Springdale Sunday 110 -> 153).
  // #877: the same for a pattern with no departure at all between 09:00 and 19:00, even when
  // its early-morning or evening trips give it a period value: TTC 86 Saturday's 58-trip
  // morning-and-evening shape (every 8 at its terminal, nothing 9-19h) held the Kennedy slot
  // against the 69-trip all-day shape, and the direction read limited with no midday value.
  // Unlike Step 3b this has no same-line guard, so a longer peak-only line to the same
  // destination (#728, #865) also gives up the slot to a midday pattern; the catalog scan of
  // the change lost or gained no headline, so it stays unguarded until a case needs one.
  const bothTimed = !replacesMaplessWithShape && candidate.headway != null && incumbent.headway != null;
  if (bothTimed && incumbent.runsMidday && incumbent.departures >= MIN_THIN_REPLACING_DEPARTURES && (!candidate.runsInDay || !candidate.hasDaytime)) return 'keep';
  const replacesNightOnly = bothTimed && candidate.runsMidday && candidate.departures >= MIN_THIN_REPLACING_DEPARTURES
    && (!incumbent.runsInDay || !incumbent.hasDaytime);

  // Step 3b (#844, #842): between two drawings of the same line whose headways read as one
  // service, a pattern with no midday trips never takes or keeps the slot from one that runs
  // through the midday. Lethbridge 4 Saturday's morning-and-evening shape scored its all-day
  // median (33) against the midday shape's midday headway (35), won, and drew a 339 minute
  // midday gap; REM A3's afternoon pattern to one platform beat the morning pattern to the other.
  // Same line only: a longer peak-only line keeps its own geometry (#728) and a variant to
  // another terminal keeps its slot (#865). The midday side must be a real sample, as in Step 3.
  const sameLine = bothTimed && incumbent.hasShape && candidate.hasShape && isSameLine(incumbent.line, candidate.line);
  if (sameLine && incumbent.runsMidday && incumbent.departures >= MIN_THIN_REPLACING_DEPARTURES && !candidate.runsMidday
    && readsAsSameService(incumbent.dedupeHeadway, candidate.dedupeHeadway)) return 'keep';
  const middayReplacesNoMidday = sameLine && candidate.runsMidday && candidate.departures >= MIN_THIN_REPLACING_DEPARTURES
    && !incumbent.runsMidday && readsAsSameService(candidate.dedupeHeadway, incumbent.dedupeHeadway);

  // Step 4 (#740): a thin result with no daytime service never holds the drawn line against a
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

  // Step 5 (#772): otherwise the slot goes to the better plain-median headway. A span result
  // (null) never beats a rated one, and the incumbent keeps an equal headway; the plain median
  // decides so that reading alternating gaps honestly never swaps which shape is drawn.
  if (!replacesMaplessWithShape && !prefersRepDayShape && !replacesNightOnly && !middayReplacesNoMidday && !daytimeReplacesThin
    && (candidate.dedupeHeadway == null
      || (incumbent.dedupeHeadway != null && incumbent.dedupeHeadway <= candidate.dedupeHeadway))) return 'keep';
  return 'replace';
}
