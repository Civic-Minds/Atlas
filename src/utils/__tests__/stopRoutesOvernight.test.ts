import { describe, expect, it } from 'vitest';
import { buildStopRoutes, stopRouteBestHeadway, stopRouteLineHeadway, stopRowHeadway } from '../stopRoutes';

// CIV-1764 (DECISIONS 2026-10-31, #1267): the stop card's Overnight reads the route card's Overnight row, the Night Service
// verdict, never the stop's own 2-6 AM departures. TTC 301 Queen: Night Service every 30; the 2-6 AM window took in the gap
// before day service, so the stop read "every 71".
const night = { overnight: 30 };
const feature = (headsign: string, extra: Record<string, unknown> = {}) => ({
  type: 'Feature', geometry: { type: 'LineString', coordinates: [[0, 0], [1, 1]] },
  properties: {
    routeId: '301', routeShortName: '301', routeType: 3, day: 'Weekday', directionId: 0, headsign, serviceClass: 'regular',
    stretchRole: 'main', stretchIndex: 0, headway: 30, tier: '30',
    headwayByPeriod: { overnight: 71 }, headwayByPeriodSustained: { overnight: true },
    directionFilterHeadwayByPeriod: night, routeFilterHeadwayByPeriod: night, worstDirectionHeadwayByPeriod: night,
    routeRunsByPeriod: { overnight: true }, stretchPeriodOneGap: { overnight: false },
    nightService: true, nightService30: true,
    stopHeadways: { s1: 30 }, stopPeriodHeadways: { s1: { overnight: 71 } },
    ...extra,
  },
});
const stopCard = (features: ReturnType<typeof feature>[], period: 'overnight' | 'midday' = 'overnight') => buildStopRoutes({
  siblingIdsByAgency: { ttc: new Set(['s1']) }, routesByAgency: { ttc: new Set(['301']) },
  layers: { ttc: { type: 'FeatureCollection', features } as unknown as GeoJSON.FeatureCollection }, day: 'Weekday', period, branchReadings: true,
}).flatMap(r => r.branches);

describe('stop card Overnight reads the night verdict, as the route card does (CIV-1764)', () => {
  it('TTC 301: the stop says every 30, the Night Service number, not its own 2-6 AM every 71', () => {
    const [row] = stopCard([feature('Long Branch')]);
    expect(row.overnightCard).toBe(true);
    expect(stopRowHeadway(row, 'overnight')).toBe(30);
    expect(stopRouteBestHeadway([row], 'overnight')).toBe(30);
    expect(stopRouteLineHeadway([row], 'overnight')).toBeNull();
  });
  it('a row the Night view does not light shows no number, as on the route card', () => {
    const rows = stopCard([feature('Long Branch', { nightService: false, nightService30: false, nightService60: false })]);
    for (const row of rows) expect(stopRowHeadway(row, 'overnight')).toBeNull();
  });
  it('other periods are unchanged', () => {
    const [row] = stopCard([feature('Long Branch', { headwayByPeriod: { midday: 10 }, stopPeriodHeadways: { s1: { midday: 10 } }, routeRunsByPeriod: { midday: true } })], 'midday');
    expect(row?.overnightCard).toBeUndefined();
  });
});
