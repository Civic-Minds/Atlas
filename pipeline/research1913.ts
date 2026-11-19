/**
 * CIV-1913 research only (dry-run branch, never merged), attempt 2: does a period split into two parts whose typical
 * gaps differ? Metro Transit METRO E Line weekday Late (every 15 to midnight, then one trip at 1:41) must split;
 * MBTA 116 weekday Late (every 14-19 each hour to 2 AM) must not.
 *
 * Changes from attempt 1, after its hand-checks:
 * - Each part is read by its typical (median) gap, not its worst, so one late gap no longer drops a part a grade.
 * - The split goes where the two parts' typical gaps differ most (latest on a tie), not at the biggest grade change.
 * - A split counts only when the slower part's typical gap is at least SPLIT_RATIO times the faster part's.
 * - The earlier part needs 3+ departures and to reach SPLIT_BEFORE_MIN minutes from the window's start (the E Line's
 *   last 15-minute trip is before midnight, so attempt 1's 60 minutes between first and last departure missed it); the
 *   later part needs 2+ departures and SPLIT_AFTER_MIN minutes to the window's end.
 * The research numbers below are not approved rule numbers.
 */
import { PUBLIC_TIER_MAXES } from '../shared/rules/frequency.js';

export const SPLIT_RATIO = 1.5;
export const SPLIT_BEFORE_MIN = 45;
export const SPLIT_AFTER_MIN = 60;

/** A typical gap's public grade; null when it is over the slowest public grade. */
export const typicalGrade = (median: number): number | null => PUBLIC_TIER_MAXES.find(g => median <= g) ?? null;

const median = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};
const gaps = (xs: number[]) => xs.slice(1).map((x, i) => x - xs[i]);

export interface PeriodSplit { at: number; beforeGap: number; afterGap: number; before: number | null; after: number | null; ratio: number }

/** times: sorted departures (minutes) inside [start, end). */
export function periodSplit(times: readonly number[], start: number, end: number): PeriodSplit | null {
  const t = [...times];
  let best: PeriodSplit | null = null;
  for (let k = 3; k <= t.length - 1; k++) {
    const a = t.slice(0, k), b = t.slice(k - 1);
    if (t[k - 1] - start < SPLIT_BEFORE_MIN || end - t[k - 1] < SPLIT_AFTER_MIN) continue;
    // The later part's typical gap runs to the window's end when it has only its first departure and one more.
    const ma = median(gaps(a)), mb = median(gaps(b));
    const ratio = Math.max(ma, mb) / Math.min(ma, mb);
    if (ratio < SPLIT_RATIO) continue;
    const before = typicalGrade(ma), after = typicalGrade(mb);
    if (before === after) continue;
    if (!best || ratio >= best.ratio) best = { at: Math.round(t[k - 1]), beforeGap: Math.round(ma), afterGap: Math.round(mb), before, after, ratio: Math.round(ratio * 100) / 100 };
  }
  return best;
}
