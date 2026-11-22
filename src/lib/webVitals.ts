/**
 * Core Web Vitals for the Load measurements page (CIV-2076): Google's "good" and "poor" thresholds, and how
 * INP and CLS are worked out from the browser's own entries.
 *
 * Thresholds are Google's published ones, measured at the 75th percentile of page loads:
 * https://web.dev/articles/vitals (LCP, INP, CLS), https://web.dev/articles/fcp and https://web.dev/articles/ttfb.
 * A value at or under "good" is Good, over "poor" is Poor, and between is Needs improvement.
 */
import { decimalText } from '../../shared/numberText';

export type VitalKey = 'ttfb' | 'fcp' | 'lcp' | 'inp' | 'cls';
export type VitalRating = 'Good' | 'Needs improvement' | 'Poor';

export const VITAL_THRESHOLDS: Record<VitalKey, { good: number; poor: number; unit: 'ms' | '' }> = {
  ttfb: { good: 800, poor: 1800, unit: 'ms' },
  fcp: { good: 1800, poor: 3000, unit: 'ms' },
  lcp: { good: 2500, poor: 4000, unit: 'ms' },
  inp: { good: 200, poor: 500, unit: 'ms' },
  cls: { good: 0.1, poor: 0.25, unit: '' },
};

export function vitalRating(key: VitalKey, value: number | null | undefined): VitalRating | null {
  if (value == null || !Number.isFinite(value)) return null;
  const t = VITAL_THRESHOLDS[key];
  return value <= t.good ? 'Good' : value > t.poor ? 'Poor' : 'Needs improvement';
}

/** "≤ 2.5 s", "≤ 200 ms", "≤ 0.1": the good threshold as the page shows it. */
export function goodThresholdText(key: VitalKey): string {
  const { good, unit } = VITAL_THRESHOLDS[key];
  if (unit === '') return `≤ ${good}`;
  return good >= 1000 ? `≤ ${good / 1000} s` : `≤ ${good} ms`;
}

export const clsText = (value: number | null | undefined): string =>
  value == null || !Number.isFinite(value) ? 'Not available' : decimalText(value, 3);

export interface LayoutShift { startTime: number; value: number; hadRecentInput: boolean }

/**
 * CLS: the largest burst of layout shifts, where a burst ("session window") ends after 1 s with no shift or
 * at 5 s long, and shifts right after the user's input don't count (https://web.dev/articles/cls).
 */
export function clsFromShifts(shifts: readonly LayoutShift[]): number {
  let worst = 0, sum = 0, first = 0, last = 0;
  for (const s of shifts) {
    if (s.hadRecentInput) continue;
    if (sum > 0 && (s.startTime - last > 1000 || s.startTime - first > 5000)) sum = 0;
    if (sum === 0) first = s.startTime;
    sum += s.value;
    last = s.startTime;
    worst = Math.max(worst, sum);
  }
  return worst;
}

export interface InteractionEvent { interactionId: number; duration: number }

/**
 * INP: the slowest interaction (click, tap or key press) so far, each interaction counted once at its longest
 * event. Google takes the 98th percentile, which is the slowest one until a page has 50 interactions; this
 * page never gets that many (https://web.dev/articles/inp).
 */
export function inpFromEvents(events: readonly InteractionEvent[]): number | null {
  const byInteraction = new Map<number, number>();
  for (const e of events) {
    if (!e.interactionId) continue;
    byInteraction.set(e.interactionId, Math.max(byInteraction.get(e.interactionId) ?? 0, e.duration));
  }
  if (!byInteraction.size) return null;
  const sorted = [...byInteraction.values()].sort((a, b) => b - a);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length / 50))];
}
