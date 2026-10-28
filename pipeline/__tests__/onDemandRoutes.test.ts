import { describe, expect, it } from 'vitest';
import { applyOnDemandRoutes } from '../onDemandRoutes';

// #1119: WVU PRT's feed timetable is a placeholder (every 30 on paper; the PRT runs on demand).
const feature = (routeShortName: string) => ({
  properties: {
    routeId: routeShortName, routeShortName, day: 'Weekday', directionId: 0, headsign: 'HSC', tier: '30', serviceClass: 'regular',
    headway: 30, headwayByPeriod: { midday: 30 }, maxGapByPeriod: { midday: 30 }, periodCoverageHeadway: { midday: 30 },
    headwayByHour: { 9: 30 }, stopHeadways: { s1: 30 }, stopTiers: { s1: '30' }, routeFilterHeadwayByPeriod: { midday: 30 },
    directionFilterHeadwayByPeriod: { midday: 30 }, worstDirectionHeadway: 30, nightService: false, researchFrequentService: { daytime30: true },
    stretchPeriodHeadway: { midday: 30 }, stretchMeta: { main: { stops: 5, refStop: 's3', trips: 32, period: { midday: 30 }, noRegular: [] }, tails: [] },
    stopOrder: ['s1', 's2'], stopPositions: [0, 1], routeType: 0, routeColor: null, stretchRole: 'main', stretchIndex: 0,
  } as Record<string, unknown>,
});

describe('routes listed as running on demand (#1119)', () => {
  it('publish no timetable values: limited, irregular, flagged, and no running times', () => {
    const prt = feature('PRT');
    const runningTimes: Record<string, unknown> = { 'PRT::0::Weekday': { h: { 9: 15 } }, 'X::0::Weekday': { h: { 9: 12 } } };
    expect(applyOnDemandRoutes([prt], runningTimes, ['PRT'])).toBe(1);
    const p = prt.properties;
    expect(JSON.stringify(p)).not.toMatch(/\b30\b/);
    expect(p).toMatchObject({ headway: null, tier: 'span', serviceClass: 'irregular', onDemand: true, stopOrder: ['s1', 's2'], routeType: 0 });
    expect(p.stretchMeta).toEqual({ main: { stops: 5, refStop: 's3' }, tails: [] });
    expect(Object.keys(runningTimes)).toEqual(['X::0::Weekday']);
  });

  it('leaves every other route, stop points, and agencies without a list unchanged', () => {
    const other = feature('7');
    const before = JSON.stringify(other);
    expect(applyOnDemandRoutes([other, { properties: { stopId: '1', routeShortName: 'PRT' } }], {}, ['PRT'])).toBe(0);
    expect(JSON.stringify(other)).toBe(before);
    expect(applyOnDemandRoutes([feature('PRT')], {}, undefined)).toBe(0);
  });
});
