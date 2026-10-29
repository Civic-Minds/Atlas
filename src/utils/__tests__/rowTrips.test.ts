import { describe, expect, it } from 'vitest';
import { rowTrips } from '../rowTrips';
import { routeCardRowValue } from '../routeCardRowValue';
import type { ShapeProperties } from '../../hooks/useIntervalStats';

const row = (over: Partial<ShapeProperties>): ShapeProperties => ({
  routeId: '77', routeShortName: '77', routeLongName: 'Belmont', directionId: 0, headsign: 'A', tier: '10', headway: 10,
  ...over,
} as ShapeProperties);

describe('rowTrips (CIV-1069): a row reads its value, gap and part-period words from the same trips', () => {
  it('a headsign with no service of its own in the period reads nothing (CTA 77 Belmont & Octavia, AM peak)', () => {
    const octavia = row({ headsign: 'Belmont & Octavia', headwayByPeriod: { amPeak: 10, midday: 10 }, maxGapByPeriod: { amPeak: 180, midday: 360 }, noOwnServiceByPeriod: ['amPeak', 'midday'] });
    expect(rowTrips(octavia, 'amPeak')).toEqual({ value: null, longestGap: null, partPeriod: undefined, noOwnService: true });
    const card = routeCardRowValue(octavia, { period: 'amPeak', hoveredHour: null, stretchMode: false, noRegularService: false, maxHeadway: Infinity });
    expect(card.rowNoRegular).toBe(true);
    expect(card.headway).toBeUndefined();
  });

  it('a stretch row pairs its value with the stretch\'s gap, from the same pooled departures (Sun Metro 205)', () => {
    const main = row({
      stretchRole: 'main', stretchIndex: 0, headwayByPeriod: { midday: 15 }, maxGapByPeriod: { midday: 315 },
      stretchMeta: { main: { stops: 13, refStop: 's', trips: 58, period: { midday: 18 }, maxGap: { midday: 20 } }, tails: [] },
    });
    expect(rowTrips(main, 'midday')).toMatchObject({ value: 15, longestGap: 20 });
  });

  it('a row slower than its stretch reads one branch of it and keeps its own gap (Phoenix 35: 30 on a shared 15)', () => {
    const branch = row({
      stretchRole: 'main', stretchIndex: 0, headwayByPeriod: { midday: 30 }, maxGapByPeriod: { midday: 32 },
      stretchMeta: { main: { stops: 50, refStop: 's', trips: 67, period: { midday: 15 }, maxGap: { midday: 16 } }, tails: [] },
    });
    expect(rowTrips(branch, 'midday')).toMatchObject({ value: 30, longestGap: 32 });
  });

  it('a tail on data without its period (public: it lives in the sections file) still takes its stretch\'s gap', () => {
    const tail = row({
      stretchRole: 'tail', stretchIndex: 1, headwayByPeriod: { midday: 20 }, maxGapByPeriod: { midday: 140 },
      stretchMeta: { main: null, tails: [{ refStop: 'a', stops: 3, km: 1, trips: 9 }, { refStop: 'b', stops: 5, km: 2, trips: 30, maxGap: { midday: 24 } }] },
    });
    expect(rowTrips(tail, 'midday').longestGap).toBe(24);
  });

  it('a row without stretch data reads its own value and its own gap', () => {
    expect(rowTrips(row({ headwayByPeriod: { pmPeak: 12 }, maxGapByPeriod: { pmPeak: 14 } }), 'pmPeak')).toMatchObject({ value: 12, longestGap: 14, noOwnService: false });
  });
});
