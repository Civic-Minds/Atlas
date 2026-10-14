import { describe, expect, it } from 'vitest';
import { normalizeRouteFilterFeatures } from '../../../shared/routeHeadwayFilter';
import { routeCardDisplayHeadway, routeListDisplay, routeListDisplayHeadway } from '../effectiveHeadway';
import type { ShapeProperties } from '../../hooks/useIntervalStats';
import fixtures from './fixtures/bunched-period-weekday.json';

// Weekday rows from published artifacts (stop-level fields trimmed).
function rows(key: keyof typeof fixtures): ShapeProperties[] {
  const features = (fixtures[key] as unknown[]).map(p => ({ properties: structuredClone(p) as unknown as Record<string, unknown> }));
  normalizeRouteFilterFeatures(features);
  return features.map(f => f.properties as unknown as ShapeProperties);
}

describe('bunched trips never set a cadence (#826)', () => {
  it('LANTA 410: four school trips in one AM hour are not "every 4 min"', () => {
    const route = rows('lanta410');
    const dieruff = route.find(p => p.headsign === 'Dieruff High School')!;
    expect(routeCardDisplayHeadway(dieruff, 'amPeak')).toBeNull();
    expect(routeListDisplay(route, 'amPeak')).toEqual({ headway: null, limited: true });
  });

  it('Dutchess J MS: the hourly pattern speaks, not the 2 min pairs', () => {
    const route = rows('dutchessJMS');
    expect(routeListDisplayHeadway(route, 'amPeak')).toBe(60);
    // Midday has a typical-gap range, so the paired-trip coverage floor (#761) applies.
    expect(routeListDisplayHeadway(route, 'midday')).toBe(58);
  });

  it('keeps dense service that runs the whole period (Metromover evening, STM 51 AM)', () => {
    expect(routeListDisplayHeadway(rows('metromoverInner'), 'evening')).toBe(3);
    expect(routeListDisplayHeadway(rows('stm51'), 'amPeak')).toBe(5);
  });

  it('keeps service that starts late in the period and runs on after it (Sunday AM)', () => {
    const lateStart = {
      routeId: 'S', routeShortName: 'S', directionId: 0, tier: '15', headway: 15,
      headwayByPeriod: { amPeak: 15, midday: 15 },
      headwayByPeriodSustained: { amPeak: false, midday: true },
      periodCoverageHeadway: { amPeak: 130, midday: 16 },
      headwayByHour: { 8: 15, 9: 15, 10: 15 },
    } as unknown as ShapeProperties;
    expect(routeCardDisplayHeadway(lateStart, 'amPeak')).toBe(15);
    // The same hour with nothing after it is a bunch at the end of the period.
    const tail = { ...lateStart, headwayByHour: { 8: 15 } } as unknown as ShapeProperties;
    expect(routeCardDisplayHeadway(tail, 'amPeak')).toBeNull();
  });
});

describe('steady infrequent-tier patterns keep their cadence (#826)', () => {
  it('TTC 927 weekday evening: every 10 from the real pattern, not limited or a 19:00 spill', async () => {
    const { default: ttc927 } = await import('./fixtures/ttc-927-weekday.json');
    const features = (ttc927 as unknown[]).map(p => ({ properties: structuredClone(p) as unknown as Record<string, unknown> }));
    normalizeRouteFilterFeatures(features);
    const route = features.map(f => f.properties as unknown as ShapeProperties);
    const humber = route.find(p => p.headsign === 'Kipling via Humber College')!;
    expect(routeCardDisplayHeadway(humber, 'evening')).toBe(10);
    expect(routeListDisplayHeadway(route, 'evening')).toBe(10);
  });

  it('still hides an infrequent row with a real hole inside an hour', () => {
    const holed = {
      routeId: 'H', routeShortName: 'H', directionId: 0, tier: 'infrequent', headway: 10,
      headwayByPeriod: { evening: 10 }, headwayByPeriodSustained: { evening: true },
      maxGapByPeriod: { evening: 45 }, periodCoverageHeadway: { evening: 45 },
      headwayByHour: { 19: 10, 20: 10, 21: 10, 22: 10 },
      maxGapByHour: { 19: 10, 20: 45, 21: 10, 22: 10 },
    } as unknown as ShapeProperties;
    expect(routeCardDisplayHeadway(holed, 'evening')).toBeNull();
  });
});
