import { describe, expect, it } from 'vitest';
import { frequentRouteCount, STORY_DAYTIME_PERIODS } from '../frequentDayCounts';
import { normalizeRouteFilterFeatures } from '../routeHeadwayFilter';
import { routeFeaturePassesMapFilter } from '../routeTileFilter';

type Waits = { amPeak: number | null; midday: number | null; pmPeak: number | null };
/** One direction's row, with the same wait for its typical value and its coverage. */
function row(routeId: string, day: string, directionId: number, waits: Waits, extra: { isCorridor?: boolean; routeBranch?: string } = {}) {
  return { properties: { routeId, day, directionId, tier: '15', headwayByPeriod: { ...waits }, periodCoverageHeadway: { ...waits }, ...extra } };
}
const every = (n: number): Waits => ({ amPeak: n, midday: n, pmPeak: n });

function fixture() {
  const features = [
    // A: every 10 all day, both directions, weekday and Sunday.
    row('A', 'Weekday', 0, every(10)), row('A', 'Weekday', 1, every(10)),
    row('A', 'Sunday', 0, every(10)), row('A', 'Sunday', 1, every(10)),
    // B: frequent on weekdays; on Sunday 6–9 AM it is every 30.
    row('B', 'Weekday', 0, every(12)), row('B', 'Weekday', 1, every(12)),
    row('B', 'Sunday', 0, { amPeak: 30, midday: 12, pmPeak: 12 }), row('B', 'Sunday', 1, { amPeak: 30, midday: 12, pmPeak: 12 }),
    // C: one direction every 10, the other every 20: the worst direction decides.
    row('C', 'Weekday', 0, every(10)), row('C', 'Weekday', 1, every(20)),
    // D: a corridor row is never a route.
    row('D', 'Weekday', 0, every(5), { isCorridor: true }),
    // E: two branches of one route are two routes on the map.
    row('E', 'Weekday', 0, every(15), { routeBranch: 'north' }), row('E', 'Weekday', 0, every(15), { routeBranch: 'south' }),
  ];
  normalizeRouteFilterFeatures(features);
  return features;
}

describe('frequentRouteCount (CIV-1603)', () => {
  it('counts a route once when the map draws it in every daytime period, the worst direction deciding', () => {
    const features = fixture();
    // A, B, both branches of E; C fails on its slow direction, D is a corridor.
    expect(frequentRouteCount(features, 'x', 'Weekday', 15)).toBe(4);
    expect(frequentRouteCount(features, 'x', 'Weekday', 30)).toBe(5);
    expect(frequentRouteCount(features, 'x', 'Weekday', 10)).toBe(1);
  });

  it('reads only the day asked for, and every period it is given', () => {
    const features = fixture();
    expect(frequentRouteCount(features, 'x', 'Sunday', 15)).toBe(1);
    expect(frequentRouteCount(features, 'x', 'Sunday', 15, ['midday'])).toBe(2);
    expect(frequentRouteCount(features, 'x', 'Sunday', 30)).toBe(2);
    expect(frequentRouteCount(features, 'x', 'Saturday', 30)).toBe(0);
  });

  it('agrees with the map filter period by period', () => {
    const features = fixture();
    for (const period of STORY_DAYTIME_PERIODS) {
      const drawn = new Set(features
        .filter(f => !f.properties.isCorridor && routeFeaturePassesMapFilter(f.properties, { agencies: new Set(['x']), day: 'Weekday', modes: new Set(), period, maxHeadway: 15 }, 'x'))
        .map(f => `${f.properties.routeId}:${f.properties.routeBranch ?? ''}`));
      expect(frequentRouteCount(features, 'x', 'Weekday', 15, [period])).toBe(drawn.size);
    }
  });
});
