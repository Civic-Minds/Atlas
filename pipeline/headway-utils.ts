import { HEADWAY_TIERS, TIME_PERIODS, type HeadwayByPeriod, type PeriodKey } from '../shared/config.js';

const PERIODS = Object.fromEntries(
  TIME_PERIODS.map(p => [p.key, { start: p.startHour * 60, end: p.endHour * 60 }]),
) as Record<string, { start: number; end: number }>;

export const TIER_RANK: Record<string, number> = Object.fromEntries([
  ...HEADWAY_TIERS.map(({ max }, i) => [max === Infinity ? 'infrequent' : String(max), i]),
  ['span', HEADWAY_TIERS.length],
]);

export function headwayToTier(h: number): string {
  for (const { max } of HEADWAY_TIERS) {
    if (h <= max) return max === Infinity ? 'infrequent' : String(max);
  }
  return 'infrequent';
}

export function medianHeadwayInWindow(
  departureTimes: number[],
  start: number,
  end: number,
  minDeps = 2,
): number | null {
  const times = [...new Set(departureTimes)].filter(t => t >= start && t <= end).sort((a, b) => a - b);
  if (times.length < minDeps) return null;
  const gaps: number[] = [];
  for (let i = 1; i < times.length; i++) gaps.push(times[i] - times[i - 1]);
  gaps.sort((a, b) => a - b);
  return Math.round(gaps[Math.floor(gaps.length / 2)]);
}

export function computePeriodHeadways(departureTimes: number[]): HeadwayByPeriod {
  const result: HeadwayByPeriod = {};
  for (const [key, { start, end }] of Object.entries(PERIODS) as [PeriodKey, { start: number; end: number }][]) {
    result[key] = medianHeadwayInWindow(departureTimes, start, end, 3);
  }
  return result;
}
