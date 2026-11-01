import { describe, expect, it } from 'vitest';
import { buildStopRoutes, headlineStandIn, stopRouteBestHeadway, stopRouteLineHeadway, stopRowHeadway, type StopBranch } from '../stopRoutes';
import ttc29json from './fixtures/ttc-29-weekday.json';
import { stopRoutePeriodBit } from '../../../shared/stopRoutePeriods';

// Properties only (no geometry): the stop card reads none.
const ttc29 = ttc29json as unknown as GeoJSON.FeatureCollection;

// CIV-997 / CIV-918: the stop card never states a destination as more frequent than it is.
const branch = (atStop: number | null, own: number | null, extra: Partial<StopBranch> = {}): StopBranch => ({
  rKey: 'ttc::504',
  headsign: 'Broadview',
  directionId: 0,
  service: { value: atStop, byPeriod: { midday: atStop }, provenance: 'stop-specific' } as StopBranch['service'],
  rowHeadway: own,
  ...extra,
});

describe('stopRowHeadway: never overstate', () => {
  it("uses the branch's own value when the stop's pooled value is more frequent (504A and 504B at King and Bay)", () => {
    expect(stopRowHeadway(branch(5, 10), 'midday')).toBe(10);
  });

  it("uses the stop's value when the branch's route-wide value counts trips that don't reach this stop (503 to Victoria Park)", () => {
    expect(stopRowHeadway(branch(10, 6), 'midday')).toBe(10);
  });

  it('falls back to whichever value exists', () => {
    expect(stopRowHeadway(branch(12, null), 'midday')).toBe(12);
    expect(stopRowHeadway(branch(null, 15), 'midday')).toBe(15);
  });

  it('shows words, not a number, for a part-period row', () => {
    expect(stopRowHeadway(branch(5, 10, { periodText: 'every 12 min until 9:37 AM' }), 'midday')).toBeNull();
  });
});

describe('headlineStandIn (CIV-1204)', () => {
  it("never stands a headline in where its window has no regular cadence (CAT 14 to Transfer Center: 315)", () => {
    expect(headlineStandIn({ headway: 315, headlineNoRegular: true })).toBeNull();
  });
  it('keeps the headline as the stand-in otherwise', () => {
    expect(headlineStandIn({ headway: 30 })).toBe(30);
    expect(headlineStandIn({ headway: null })).toBeNull();
  });
});

describe('stopRouteLineHeadway', () => {
  it("shows the stop's value on the route line only where it beats every destination row", () => {
    expect(stopRouteLineHeadway([branch(5, 10), branch(5, 10, { headsign: 'Distillery' })], 'midday')).toBe(5);
    expect(stopRouteLineHeadway([branch(5, 10), branch(5, 5, { headsign: 'Distillery' })], 'midday')).toBeNull();
  });
});

describe('stopRouteBestHeadway', () => {
  it("orders routes by the stop's best value", () => {
    expect(stopRouteBestHeadway([branch(12, 20), branch(8, 10)], 'midday')).toBe(8);
    expect(stopRouteBestHeadway([branch(null, 20)], 'midday')).toBeNull();
  });
});

// CIV-1080: TTC 29's two northbound patterns (from either Exhibition loop) both go to Wilson, each every 16. At the
// Wilson stop the bus comes every 8 (the GTFS: 45 midday departures, a median gap of 8), so the one "to Wilson" row says 8.
describe('buildStopRoutes: one destination served by two patterns (CIV-1080)', () => {
  const rows = (fc: GeoJSON.FeatureCollection, period: 'midday' | 'all') => buildStopRoutes({
    siblingIdsByAgency: { ttc: new Set(['2108']) }, routesByAgency: { ttc: new Set(['29']) }, layers: { ttc: fc }, day: 'Weekday', period,
  })[0].branches.filter(b => b.directionId === 1).map(b => [b.headsign, stopRowHeadway(b, period)]);

  it("reads the stop's own value when every trip of the direction there goes to that destination", () => {
    expect(rows(ttc29, 'midday')).toEqual([['Wilson', 8]]);
    expect(rows(ttc29, 'all')).toEqual([['Wilson', 8]]);
  });

  it('#1228: shows the part-period words only where the route card\'s row has them (rowTrips)', () => {
    const fc = structuredClone(ttc29);
    for (const f of fc.features.filter(x => x.properties?.directionId === 1)) {
      Object.assign(f.properties!, { stretchRole: 'main', stretchPeriodEdge: { midday: { from: 754, every: 8 } } });
      delete (f.properties!.directionFilterHeadwayByPeriod as Record<string, unknown> | undefined)?.midday;
    }
    const words = () => buildStopRoutes({
      siblingIdsByAgency: { ttc: new Set(['2108']) }, routesByAgency: { ttc: new Set(['29']) }, layers: { ttc: fc }, day: 'Weekday', period: 'midday',
    })[0]?.branches.filter(b => b.directionId === 1).map(b => b.periodText) ?? [];
    expect(words()).toEqual(['every 8 min from 12:34 PM']);
    // No trips of its own in the period: the card's row has no words, so neither does the stop card (TTC 100 to Pape, overnight).
    for (const f of fc.features.filter(x => x.properties?.directionId === 1)) f.properties!.noOwnServiceByPeriod = ['midday'];
    expect(words()).toEqual([]);
  });

  it('#1276: a tail covering the edge\'s stretch shows its words; a row that does not cover it shows none, as on the route card', () => {
    const fc = structuredClone(ttc29);
    const setCovers = (covers: ('main' | number)[]) => {
      for (const f of fc.features.filter(x => x.properties?.directionId === 1)) {
        Object.assign(f.properties!, { stretchRole: 'tail', stretchIndex: 0, stretchCovers: covers, stretchPeriodEdge: { midday: { from: 754, every: 8, stretch: 0 } } });
        delete (f.properties!.directionFilterHeadwayByPeriod as Record<string, unknown> | undefined)?.midday;
      }
    };
    const words = () => buildStopRoutes({
      siblingIdsByAgency: { ttc: new Set(['2108']) }, routesByAgency: { ttc: new Set(['29']) }, layers: { ttc: fc }, day: 'Weekday', period: 'midday',
    })[0]?.branches.filter(b => b.directionId === 1).map(b => b.periodText) ?? [];
    setCovers(['main', 0]);
    expect(words()).toEqual(['every 8 min from 12:34 PM']);
    setCovers(['main']);
    expect(words().filter(Boolean)).toEqual([]);
  });

  it('CIV-1251 row 8: a stop on the shared stretch carries the shared stretch\'s own time for its Shared stretch row', () => {
    const fc = structuredClone(ttc29);
    const north = fc.features.filter(x => x.properties?.directionId === 1);
    north.forEach((f, i) => Object.assign(f.properties!, {
      headsign: i === 0 ? 'Wilson' : 'Downsview', stretchRole: 'tail', stretchIndex: i, stretchCovers: ['main', i],
      stretchMeta: { main: { stops: 10, refStop: 'm', trips: 50, edge: { midday: { from: 754, every: 8 } } }, tails: [{ refStop: 'a', stops: 3, km: 1, trips: 20 }, { refStop: 'b', stops: 3, km: 1, trips: 20 }] },
    }));
    const routes = buildStopRoutes({
      siblingIdsByAgency: { ttc: new Set(['2108']) }, routesByAgency: { ttc: new Set(['29']) }, layers: { ttc: fc }, day: 'Weekday', period: 'midday',
    });
    const shared = routes[0]?.branches.filter(b => b.directionId === 1).map(b => b.sharedEdge);
    expect(shared?.length).toBeGreaterThan(0);
    shared?.forEach(edge => expect(edge).toEqual({ text: 'every 8 min from 12:34 PM', every: 8 }));
  });

  it('#1277: a branch that does not run through the period never reads the shared stretch\'s time (TTC 131 Sunday late, Old Finch)', () => {
    const fc = structuredClone(ttc29);
    for (const f of fc.features.filter(x => x.properties?.directionId === 1)) {
      Object.assign(f.properties!, {
        stretchRole: 'tail', stretchIndex: 0, stretchCovers: ['main', 0], departuresByHour: { 12: 4 },
        stretchMeta: { main: { stops: 10, refStop: 'm', trips: 50 }, tails: [{ refStop: 't', stops: 5, km: 2, trips: 20, notThrough: ['midday'] }] },
        stretchPeriodEdge: { midday: { from: 754, every: 8, stretch: 'main' } },
      });
      delete (f.properties!.directionFilterHeadwayByPeriod as Record<string, unknown> | undefined)?.midday;
    }
    const words = () => buildStopRoutes({
      siblingIdsByAgency: { ttc: new Set(['2108']) }, routesByAgency: { ttc: new Set(['29']) }, layers: { ttc: fc }, day: 'Weekday', period: 'midday',
    })[0]?.branches.filter(b => b.directionId === 1).map(b => b.periodText) ?? [];
    expect(words().filter(Boolean)).toEqual([]);
    // Its own branch's edge, with its own trips in the period: the words are its own.
    for (const f of fc.features.filter(x => x.properties?.directionId === 1)) f.properties!.stretchPeriodEdge = { midday: { from: 754, every: 8, stretch: 0 } };
    expect(words()).toEqual(['every 8 min from 12:34 PM']);
  });

  it('keeps each destination\'s own value when another destination shares the stop (never overstates)', () => {
    const fc = structuredClone(ttc29);
    const north = fc.features.filter(f => f.properties?.directionId === 1);
    north[0].properties!.headsign = 'Lawrence West';
    expect(rows(fc, 'midday').map(([, hw]) => hw)).toEqual([16, 16]);
  });
});

describe('buildStopRoutes: a stop\'s own route with no trips in the period (CIV-1052)', () => {
  // MiWay 314 at stop 0814 (#1169): one 08:20 school trip on weekdays, none at midday.
  const miway314 = {
    type: 'Feature', geometry: null,
    properties: { routeId: '314', routeShortName: '314', routeLongName: 'Rick Hansen', day: 'Weekday', directionId: 0, headsign: 'School', tier: 'span' },
  };
  const layer = { type: 'FeatureCollection', features: [...ttc29.features, miway314] } as unknown as GeoJSON.FeatureCollection;
  const amPeakWeekday = 1;
  const build = (period: 'amPeak' | 'midday' | 'all', bits: Array<number | undefined>, routeIds = ['314']) => buildStopRoutes({
    siblingIdsByAgency: { ttc: new Set(['2108']) },
    routesByAgency: { ttc: new Set(routeIds) },
    routePeriodBitsByAgency: { ttc: new Map(routeIds.map(rid => [rid, bits])) },
    layers: { ttc: layer }, day: 'Weekday', period,
  });

  it('lists the route with no rows where every stop point proves no trip in the period', () => {
    const idle = build('midday', [amPeakWeekday]);
    expect(idle.map(r => [r.shortName, r.branches.length, r.noTrips?.rKey != null])).toEqual([['314', 0, true]]);
  });

  it('leaves it out (as before) where it has a trip in the period, the data has no field, or the period is All day', () => {
    expect(build('amPeak', [amPeakWeekday])).toEqual([]);
    expect(build('midday', [undefined])).toEqual([]);
    expect(build('midday', [0, undefined])).toEqual([]);
    expect(build('all', [0])).toEqual([]);
  });

  it('never lists a route that runs here as idle', () => {
    const rows = build('midday', [0], ['29']);
    expect(rows.map(r => [r.shortName, r.noTrips])).toEqual([['29', undefined]]);
  });
});

describe('buildStopRoutes: a stop\'s own route with trips here but no number in the period (#1278)', () => {
  // TTC 110 on Sunday, AM peak (published 2026-11-01): first trip 7:52, a direction value in the period, but the route
  // reads as not running (no filter value), so it had no stop row and the stop card left it out.
  const ttc110 = (directionId: number, headsign: string) => ({
    type: 'Feature', geometry: null,
    properties: {
      routeId: '110', routeShortName: '110', routeLongName: 'Islington South', day: 'Sunday', directionId, headsign, tier: '30',
      headwayByPeriod: { amPeak: 15, midday: 30 },
      routeFilterHeadwayByPeriod: { amPeak: null, midday: 30 }, routeRunsByPeriod: { amPeak: false, midday: true },
      departuresByHour: { 7: 1, 8: 2, 9: 2, 10: 2 }, headwayByHour: { 7: 15, 8: 30, 9: 30, 10: 30 }, maxGapByHour: { 7: 30, 8: 30, 9: 30, 10: 30 },
    },
  });
  const layer = { type: 'FeatureCollection', features: [ttc110(0, 'Kipling and Lake Shore'), ttc110(1, 'Islington')] } as unknown as GeoJSON.FeatureCollection;
  const sundayAm = stopRoutePeriodBit('Sunday', 'amPeak');
  const build = (bits: Array<number | undefined>) => buildStopRoutes({
    siblingIdsByAgency: { ttc: new Set(['2713']) },
    routesByAgency: { ttc: new Set(['110']) },
    routePeriodBitsByAgency: { ttc: new Map([['110', bits]]) },
    layers: { ttc: layer }, day: 'Sunday', period: 'amPeak',
  });
  const plain = (text: string | undefined) => text?.replaceAll('\u2060', '').replace(/[\u00a0\u202f]/g, ' ');

  it('lists the route with the route card\'s own words for the period', () => {
    const rows = build([sundayAm]);
    expect(rows.map(r => [r.shortName, r.branches.length, r.noTrips])).toEqual([['110', 0, undefined]]);
    expect(plain(rows[0].noNumber?.text)).toBe('Runs only from 7–9 AM');
  });

  it('leaves it out where the stop has no trip in the period, or the data has no field', () => {
    expect(build([undefined])).toEqual([]);
    expect(build([0]).map(r => [r.shortName, r.noNumber, r.noTrips != null])).toEqual([['110', undefined, true]]);
  });
});
