import { describe, expect, it } from 'vitest';
import { normalizeRouteFilterFeatures } from '../../../shared/routeHeadwayFilter';
import { routeListDisplay, routeListDisplayHeadway } from '../effectiveHeadway';
import type { ShapeProperties } from '../../hooks/useIntervalStats';
import go47Rows from './fixtures/go-47-weekday.json';

// GO 47 weekday rows from the published artifact (stop-level fields trimmed).
function go47(): ShapeProperties[] {
  const features = (go47Rows as unknown as ShapeProperties[]).map(p => ({ properties: structuredClone(p) as unknown as Record<string, unknown> }));
  normalizeRouteFilterFeatures(features);
  return features.map(f => f.properties as unknown as ShapeProperties);
}

const row = (overrides: Partial<ShapeProperties>): ShapeProperties => ({
  routeId: 'R', routeShortName: 'R', directionId: 0, tier: '15', headway: 15,
  ...overrides,
} as ShapeProperties);

describe('route lists show the slower direction (#821)', () => {
  it('GO 47: no "every 3 min" from the peak-direction cluster when the other direction barely runs', () => {
    const rows = go47();
    // Hamilton-bound runs a dense AM cluster; 407-bound has one AM trip, so there is no cadence.
    expect(routeListDisplay(rows, 'amPeak')).toEqual({ headway: null, limited: true });
    // Midday and PM: the opposite direction runs a few trips with no cadence of its own.
    expect(routeListDisplay(rows, 'midday')).toEqual({ headway: null, limited: true });
    expect(routeListDisplay(rows, 'pmPeak')).toEqual({ headway: null, limited: true });
    // Evening: Hamilton-bound has no trips at all, so the 407-bound cadence stands.
    expect(routeListDisplayHeadway(rows, 'evening')).toBe(28);
  });

  it('takes the slower direction, not the faster one', () => {
    const outbound = row({ directionId: 0, headwayByPeriod: { amPeak: 6 } });
    const inbound = row({ directionId: 1, headwayByPeriod: { amPeak: 11 } });
    expect(routeListDisplayHeadway([outbound, inbound], 'amPeak')).toBe(11);
  });

  it('keeps the best branch within a direction, so a short-turn never hides the main pattern (#708)', () => {
    const main = row({ directionId: 0, headwayByPeriod: { midday: 10 } });
    const shortTurn = row({ directionId: 0, headwayByPeriod: { midday: 40 } });
    const inbound = row({ directionId: 1, headwayByPeriod: { midday: 12 } });
    expect(routeListDisplayHeadway([main, shortTurn, inbound], 'midday')).toBe(12);
  });

  it('skips a direction with no trips in the period (one-way peak service)', () => {
    const peakIn = row({ directionId: 0, headwayByPeriod: { amPeak: 10, pmPeak: null }, periodCoverageHeadway: { amPeak: 12 } });
    const peakOut = row({ directionId: 1, headwayByPeriod: { amPeak: null, pmPeak: 10 }, periodCoverageHeadway: { pmPeak: 12 } });
    expect(routeListDisplayHeadway([peakIn, peakOut], 'amPeak')).toBe(10);
    expect(routeListDisplayHeadway([peakIn, peakOut], 'pmPeak')).toBe(10);
  });

  it('skips a direction whose only trips in the period are span patterns', () => {
    const regular = row({ directionId: 0, headwayByPeriod: { amPeak: 30 }, periodCoverageHeadway: { amPeak: 31 } });
    const span = row({ directionId: 1, tier: 'span', headwayByPeriod: { amPeak: 30 }, periodCoverageHeadway: { amPeak: 31 } });
    expect(routeListDisplayHeadway([regular, span], 'amPeak')).toBe(30);
  });
});

describe('steady infrequent-tier rows in route lists (#821)', () => {
  const steady = (maxGap: number, sustained = true) => row({
    directionId: 1, tier: 'infrequent',
    headwayByPeriod: { midday: 10 }, headwayByPeriodSustained: { midday: sustained },
    maxGapByPeriod: { midday: maxGap }, periodCoverageHeadway: { midday: maxGap },
  });
  const other = row({ directionId: 0, headwayByPeriod: { midday: 8 }, periodCoverageHeadway: { midday: 9 } });

  it('keeps the median of a steady row whose longest gap is 30 min or less (TransLink 99 B-Line)', () => {
    expect(routeListDisplayHeadway([other, steady(30)], 'midday')).toBe(10);
  });

  it('stays limited past 30 min or when the period is not steady', () => {
    expect(routeListDisplay([other, steady(31)], 'midday')).toEqual({ headway: null, limited: true });
    expect(routeListDisplay([other, steady(20, false)], 'midday')).toEqual({ headway: null, limited: true });
  });
});
