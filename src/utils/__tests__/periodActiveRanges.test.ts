import { describe, expect, it } from 'vitest';
import { TIME_PERIODS } from '../../../shared/config';
import type { ShapeProperties } from '../../hooks/useIntervalStats';
import { sparklineSourceDirections } from '../routeCardTrunk';
import { activeHourRanges, activeRangesCoverPeriod, partPeriodNoticeApplies } from '../periodActiveRanges';

// TTC 51 Leslie, published data (2026-10-20): the drawn patterns' hourly headways per day type.
const TTC_51: Record<'Weekday' | 'Saturday' | 'Sunday', Array<{ directionId: number; headsign: string; headwayByHour: Record<number, number> }>> = {
  Weekday: [
    { directionId: 0, headsign: "Donlands via Laird", headwayByHour: {5: 30, 6: 23, 7: 22, 8: 22, 9: 22, 10: 24, 11: 24, 12: 24, 13: 24, 14: 24, 15: 23, 16: 22, 17: 22, 18: 24, 19: 24, 20: 24, 21: 24, 22: 23, 23: 25, 24: 26, 25: 25} },
    { directionId: 0, headsign: "Donlands via Laird", headwayByHour: {5: 15, 6: 15, 7: 11, 8: 11, 9: 11, 10: 11, 11: 12, 12: 12, 13: 12, 14: 13, 15: 12, 16: 11, 17: 11, 18: 10, 19: 12, 20: 12, 21: 12, 22: 10, 23: 13, 24: 13, 25: 14} },
    { directionId: 1, headsign: "Leslie Station via Laird", headwayByHour: {5: 30, 6: 26, 7: 22, 8: 22, 9: 23, 10: 24, 11: 24, 12: 24, 13: 24, 14: 24, 15: 22, 16: 22, 17: 22, 18: 19, 19: 24, 20: 24, 21: 24, 22: 22, 23: 25, 24: 25, 25: 24} },
    { directionId: 1, headsign: "Don Mills via Laird", headwayByHour: {6: 26, 7: 22, 8: 22, 9: 23, 10: 24, 11: 24, 12: 24, 13: 24, 14: 22, 15: 22, 16: 22, 17: 22, 18: 17, 19: 24, 20: 24, 21: 24, 22: 23, 23: 25, 24: 25} },
  ],
  Saturday: [
    { directionId: 0, headsign: "Donlands via Laird", headwayByHour: {5: 28, 6: 28, 7: 26, 8: 22, 9: 22, 10: 22, 11: 21, 12: 22, 13: 22, 14: 22, 15: 22, 16: 22, 17: 22, 18: 24, 19: 24, 20: 24, 21: 24, 22: 23, 23: 25, 24: 26, 25: 25} },
    { directionId: 0, headsign: "Donlands via Laird", headwayByHour: {5: 14, 6: 14, 7: 14, 8: 11, 9: 11, 10: 11, 11: 11, 12: 11, 13: 11, 14: 11, 15: 11, 16: 11, 17: 11, 18: 11, 19: 12, 20: 12, 21: 12, 22: 11, 23: 13, 24: 13, 25: 13} },
    { directionId: 1, headsign: "Don Mills via Laird", headwayByHour: {6: 28, 7: 24, 8: 23, 9: 22, 10: 22, 11: 22, 12: 23, 13: 22, 14: 22, 15: 22, 16: 22, 17: 22, 18: 22, 19: 19, 20: 24, 21: 24, 22: 23, 23: 25, 24: 25} },
    { directionId: 1, headsign: "Leslie Station via Laird", headwayByHour: {6: 29, 7: 25, 8: 22, 9: 22, 10: 22, 11: 22, 12: 22, 13: 22, 14: 22, 15: 22, 16: 22, 17: 22, 18: 22, 19: 18, 20: 24, 21: 24, 22: 21, 23: 25, 24: 25, 25: 25} },
  ],
  Sunday: [
    { directionId: 0, headsign: "Danforth", headwayByHour: {5: 30, 6: 30} },
    { directionId: 0, headsign: "Donlands via Laird", headwayByHour: {7: 25, 8: 24, 9: 24, 10: 24, 11: 24, 12: 22, 13: 22, 14: 22, 15: 22, 16: 22, 17: 22, 18: 22, 19: 21, 20: 24, 21: 24, 22: 24, 23: 25, 24: 26, 25: 25} },
    { directionId: 0, headsign: "Donlands via Laird", headwayByHour: {7: 17, 8: 12, 9: 12, 10: 12, 11: 12, 12: 11, 13: 11, 14: 11, 15: 11, 16: 11, 17: 11, 18: 11, 19: 10, 20: 12, 21: 12, 22: 11, 23: 13, 24: 13, 25: 13} },
    { directionId: 1, headsign: "Don Mills", headwayByHour: {5: 28, 6: 30, 7: 22, 8: 24, 9: 24, 10: 24, 11: 22, 12: 24, 13: 22, 14: 22, 15: 22, 16: 22, 17: 22, 18: 21, 19: 20, 20: 24, 21: 24, 22: 24, 23: 25, 24: 25} },
    { directionId: 1, headsign: "Leslie Station via Laird", headwayByHour: {8: 24, 9: 24, 10: 24, 11: 23, 12: 22, 13: 22, 14: 22, 15: 22, 16: 22, 17: 22, 18: 22, 19: 21, 20: 24, 21: 24, 22: 25, 23: 25, 24: 25, 25: 25} },
    { directionId: 1, headsign: "Don Mills via Laird", headwayByHour: {6: 30, 7: 22, 8: 24, 9: 24, 10: 24, 11: 22, 12: 24, 13: 22, 14: 22, 15: 22, 16: 22, 17: 22, 18: 21, 19: 20, 20: 24, 21: 24, 22: 24, 23: 25, 24: 25} },
  ],
};

const asDirections = (rows: typeof TTC_51.Weekday) => rows as unknown as ShapeProperties[];
const period = (key: string) => TIME_PERIODS.find(p => p.key === key)!;

describe('part-period notice (#995)', () => {
  it('TTC 51 PM Peak under a tighter filter: runs all period, so no "not throughout" sentence', () => {
    const pm = period('pmPeak');
    const dir0 = asDirections(TTC_51.Weekday.filter(d => d.directionId === 0));
    // The card scans the primary multi-branch direction (Southbound here).
    const source = sparklineSourceDirections(asDirections(TTC_51.Weekday), dir0);
    expect(activeHourRanges(source, pm.startHour, pm.endHour)).toEqual([[15, 19]]);
    expect(partPeriodNoticeApplies(source, pm.startHour, pm.endHour, 15, 22)).toBe(false);
    expect(partPeriodNoticeApplies(asDirections(TTC_51.Weekday), pm.startHour, pm.endHour, 20, 22)).toBe(false);
  });

  it('TTC 51 runs through every daytime and Night period on every day type', () => {
    for (const day of ['Weekday', 'Saturday', 'Sunday'] as const) {
      const all = asDirections(TTC_51[day]);
      const dir0 = asDirections(TTC_51[day].filter(d => d.directionId === 0));
      for (const key of ['amPeak', 'midday', 'pmPeak', 'evening', 'late']) {
        const p = period(key);
        for (const source of [dir0, all]) {
          expect(partPeriodNoticeApplies(source, p.startHour, p.endHour, 15, 22), `${day} ${key}`).toBe(false);
        }
      }
    }
  });

  it('keeps the sentence for a route that genuinely stops partway through the period', () => {
    const pm = period('pmPeak');
    // Peak-only trips 3-5 PM, nothing after.
    const peakOnly = asDirections([{ directionId: 0, headsign: 'x', headwayByHour: { 15: 20, 16: 20 } }]);
    expect(partPeriodNoticeApplies(peakOnly, pm.startHour, pm.endHour, 15, 22)).toBe(true);
    // Starts late in the period.
    const lateStart = asDirections([{ directionId: 0, headsign: 'x', headwayByHour: { 17: 20, 18: 20 } }]);
    expect(partPeriodNoticeApplies(lateStart, pm.startHour, pm.endHour, 15, 22)).toBe(true);
    // A missing hour inside the period is not "throughout".
    const hole = asDirections([{ directionId: 0, headsign: 'x', headwayByHour: { 15: 20, 16: 20, 18: 20 } }]);
    expect(activeRangesCoverPeriod(activeHourRanges(hole, pm.startHour, pm.endHour), pm.startHour, pm.endHour)).toBe(false);
    expect(partPeriodNoticeApplies(hole, pm.startHour, pm.endHour, 15, 22)).toBe(true);
  });

  it('gives no part-period sentence when nothing runs near the period', () => {
    const pm = period('pmPeak');
    const morningOnly = asDirections([{ directionId: 0, headsign: 'x', headwayByHour: { 7: 10, 8: 10 } }]);
    expect(partPeriodNoticeApplies(morningOnly, pm.startHour, pm.endHour, 15, 22)).toBe(false);
  });

  it('a route that meets the frequency filter (hidden by another filter) keeps the earlier behaviour', () => {
    const pm = period('pmPeak');
    expect(partPeriodNoticeApplies(asDirections(TTC_51.Weekday), pm.startHour, pm.endHour, 30, 22)).toBe(true);
    expect(partPeriodNoticeApplies(asDirections(TTC_51.Weekday), pm.startHour, pm.endHour, 30, null)).toBe(false);
  });

  it('without a frequency filter, keeps the earlier behaviour', () => {
    const pm = period('pmPeak');
    expect(partPeriodNoticeApplies(asDirections(TTC_51.Weekday), pm.startHour, pm.endHour, Infinity, 22)).toBe(true);
  });
});
