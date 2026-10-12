import { describe, expect, it } from 'vitest';
import { buildSharedStopIndex, getPooledStop, hasPooledStop, oppositeSharedStops, pairOppositeStop } from '../sharedStops';

// CIV-82 read helpers. Pooled values live once per route/direction/day on a carrier feature;
// a feature reads them only on its own shared stretches and only where they beat its own.

const own = {
  routeId: '29', directionId: 0, day: 'Weekday',
  stopOrder: ['a', 'b', 'c', 'tail'],
  stopHeadways: { a: 16, b: 16, c: 16, tail: 16 },
  stopPeriodHeadways: { a: { amPeak: 16, midday: 16 }, b: { amPeak: 16, midday: 16 }, c: { amPeak: 16, midday: 7 }, tail: { amPeak: 16 } },
  stopPeriodCoverageHeadways: { a: { amPeak: 20, midday: 18 }, b: { amPeak: 20, midday: 18 }, c: { amPeak: 10, midday: 18 } },
};
const carrier = {
  ...own,
  sharedStretches: [{ from: 0, to: 2, with: ['29C'] }],
  sharedStops: {
    a: { headway: 8, periods: [8, 8], coverage: [10, 9] },
    b: { headway: 8, periods: [8, 8], coverage: [10], unsustained: ['midday'] },
    c: { headway: 8, periods: [8, 8], coverage: [12, 9] },
    tail: { headway: 8 },
  },
};
const sibling = { ...own, sharedStretches: [{ from: 0, to: 1, with: ['29A'] }] };
const otherDay = { ...own, day: 'Saturday', sharedStretches: [{ from: 0, to: 2, with: [] }] };
const index = buildSharedStopIndex([{ properties: carrier }, { properties: sibling }, { properties: otherDay }]);

describe('getPooledStop', () => {
  it('returns pooled values on the feature\'s own stretch, read from the group carrier', () => {
    expect(getPooledStop(index, carrier, 'a', 'headway')).toBe(8);
    expect(getPooledStop(index, sibling, 'b', 'median:midday')).toBe(8);
    expect(getPooledStop(index, { properties: sibling }, 'a', 'median:amPeak')).toBe(8);
  });

  it('returns undefined off the feature\'s stretches and in other groups', () => {
    expect(getPooledStop(index, sibling, 'c', 'headway')).toBeUndefined(); // c is outside sibling's stretch
    expect(getPooledStop(index, carrier, 'tail', 'headway')).toBeUndefined(); // tail is outside the stretch
    expect(getPooledStop(index, otherDay, 'a', 'headway')).toBeUndefined(); // no Saturday block
    expect(getPooledStop(index, own, 'a', 'headway')).toBeUndefined(); // no stretches at all
  });

  it('never returns a value that is not strictly lower than the feature\'s own', () => {
    // c midday: own 7, pooled 8.
    expect(getPooledStop(index, carrier, 'c', 'median:midday')).toBeUndefined();
    // c amPeak coverage: own 10, pooled 12.
    expect(getPooledStop(index, carrier, 'c', 'median:amPeak')).toBe(8);
    expect(getPooledStop(index, carrier, 'c', 'coverage:amPeak')).toBeUndefined();
    // Missing array entries (trimmed tail) mean nothing published.
    expect(getPooledStop(index, carrier, 'b', 'coverage:midday')).toBeUndefined();
    expect(getPooledStop(index, carrier, 'a', 'median:evening')).toBeUndefined();
  });

  it('gives coverage and the sustained flag only with an applying median', () => {
    expect(getPooledStop(index, carrier, 'a', 'coverage:midday')).toBe(9);
    expect(getPooledStop(index, carrier, 'a', 'sustained:midday')).toBe(true);
    expect(getPooledStop(index, carrier, 'b', 'sustained:midday')).toBe(false);
    expect(getPooledStop(index, carrier, 'c', 'sustained:midday')).toBeUndefined();
    // Never worse on the flag: a feature whose own period is sustained reads undefined (its own).
    const ownSustained = { ...carrier, headwayByPeriodSustained: { midday: true } };
    expect(getPooledStop(index, ownSustained, 'b', 'sustained:midday')).toBeUndefined();
    expect(getPooledStop(index, ownSustained, 'a', 'sustained:midday')).toBe(true);
    expect(hasPooledStop(index, carrier, 'c')).toBe(true);
    expect(hasPooledStop(index, carrier, 'tail')).toBe(false);
  });
});

describe('pairOppositeStop', () => {
  // TTC 29 Dufferin, 2026-10 feed: the two directions stop at Dufferin St at Bloor St West
  // under separate stop ids (2013 and 2020, about 30 m apart across the street); College St
  // is the next stop pair along the route (2033/2034). nb-far is a made-up stop 1.5 km away.
  const coords = new Map([
    ['2013', { lat: 43.659958, lon: -79.435506 }],
    ['2020', { lat: 43.660199, lon: -79.435337 }],
    ['2033', { lat: 43.652873, lon: -79.43258 }],
    ['2034', { lat: 43.652658, lon: -79.432662 }],
    ['nb-far', { lat: 43.67, lon: -79.44 }],
  ]);

  it('pairs the stop across the street, not the next one along the route', () => {
    expect(pairOppositeStop('2013', ['2033', '2020', 'nb-far'], coords)).toBe('2020');
    expect(pairOppositeStop('2034', ['2020', '2033'], coords)).toBe('2033');
  });

  it('prefers the same stop, then the same parent station', () => {
    expect(pairOppositeStop('shared', ['x', 'shared'], coords)).toBe('shared');
    const parents = new Map([['platform-s', 'station'], ['platform-n', 'station']]);
    expect(pairOppositeStop('platform-s', ['2020', 'platform-n'], coords, parents)).toBe('platform-n');
  });

  it('returns null when nothing is within 300 m', () => {
    expect(pairOppositeStop('2013', ['nb-far'], coords)).toBeNull();
    expect(pairOppositeStop('unknown', ['nb-far'], coords)).toBeNull();
  });
});

describe('oppositeSharedStops', () => {
  const line = (directionId: number, stopOrder: string[], extra: Record<string, unknown> = {}) =>
    ({ properties: { routeId: '29', day: 'Weekday', directionId, stopOrder, ...extra } });

  it('uses only the opposite direction\'s shared-stretch stops, so no pairing across a branch point', () => {
    const features = [
      line(0, ['a', 'b', 'c']),
      line(1, ['x', 'c2', 'b2', 'a2'], { sharedStretches: [{ from: 1, to: 3, with: [] }] }),
      line(1, ['y', 'c2', 'b2', 'a2'], { sharedStretches: [{ from: 1, to: 3, with: [] }] }),
    ];
    expect(oppositeSharedStops(features, features[0]).sort()).toEqual(['a2', 'b2', 'c2']);
  });

  it('uses every stop of a single unpooled opposite pattern (no branch point there)', () => {
    const features = [line(0, ['a', 'b'], { sharedStretches: [{ from: 0, to: 1, with: [] }] }), line(1, ['b2', 'a2'])];
    expect(oppositeSharedStops(features, features[0])).toEqual(['b2', 'a2']);
  });

  it('gives no candidates when several opposite patterns share nothing', () => {
    const features = [line(0, ['a', 'b']), line(1, ['b2', 'x']), line(1, ['b2', 'y'])];
    expect(oppositeSharedStops(features, features[0])).toEqual([]);
  });
});

describe('oppositeSharedStops direction handling', () => {
  it('treats a missing or non-numeric direction as 0, so same-direction siblings never count as opposite', () => {
    const f = (directionId: unknown, stopOrder: string[], extra: Record<string, unknown> = {}) =>
      ({ properties: { routeId: 'r', day: 'Weekday', directionId, stopOrder, ...extra } });
    const features = [f(null, ['a', 'b']), f(undefined, ['c', 'd']), f('x', ['e', 'f']), f(1, ['g', 'h'])];
    expect(oppositeSharedStops(features, features[0])).toEqual(['g', 'h']);
    expect(oppositeSharedStops(features, features[3])).toEqual([]); // three unpooled patterns
  });
});
