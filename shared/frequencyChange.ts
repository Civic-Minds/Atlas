/**
 * CIV-1814 item 38: the one rule for "did this route's frequency change?", for Studio's Schedule Changes and History's
 * change box. Ryan, 2026-11-17 ("1", the full grade list): a change counts when a route moves to a different grade on
 * the one grading scale (TIER_MAXES: internal 5 and 8, public 10, 15, 20, 30, 60, then Infrequent), and bigger grade
 * jumps rank higher. So 30 → 29 min is no change (both grade 30), while 31 → 29 is one step. The grades come from
 * shared/rules/frequency.ts, never a list of their own. The release check's ratio-2 alarm is a different question
 * (broken data) and keeps its own rule.
 */
import { headwayGradeOn, publicTierOf, TIER_MAXES } from './frequencyRules';

/** A headway in minutes, or null/undefined where the route has none (no service in that period or on that side). */
type Headway = number | null | undefined;

export interface FrequencyChange {
  /** The grade on each side (minutes; null past the scale: Infrequent), or 'none' where the side has no service. */
  before: number | null | 'none';
  after: number | null | 'none';
  /**
   * How far it moved: the number of grades between the two sides on TIER_MAXES plus Infrequent. Service starting or
   * stopping counts as STARTS_OR_STOPS_STEPS, above any move between grades.
   */
  steps: number;
  /** True when the route got more frequent (or service started). */
  better: boolean;
  /**
   * True when the public grade moved too (the map's line colour changes). False for a move inside the fastest public
   * grade, such as 10 → 5: riders see 10 on both sides (internal grades are never shown).
   */
  publicChange: boolean;
}

/** Positions on the scale: each grade of TIER_MAXES, then Infrequent. */
const INFREQUENT_POSITION = TIER_MAXES.length;
/** A start or a stop outranks the biggest move between grades (fastest grade to Infrequent). */
export const STARTS_OR_STOPS_STEPS = INFREQUENT_POSITION + 1;

const has = (h: Headway): h is number => h != null && Number.isFinite(h);
const position = (grade: number | null) => (grade == null ? INFREQUENT_POSITION : TIER_MAXES.indexOf(grade));
const publicGrade = (grade: number | null | 'none') => (grade === 'none' ? 'none' : grade == null ? null : publicTierOf(grade));

/** The frequency change between two headways, or null when there is none (same grade, or no service on either side). */
export function frequencyChange(before: Headway, after: Headway): FrequencyChange | null {
  if (!has(before) && !has(after)) return null;
  const b = has(before) ? headwayGradeOn(before, TIER_MAXES) : 'none';
  const a = has(after) ? headwayGradeOn(after, TIER_MAXES) : 'none';
  if (b === a) return null;
  if (b === 'none' || a === 'none') return { before: b, after: a, steps: STARTS_OR_STOPS_STEPS, better: b === 'none', publicChange: true };
  const from = position(b), to = position(a);
  return { before: b, after: a, steps: Math.abs(to - from), better: to < from, publicChange: publicGrade(b) !== publicGrade(a) };
}
