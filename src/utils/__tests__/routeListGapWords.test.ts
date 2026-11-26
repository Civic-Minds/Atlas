import { describe, expect, it } from 'vitest';
import { routeCardRange } from '../routeListRange';
import { headwayPeriodShape, periodShapeGap } from '../../../shared/headwayText';
import type { ShapeProperties } from '../../hooks/useIntervalStats';
import septa53json from './fixtures/septa-53-saturday.json';

// SEPTA 53, Saturday (release-mwvbser2; per-stop fields left out). In the AM peak one direction reads "every 30 min, with one
// 59 min gap" and the other "every 30 min, with one 60 min gap"; the list said only "every 30 min" (#1856).
const septa53 = (septa53json as unknown as GeoJSON.FeatureCollection).features.map(f => f.properties as unknown as ShapeProperties);

describe('a route list keeps the gap words its rows differ in (#1856)', () => {
  it('SEPTA 53 Saturday AM peak says the longest gap', () => {
    expect(routeCardRange(septa53, 'amPeak')).toMatchObject({ high: 30, words: 'every 30 min, with one 60 min gap', range: false });
  });
  it('reads the gap back from the words headwayPeriodShape writes, and nothing from other words', () => {
    expect(periodShapeGap(headwayPeriodShape({ every: 30, gap: 59 }))).toBe(59);
    expect(periodShapeGap(headwayPeriodShape({ every: 9, from: '7:12 AM' }))).toBeNull();
    expect(periodShapeGap(headwayPeriodShape({ every: 15, until: '8:57 PM', then: 25, thenGap: 37 }))).toBeNull();
  });
});
