import { periodKeyForHour, SPARKLINE_HOURS, TIME_PERIODS } from '../../shared/config';

/**
 * The hour-to-period map and the hover bands of the route card's schedule sparkline, shared with every other hour
 * chart (the Live route page) so hovering an hour highlights its period the same way everywhere.
 */
export const HOUR_TO_PERIOD: Record<number, string> = Object.fromEntries(
  SPARKLINE_HOURS.map(h => [h, periodKeyForHour(h)]).filter(([, p]) => p != null),
) as Record<number, string>;

/** Contiguous hover bands per period, as fractions of the chart width (overnight tail: 2 AM, 3 AM, 4 AM, 5 AM). */
export const PERIOD_BANDS: Record<string, { left: number; width: number }[]> = (() => {
  const result: Record<string, { left: number; width: number }[]> = {};
  let i = 0;
  while (i < SPARKLINE_HOURS.length) {
    const p = HOUR_TO_PERIOD[SPARKLINE_HOURS[i]];
    if (!p) { i++; continue; }
    const start = i;
    while (i < SPARKLINE_HOURS.length && HOUR_TO_PERIOD[SPARKLINE_HOURS[i]] === p) i++;
    (result[p] ??= []).push({ left: start / SPARKLINE_HOURS.length, width: (i - start) / SPARKLINE_HOURS.length });
  }
  return result;
})();

/** One band per period from its first to its last hour, for the expanded chart's period labels. */
export const PERIOD_OVERVIEW_BANDS = TIME_PERIODS.map(period => {
  const bands = PERIOD_BANDS[period.key] ?? [];
  const first = bands[0];
  const last = bands[bands.length - 1];
  return first && last
    ? { ...period, left: first.left, width: last.left + last.width - first.left }
    : null;
}).filter((band): band is (typeof TIME_PERIODS)[number] & { left: number; width: number } => band != null);

/** The sparkline hour under a pointer position, from the chart element's box. */
export function sparklineHourAt(clientX: number, rect: { left: number; width: number }): number {
  const fraction = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
  return SPARKLINE_HOURS[Math.min(Math.floor(fraction * SPARKLINE_HOURS.length), SPARKLINE_HOURS.length - 1)];
}
