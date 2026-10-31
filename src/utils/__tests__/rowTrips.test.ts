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
      stretchRole: 'main', stretchIndex: 0, headwayByPeriod: { midday: 18 }, maxGapByPeriod: { midday: 315 },
      stretchMeta: { main: { stops: 13, refStop: 's', trips: 58, period: { midday: 18 }, maxGap: { midday: 20 } }, tails: [] },
    });
    expect(rowTrips(main, 'midday')).toMatchObject({ value: 18, longestGap: 20 });
  });

  it('a row faster than its stretch keeps its own gap (NYCT R late: 13 beside the stretch\'s 165, CIV-1074 2c)', () => {
    const r = row({
      stretchRole: 'main', stretchIndex: 0, headwayByPeriod: { late: 13 }, maxGapByPeriod: { late: 15 },
      stretchMeta: { main: { stops: 40, refStop: 's', trips: 90, period: { late: 20 }, maxGap: { late: 165 } }, tails: [] },
    });
    expect(rowTrips(r, 'late')).toMatchObject({ value: 13, longestGap: 15 });
  });

  it('a period that is not steady, off a stretch, reads its full-window wait, not the median (CIV-1074 2a)', () => {
    const r = row({ headwayByPeriod: { midday: 13 }, headwayByPeriodSustained: { midday: false }, periodCoverageHeadway: { midday: 256 }, maxGapByPeriod: { midday: 256 } });
    expect(rowTrips(r, 'midday')).toMatchObject({ value: 256, longestGap: 256 });
    expect(rowTrips({ ...r, headwayByPeriodSustained: { midday: true } } as ShapeProperties, 'midday').value).toBe(13);
  });

  it('a row unsteady on its own trips reads its stretch where the stretch runs regularly (CTA 9 Ashland & 95th midday, CIV-1074 2a)', () => {
    // GTFS: the headsign's own 8 midday trips start at 13:04; every bus on 74th-95th comes every 10 (the stretch's 177 trips).
    const main = row({
      stretchRole: 'main', stretchIndex: 0, headwayByPeriod: { midday: 13 }, headwayByPeriodSustained: { midday: false },
      periodCoverageHeadway: { midday: 256 }, maxGapByPeriod: { midday: 256 },
      stretchMeta: {
        main: { stops: 15, refStop: '6118', trips: 177, period: { midday: 10 }, maxGap: { midday: 10 }, noRegular: [] },
        tails: [{ refStop: '6049', stops: 70, km: 9, trips: 131, period: { midday: 10 }, noRegular: [] }],
      },
    });
    expect(rowTrips(main, 'midday')).toMatchObject({ value: 10, longestGap: 10 });
    // A stretch with no regular cadence in the period leaves the row its own full-window wait.
    const noRegular = { ...main, stretchMeta: { ...main.stretchMeta!, main: { ...main.stretchMeta!.main!, noRegular: ['midday'] } } } as ShapeProperties;
    expect(rowTrips(noRegular, 'midday')).toMatchObject({ value: 256, longestGap: 256 });
  });

  it('a short burst never takes the shared stretch\'s number when the rest of the stretch runs less often (SEPTA 66 PM, CIV-1074)', () => {
    // GTFS: 7 Express trips 16:48-18:19 (gaps 12-24) on a stretch with locals every 12; pooled, the stretch reads 6. The card's
    // "Shared stretch every 6" row says that; the Express row keeps its own 12 and its own gap.
    const express = row({
      stretchRole: 'main', stretchIndex: 0, headwayByPeriod: { pmPeak: 12 }, headwayByPeriodSustained: { pmPeak: false },
      periodCoverageHeadway: { pmPeak: 131 }, maxGapByPeriod: { pmPeak: 131 },
      stretchMeta: {
        main: { stops: 35, refStop: '21937', trips: 136, period: { pmPeak: 6 }, maxGap: { pmPeak: 12 }, noRegular: [] },
        tails: [{ refStop: '21910', stops: 12, km: 4, trips: 86, period: { pmPeak: 12 }, noRegular: [] }],
      },
    });
    expect(rowTrips(express, 'pmPeak')).toMatchObject({ value: 12, longestGap: 131 });
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

  describe('#1239: a main stretch\'s row reads the number at the filter\'s stop', () => {
    // AC Transit 281 AM to NewPark Mall: one destination, steady every 63 at the stretch's stop, one 66 min gap sets the filter.
    const main = (over: Partial<ShapeProperties> = {}) => row({
      stretchRole: 'main', stretchIndex: 0, headwayByPeriod: { amPeak: 60 }, maxGapByPeriod: { amPeak: 66 },
      departuresByHour: { 6: 1, 7: 1, 8: 1, 9: 1 }, stretchPeriodHeadway: { amPeak: 63 }, stretchPeriodSustained: { amPeak: true },
      stretchMeta: { main: { stops: 30, refStop: 's', trips: 4, period: { amPeak: 66 }, maxGap: { amPeak: 66 } }, tails: [] },
      ...over,
    });

    it('the stretch\'s spacing, with no gap words under 1.5 times it (281: every 63, not "with a 66 min gap")', () => {
      expect(rowTrips(main(), 'amPeak')).toMatchObject({ value: 63, partPeriod: undefined });
    });

    it('a gap at least 1.5 times the spacing goes into the words', () => {
      const r = main({ stretchPeriodHeadway: { amPeak: 42 }, stretchMeta: { main: { stops: 30, refStop: 's', trips: 4, period: { amPeak: 65 }, maxGap: { amPeak: 65 } }, tails: [] } });
      const trips = rowTrips(r, 'amPeak');
      expect(trips.value).toBe(42);
      expect(trips.partPeriod).toContain('65 min gap');
    });

    it('a row whose trips are only some of the stretch\'s keeps its own (SEPTA 19 Saturday midday: 120 on a stretch every 63)', () => {
      const r = main({ headwayByPeriod: { amPeak: 120 }, stretchPeriodHeadway: { amPeak: 63 }, stretchMeta: { main: { stops: 30, refStop: 's', trips: 8, period: { amPeak: 63 }, maxGap: { amPeak: 66 } }, tails: [] } });
      expect(rowTrips(r, 'amPeak').value).toBe(120);
    });

    it('a late start or early end keeps its own reading (A2), and the pooling reads the row\'s own trips', () => {
      expect(rowTrips(main({ stretchPeriodEdge: { amPeak: { from: 480, every: 63 } } }), 'amPeak').value).toBe(60);
      expect(rowTrips(main(), 'amPeak', { ownTrips: true }).value).toBe(60);
    });
  });
});
