import type { AxisTick } from '../components/Interval/TripTimeStrip';
import { isHourInPeriod } from '../../shared/config';
import { headwayAmount } from './headwayText';
import { isRiderMeaningfulGap } from './routeCardUneven';
import { HOUR_TO_PERIOD } from './sparklinePeriods';

/**
 * The hour chart's model (CIV-1011 #10): its scale, each bar's height, colour and emphasis, and which
 * period band is lit. The route card's chart and every chart of its full-day view read these, so the
 * same hour draws the same way everywhere.
 */

type HourSeries = Partial<Record<number, number | null | undefined>>;

/** The scale's top in trips per minute: the busiest hour of any series given, never below `floor`. */
export function hourChartMaxFreq(series: readonly HourSeries[], hours: readonly number[], floor = 0): number {
  let max = floor;
  for (const byHour of series) {
    for (const h of hours) {
      const v = byHour[h];
      if (v != null && v > 0 && 1 / v > max) max = 1 / v;
    }
  }
  return max;
}

/**
 * Bar height for one hour. Height is proportional to trips per hour (1 / headway) measured from zero,
 * so a 35-minute hour is ~2/3 the height of a 23-minute hour instead of collapsing to a stub. A small
 * floor keeps any hour with service visible.
 */
export function sparklineBarHeight(headway: number | null | undefined, maxFreq: number, chartHeight: number): number {
  if (headway == null || !(headway > 0) || !(maxFreq > 0)) return 0;
  const floor = Math.min(3, chartHeight);
  return Math.max(floor, Math.round((1 / headway) / maxFreq * chartHeight));
}

/**
 * Headway axis for the full-day charts: round headways ("10 min") placed where a bar of that headway
 * tops out. Bars are as tall as 1/headway on the chart's fixed scale (sparklineBarHeight), so a tick's
 * height is (1/minutes) / maxFreq, and more frequent service sits higher.
 */
export function headwayAxisTicks(maxFreq: number, height: number): AxisTick[] {
  if (!(maxFreq > 0)) return [];
  const minGap = height < 60 ? 16 : 24;
  const maxTicks = height < 60 ? 2 : 3;
  const ticks: AxisTick[] = [];
  let lastPx = Infinity;
  for (const minutes of [2, 3, 5, 10, 15, 20, 30, 60, 120]) {
    const fraction = (1 / minutes) / maxFreq;
    const px = fraction * height;
    if (fraction > 1.0001 || px < 14 || lastPx - px < minGap || ticks.length >= maxTicks) continue;
    ticks.push({ label: headwayAmount(minutes), fraction: Math.min(1, fraction) });
    lastPx = px;
  }
  return ticks;
}

/** The headway a bar's tier colour reads: the hour's longest gap when it is a real gap for riders, else its headway (CIV-497). */
export function hourBarColorHeadway(headway: number, maxGap: number | null | undefined): number {
  return maxGap != null && isRiderMeaningfulGap(maxGap, headway) ? maxGap : headway;
}

/** How strongly a bar draws: full in the selected period (or with none selected), then the lit band, else faded. */
export function hourBarEmphasis(hour: number, activePeriod: string | null, litPeriod: string | null): 'active' | 'lit' | 'dim' {
  if (!activePeriod || isHourInPeriod(hour, activePeriod)) return 'active';
  return litPeriod && HOUR_TO_PERIOD[hour] === litPeriod ? 'lit' : 'dim';
}

/**
 * The period whose band is lit: the hovered one, else the selected period when it has bars. A period with
 * no bars gets no band: over empty columns it reads as a placeholder (a night route at midday). CIV-933.
 */
export function hourChartLitPeriod(hoverPeriod: string | null, activePeriod: string | null, byHour: HourSeries, hours: readonly number[]): string | null {
  if (hoverPeriod) return hoverPeriod;
  return activePeriod && hours.some(h => isHourInPeriod(h, activePeriod) && byHour[h] != null) ? activePeriod : null;
}
