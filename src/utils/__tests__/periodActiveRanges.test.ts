import { describe, expect, it } from 'vitest';
import { TIME_PERIODS } from '../../../shared/config';
import type { ShapeProperties } from '../../hooks/useIntervalStats';
import { sparklineSourceDirections } from '../routeCardTrunk';
import { activeHourRanges, activeRangesCoverPeriod, hourHasService, partPeriodNoticeApplies, partPeriodNoticeHeadway, partPeriodOutside, periodTripRanges } from '../periodActiveRanges';

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

// #1123: the part-period notice's number against the card's rows (published values, release-mvp929b3).
describe('part-period notice frequency (#1123)', () => {
  it('names no frequency when its number is slower than every row', () => {
    // RFTA HC weekday AM Peak: filter value 72 ("every 60 min") over two rows of every 20.
    expect(partPeriodNoticeHeadway(72, [20, 20])).toBeNull();
    // SEPTA 25 Sunday Night: 60 over rows of 30 and 31.
    expect(partPeriodNoticeHeadway(60, [30, 31])).toBeNull();
    // OC Transpo 14 weekday Night: 85 ("every 90 min") over rows of 37 and 27.
    expect(partPeriodNoticeHeadway(85, [37, 27])).toBeNull();
  });

  it('keeps the number when a row runs as slowly', () => {
    // Des Moines 12 weekday AM Peak: "every 45 min", over rows of every 45 and every 30.
    expect(partPeriodNoticeHeadway(45, [45, 30])).toBe(45);
    // An hourly route keeps "every 60 min" over hourly rows.
    expect(partPeriodNoticeHeadway(60, [60, 60])).toBe(60);
    // Compared as printed: 62 reads "every 60 min", the same as a row of 60.
    expect(partPeriodNoticeHeadway(62, [60, 39])).toBe(62);
    // One row slower than the number is enough.
    expect(partPeriodNoticeHeadway(60, [30, 90])).toBe(60);
  });

  it('names no number when no row shows one, and none without a filter value', () => {
    // TTC 10 Van Horne weekday Midday (#1043): rush-hour-only, rows read "Irregular"; the filter
    // value is the 330-minute wait between the morning and afternoon trips, not a frequency.
    expect(partPeriodNoticeHeadway(330, [null, null])).toBeNull();
    expect(partPeriodNoticeHeadway(72, [null, undefined])).toBeNull();
    expect(partPeriodNoticeHeadway(72, [])).toBeNull();
    expect(partPeriodNoticeHeadway(null, [20])).toBeNull();
  });
});

// CIV-1010: the published departure counts name every hour with a departure, the day's last one included.
describe('departure counts (CIV-1010)', () => {
  // OC Transpo 162 weekday evening shape: hourly, last departures 22:00 and 22:18; no hourly headway, no gap for hour 22.
  const hourly = (from: number, to: number) => Object.fromEntries(Array.from({ length: to - from + 1 }, (_, i) => [from + i, 1]));
  const oc162 = [{ departuresByHour: hourly(18, 22), headwayByHour: { 18: 30 }, maxGapByHour: { 18: 60, 19: 60, 20: 60, 21: 60 } }, { departuresByHour: hourly(18, 22) }];

  it('counts the hour of the last departure, so an hourly evening reads as running to the end of the period', () => {
    expect(activeHourRanges(oc162, 18, 23)).toEqual([[18, 23]]);
    expect(partPeriodNoticeApplies(oc162, 19, 22, 30, 60)).toBe(false);
  });

  it('keeps the notice where an hour has no departure (a peak-only route at midday)', () => {
    // The AM peak runs on into the first midday hour; #1186: with no trip inside the period at all there is no notice.
    const peak = [{ departuresByHour: { 7: 4, 8: 4, 9: 2, 16: 4, 17: 4 }, headwayByHour: { 7: 15, 8: 15, 16: 15, 17: 15 } }];
    expect(partPeriodNoticeApplies(peak, 9, 15, 30, 120)).toBe(true);
    expect(activeHourRanges(peak, 8, 15)).toEqual([[8, 10]]);
    const peakOnly = [{ departuresByHour: { 7: 4, 8: 4, 16: 4, 17: 4 }, headwayByHour: { 7: 15, 8: 15, 16: 15, 17: 15 } }];
    expect(partPeriodNoticeApplies(peakOnly, 9, 15, 30, 120)).toBe(false);
  });

  it('never adds a notice or names hours where no hour has a headway', () => {
    const sparse = [{ departuresByHour: { 8: 1, 9: 1, 10: 1, 11: 1, 13: 1, 14: 1 } }];
    expect(activeHourRanges(sparse, 8, 15)).toEqual([]);
    expect(partPeriodNoticeApplies(sparse, 9, 15, 30, 60)).toBe(false);
  });

  it('data without the counts keeps the earlier rule', () => {
    const withoutCounts = [{ headwayByHour: { 18: null, 19: null }, maxGapByHour: { 18: 60, 19: 60 } }];
    expect(activeHourRanges(withoutCounts as any, 18, 20)).toEqual([]);
    expect(hourHasService(withoutCounts[0] as any, 18)).toBe(true);
  });
});

describe('partPeriodOutside (N13)', () => {
  const hours = (h: Record<number, number>) => h;
  it('no trips before the run, with departure counts: no service', () => {
    const d = { headwayByHour: hours({ 7: 12, 8: 12 }), departuresByHour: hours({ 7: 5, 8: 5 }) };
    expect(partPeriodOutside([d], 6, 9)).toEqual({ active: [7, 9], parts: [{ at: 'start', hours: [6, 7], service: 'none' }] });
  });
  it('trips before the run that are too few for a headway: less often', () => {
    const d = { headwayByHour: hours({ 7: 12, 8: 12 }), maxGapByHour: hours({ 6: 40, 7: 12, 8: 12 }) };
    expect(partPeriodOutside([d], 6, 9)?.parts).toEqual([{ at: 'start', hours: [6, 7], service: 'less' }]);
  });
  it('an end part without departure counts cannot be told apart', () => {
    const d = { headwayByHour: hours({ 6: 12, 7: 12 }), maxGapByHour: hours({ 6: 12 }) };
    expect(partPeriodOutside([d], 6, 9)?.parts).toEqual([{ at: 'end', hours: [8, 9], service: 'unknown' }]);
  });
  it('both ends, and more than one run gives null', () => {
    const d = { headwayByHour: hours({ 7: 12 }), departuresByHour: hours({ 7: 5 }) };
    expect(partPeriodOutside([d], 6, 9)?.parts.map(p => p.service)).toEqual(['none', 'none']);
    const split = { headwayByHour: hours({ 6: 12, 8: 12 }), departuresByHour: hours({ 6: 5, 8: 5 }) };
    expect(partPeriodOutside([split], 6, 9)).toBeNull();
  });
});

describe('periodTripRanges: the hours inside the period with trips (#1186)', () => {
  it('reads only the period, not the hour before it (TTC 504 Sunday overnight: trips 1-4 AM, period 2-6 AM)', () => {
    const d = { headwayByHour: { 25: 10, 26: 10 }, departuresByHour: { 25: 6, 26: 6, 27: 1 } };
    expect(periodTripRanges([d], 26, 30)).toEqual([[26, 28]]);
  });
  it('names the departure hours when no hour has a headway (TTC 300 weekday AM peak: one trip, 6-7 AM)', () => {
    expect(periodTripRanges([{ departuresByHour: { 6: 1 } }], 6, 9)).toEqual([[6, 7]]);
  });
  it('is empty when every trip leaves before the period (TTC 15 overnight: last trips before 2 AM)', () => {
    const d = { departuresByHour: { 24: 2, 25: 2 }, maxGapByHour: { 24: 30, 25: 30 } };
    expect(periodTripRanges([d], 26, 30)).toEqual([]);
  });
});

describe('overnight holds the next morning\'s 2-6 AM trips (#1236)', () => {
  const [start, end] = [26, 30];

  it('reads TTC 100\'s 5:34 AM first trip as running from 5-6 AM', () => {
    // TTC 100 to Pape, weekday: nothing after midnight, the day's first departures in the 5 AM hour.
    const pape = { departuresByHour: { 5: 3, 6: 12, 7: 12 }, headwayByHour: { 5: 5, 6: 5 } } as Partial<ShapeProperties>;
    expect(periodTripRanges([pape], start, end)).toEqual([[29, 30]]);
    expect(hourHasService(pape, 29)).toBe(true);
    expect(hourHasService(pape, 28)).toBe(false);
  });

  it('leaves a route with no overnight trips at all with none (a 6 AM start)', () => {
    const daytime = { departuresByHour: { 6: 4, 7: 6, 22: 2 }, headwayByHour: { 6: 15, 7: 10 }, maxGapByHour: { 6: 15, 7: 10 } } as Partial<ShapeProperties>;
    expect(periodTripRanges([daytime], start, end)).toEqual([]);
    expect(partPeriodNoticeApplies([daytime], start, end, 15, 60)).toBe(false);
  });

  it('names no service before a morning start where the counts show none (TTC 99: a headway in the 4 AM hour reads the 5 AM trips)', () => {
    const tt99 = { departuresByHour: { 5: 4 }, headwayByHour: { 5: 15, 28: 14 }, maxGapByHour: { 5: 18 } } as Partial<ShapeProperties>;
    expect(partPeriodOutside([tt99], start, end)).toEqual({ active: [29, 30], parts: [{ at: 'start', hours: [26, 29], service: 'none' }] });
  });
});

describe('the part-period notice needs trips inside the period (#1186)', () => {
  const midday = TIME_PERIODS.find(p => p.key === 'midday')!;

  it('does not show for a direction whose only trips are before the period (MiWay 49 weekday midday)', () => {
    const before = { departuresByHour: { 6: 3, 7: 3, 8: 2 }, headwayByHour: { 6: 20, 7: 20, 8: 30 }, maxGapByHour: { 6: 20, 7: 20 } } as Partial<ShapeProperties>;
    expect(partPeriodNoticeApplies([before], midday.startHour, midday.endHour, 15, 45)).toBe(false);
  });

  it('shows for a run that starts exactly at the period\'s first hour, named from that hour', () => {
    const fromNine = { departuresByHour: { 9: 4, 10: 4 }, headwayByHour: { 9: 15, 10: 15 }, maxGapByHour: { 9: 15, 10: 15 } } as Partial<ShapeProperties>;
    expect(partPeriodNoticeApplies([fromNine], midday.startHour, midday.endHour, 15, 30)).toBe(true);
    expect(periodTripRanges([fromNine], midday.startHour, midday.endHour)).toEqual([[9, 11]]);
  });
});
