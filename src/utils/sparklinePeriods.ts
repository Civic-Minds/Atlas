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

/**
 * The Live hour charts' axis: 5 AM to 4 AM next day (GTFS hours 5-28) in one unbroken run, trimmed at both ends to the
 * hours that have enough trips. Never an overnight tail after 12a: late-night hours follow on from midnight, and an
 * axis ends at its last well-measured hour. Charts shown side by side pass the same hours so they line up.
 */
export const LIVE_DAY_HOURS: readonly number[] = Array.from({ length: 24 }, (_, i) => i + 5);

export function liveChartHours(enough: (hour24: number) => boolean): number[] {
  const first = LIVE_DAY_HOURS.findIndex(h => enough(h % 24));
  if (first < 0) return [];
  let last = LIVE_DAY_HOURS.length - 1;
  while (last > first && !enough(LIVE_DAY_HOURS[last] % 24)) last--;
  return LIVE_DAY_HOURS.slice(first, last + 1);
}

/** Contiguous hover bands per period for a given hour axis, as fractions of the chart width. */
export function periodBandsFor(hours: readonly number[]): Record<string, { left: number; width: number }[]> {
  const result: Record<string, { left: number; width: number }[]> = {};
  let i = 0;
  while (i < hours.length) {
    const p = HOUR_TO_PERIOD[hours[i]];
    if (!p) { i++; continue; }
    const start = i;
    while (i < hours.length && HOUR_TO_PERIOD[hours[i]] === p) i++;
    (result[p] ??= []).push({ left: start / hours.length, width: (i - start) / hours.length });
  }
  return result;
}

/** The hour under a pointer position on a chart drawn over `hours`. */
export function hourAtOn(hours: readonly number[], clientX: number, rect: { left: number; width: number }): number {
  const fraction = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
  return hours[Math.min(Math.floor(fraction * hours.length), hours.length - 1)];
}
