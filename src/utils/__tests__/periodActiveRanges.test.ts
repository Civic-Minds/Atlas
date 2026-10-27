import { describe, expect, it } from 'vitest';
import { TIME_PERIODS } from '../../../shared/config';
import type { ShapeProperties } from '../../hooks/useIntervalStats';
import { sparklineSourceDirections } from '../routeCardTrunk';
import { activeHourRanges, activeRangesCoverPeriod, hourHasService, partPeriodNoticeApplies } from '../periodActiveRanges';

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

// #1137: published data (release-mvp929b3). Hourly patterns have no headwayByHour (it needs three
// departures in 60-90 minutes) but a maxGapByHour in every hour with a departure.
type Hourly = { directionId: number; headwayByHour: Record<number, number>; maxGapByHour: Record<number, number> };
const OC_162: Record<'Weekday' | 'Saturday' | 'Sunday', Hourly[]> = {
  Weekday: [
    { directionId: 0, headwayByHour: {7: 30, 8: 30, 14: 45, 15: 20, 16: 31, 17: 30}, maxGapByHour: {6: 30, 7: 31, 8: 30, 9: 60, 10: 60, 11: 60, 12: 60, 13: 60, 14: 60, 15: 30, 16: 32, 17: 30, 18: 60, 19: 56, 20: 60, 21: 60} },
    { directionId: 1, headwayByHour: {7: 30, 8: 31, 15: 29, 16: 30, 17: 30}, maxGapByHour: {7: 30, 8: 31, 9: 60, 10: 60, 11: 60, 12: 60, 13: 60, 14: 65, 15: 30, 16: 32, 17: 30, 18: 60, 19: 54, 20: 59, 21: 59} },
  ],
  Saturday: [
    { directionId: 1, headwayByHour: {}, maxGapByHour: {7: 60, 8: 60, 9: 60, 10: 61, 11: 60, 12: 60, 13: 60, 14: 60, 15: 60, 16: 60, 17: 60, 18: 59, 19: 60, 20: 60, 21: 60, 22: 43} },
    { directionId: 0, headwayByHour: {}, maxGapByHour: {7: 60, 8: 60, 9: 60, 10: 60, 11: 61, 12: 60, 13: 60, 14: 60, 15: 60, 16: 60, 17: 59, 18: 60, 19: 60, 20: 60, 21: 43, 22: 39} },
  ],
  Sunday: [
    { directionId: 1, headwayByHour: {}, maxGapByHour: {7: 60, 8: 60, 9: 61, 10: 60, 11: 60, 12: 60, 13: 60, 14: 60, 15: 60, 16: 60, 17: 59, 18: 60, 19: 60, 20: 60, 21: 60} },
    { directionId: 0, headwayByHour: {}, maxGapByHour: {8: 60, 9: 60, 10: 60, 11: 61, 12: 60, 13: 60, 14: 60, 15: 60, 16: 60, 17: 59, 18: 60, 19: 60, 20: 60, 21: 60, 22: 60} },
  ],
};
const OAKVILLE_14_WEEKDAY: Hourly[] = [
  { directionId: 0, headwayByHour: {7: 30, 16: 30, 17: 30, 18: 27}, maxGapByHour: {6: 30, 7: 30, 8: 45, 9: 58, 10: 60, 11: 60, 12: 60, 13: 60, 14: 67, 15: 66, 16: 30, 17: 30, 18: 30, 19: 53} },
  { directionId: 1, headwayByHour: {6: 32, 7: 30, 8: 30, 17: 30, 18: 30}, maxGapByHour: {6: 33, 7: 30, 8: 30, 9: 55, 10: 60, 11: 60, 12: 60, 13: 60, 14: 60, 15: 69, 16: 60, 17: 30, 18: 30, 19: 51} },
  { directionId: 0, headwayByHour: {7: 30, 8: 30, 17: 30, 18: 30}, maxGapByHour: {7: 30, 8: 30, 9: 45, 10: 52, 11: 60, 12: 60, 13: 60, 14: 60, 15: 73, 16: 63, 17: 30, 18: 30, 19: 47} },
  { directionId: 1, headwayByHour: {7: 30, 8: 30, 17: 30, 18: 30}, maxGapByHour: {6: 33, 7: 33, 8: 30, 9: 54, 10: 60, 11: 60, 12: 60, 13: 60, 14: 60, 15: 72, 16: 60, 17: 30, 18: 30, 19: 48} },
];
// RFTA HC weekday: the first buses leave at 7:05 and 7:12, so AM Peak (6-9) really starts late.
const RFTA_HC_WEEKDAY: Hourly[] = [0, 1].map(directionId => ({
  directionId,
  headwayByHour: Object.fromEntries(Array.from({ length: 17 }, (_, i) => [i + 7, 20])),
  maxGapByHour: Object.fromEntries(Array.from({ length: 17 }, (_, i) => [i + 7, 20])),
}));
const hourly = (rows: Hourly[]) => rows as unknown as ShapeProperties[];

describe('part-period notice counts hourly service (#1137)', () => {
  it('an hour with a departure but no hourly headway counts as service', () => {
    expect(hourHasService({ maxGapByHour: { 10: 60 } }, 10)).toBe(true);
    expect(hourHasService({ headwayByHour: { 10: 20 } }, 10)).toBe(true);
    expect(hourHasService({ headwayByHour: { 10: null }, maxGapByHour: { 10: null } }, 10)).toBe(false);
  });

  it('OC Transpo 162 runs hourly through Midday and PM Peak on every day type, so no "not throughout" sentence', () => {
    for (const day of ['Weekday', 'Saturday', 'Sunday'] as const) {
      for (const key of ['midday', 'pmPeak']) {
        const p = period(key);
        expect(partPeriodNoticeApplies(hourly(OC_162[day]), p.startHour, p.endHour, 30, 60), `${day} ${key}`).toBe(false);
      }
    }
    // The note's hours still come from hourly headways (the last departure's hour has no maxGapByHour).
    const midday = period('midday');
    expect(activeHourRanges(hourly(OC_162.Weekday), midday.startHour - 1, midday.endHour)).toEqual([[8, 9], [14, 15]]);
    const am = period('amPeak');
    expect(partPeriodNoticeApplies(hourly(OC_162.Weekday), am.startHour, am.endHour, 30, 60)).toBe(false);
  });

  it('Oakville 14 weekday Midday runs throughout, so no "not throughout" sentence', () => {
    const midday = period('midday');
    expect(partPeriodNoticeApplies(hourly(OAKVILLE_14_WEEKDAY), midday.startHour, midday.endHour, 30, 60)).toBe(false);
  });

  it('never adds the sentence: an hourly route the old check had no service for keeps the filter notice', () => {
    // OC Transpo 162 Saturday Evening (7-11 PM): hourly with no hourly headway at all.
    const evening = period('evening');
    expect(activeHourRanges(hourly(OC_162.Saturday), evening.startHour - 1, evening.endHour)).toEqual([]);
    expect(partPeriodNoticeApplies(hourly(OC_162.Saturday), evening.startHour, evening.endHour, 30, 60)).toBe(false);
  });

  it('RFTA HC weekday AM Peak starts at 7, so it keeps the part-period sentence', () => {
    const am = period('amPeak');
    expect(activeHourRanges(hourly(RFTA_HC_WEEKDAY), am.startHour - 1, am.endHour)).toEqual([[7, 9]]);
    expect(partPeriodNoticeApplies(hourly(RFTA_HC_WEEKDAY), am.startHour, am.endHour, 15, 72)).toBe(true);
  });
});
