import { describe, expect, it } from 'vitest';
import { buildSectionColourFeatures, runExtent, sectionRuns, sectionTiers } from '../sectionColours';

// CIV-152: sections whose every-gap grade differs from the route's own tier, judged by the
// slower direction.

describe('sectionRuns', () => {
  it('cuts the line where the grade changes and keeps the sections that differ from the route tier', () => {
    // Trunk graded 10, branch 20 on a route graded 20: the trunk draws green, the branch is the base line.
    expect(sectionRuns(['10', '10', '10', '20', '20', '20'], '20', [8, 8, 9, 20, 20, 20])).toEqual([{ from: 0, to: 2, tier: '10', headway: 9 }]);
    // The same stops on a route graded 10: the branch draws orange.
    expect(sectionRuns(['10', '10', '10', '20', '20', '20'], '10')).toEqual([{ from: 3, to: 5, tier: '20', headway: null }]);
    // Every stop graded like the route (IndyGo Red: tier 15 at every stop): nothing.
    expect(sectionRuns(['15', '15', '15', '15'], '15')).toEqual([]);
    // Each grade change starts a new section.
    expect(sectionRuns(['10', '20', '15', '10'], '10')).toEqual([{ from: 1, to: 1, tier: '20', headway: null }, { from: 2, to: 2, tier: '15', headway: null }]);
  });

  it('a stop with no grade inside the line takes the worse neighbour; a gradeless tail is limited', () => {
    expect(sectionRuns(['10', null, '20', '20'], '10')).toEqual([{ from: 1, to: 3, tier: '20', headway: null }]);
    // Two gradeless stops at the end: limited service, in the infrequent colour.
    expect(sectionRuns(['10', '10', '10', null, null], '10')).toEqual([{ from: 3, to: 4, tier: 'infrequent', headway: null }]);
    // A single gradeless last stop is the terminal, not a tail.
    expect(sectionRuns(['10', '10', '10', null], '10')).toEqual([]);
    expect(sectionRuns([null, null], '10')).toEqual([]);
  });
});

describe('runExtent', () => {
  it('runs from half way before the first stop to half way after the last; terminals at the stop', () => {
    const positions = [0, 0.2, 0.5, 1];
    expect(runExtent(positions, 0, 1)).toEqual([0, 0.35]);
    expect(runExtent(positions, 2, 3)).toEqual([0.35, 1]);
  });
});

const line = (over: Record<string, unknown>) => ({
  routeId: 'r', day: 'Weekday', tier: '10', ...over,
}) as any;

describe('sectionTiers', () => {
  it('reads the slower direction at the matching stop (#821) and the own grade where nothing pairs', () => {
    const p = line({ directionId: 0, stopOrder: ['a', 'b', 'c'], stopTiers: { a: '10', b: '10', c: '10' } });
    // The opposite direction serves the same stops: graded 20 at b.
    const q = line({ directionId: 1, stopOrder: ['c', 'b', 'a'], stopTiers: { c: '10', b: '20', a: '10' } });
    expect(sectionTiers(p, [q], new Map())).toEqual(['10', '20', '10']);
    // Two opposite patterns at b: the better one speaks for the direction.
    const q2 = line({ directionId: 1, stopOrder: ['c', 'b'], stopTiers: { c: '10', b: '15' } });
    expect(sectionTiers(p, [q, q2], new Map())).toEqual(['10', '15', '10']);
    // No opposite direction: own grades. A stop with no grade stays null.
    expect(sectionTiers(line({ directionId: 0, stopOrder: ['a', 'b'], stopTiers: { a: '10' } }), [], new Map())).toEqual(['10', null]);
  });

  it('pairs opposite stops by distance when the ids differ', () => {
    const coords = new Map([['a', { lat: 0, lon: 0 }], ['a2', { lat: 0.001, lon: 0 }], ['b', { lat: 0.5, lon: 0.5 }]]);
    const p = line({ directionId: 0, stopOrder: ['a', 'b'], stopTiers: { a: '10', b: '10' } });
    const q = line({ directionId: 1, stopOrder: ['b', 'a2'], stopTiers: { b: '10', a2: '30' } });
    expect(sectionTiers(p, [q], coords)).toEqual(['30', '10']);
  });
});

describe('buildSectionColourFeatures', () => {
  const coordsOf = (n: number) => Array.from({ length: n }, (_, i) => [i, 0]);
  const feature = (props: Record<string, unknown>, n = 6): GeoJSON.Feature => ({
    type: 'Feature', geometry: { type: 'LineString', coordinates: coordsOf(n) }, properties: props,
  });
  const positions = [0, 0.2, 0.4, 0.6, 0.8, 1];
  const layers = {
    demo: {
      type: 'FeatureCollection' as const,
      features: [
        // A branch graded 20 whose first three stops are a trunk pooled every 10.
        feature({ routeId: 'r', directionId: 0, day: 'Weekday', tier: '20', headsign: 'Out', stopOrder: ['a', 'b', 'c', 'd', 'e', 'f'], stopPositions: positions,
          stopTiers: { a: '10', b: '10', c: '10', d: '20', e: '20', f: '20' }, stopHeadways: { a: 9, b: 10, c: 10, d: 20, e: 20, f: 20 } }),
        feature({ routeId: 'r', directionId: 1, day: 'Weekday', tier: '20', headsign: 'In', stopOrder: ['f', 'e', 'd', 'c', 'b', 'a'], stopPositions: positions,
          stopTiers: { f: '20', e: '20', d: '20', c: '10', b: '10', a: '10' }, stopHeadways: { f: 20, e: 20, d: 20, c: 10, b: 10, a: 10 } }),
        feature({ routeId: 'r', directionId: 0, day: 'Saturday', tier: '30', headsign: 'Out', stopOrder: ['a', 'b', 'c', 'd', 'e', 'f'], stopPositions: positions,
          stopTiers: { a: '30', b: '30', c: '30', d: '60', e: '60', f: '60' } }),
        // No stopTiers (data from before CIV-152): nothing is drawn.
        feature({ routeId: 's', directionId: 0, day: 'Weekday', tier: '20', headsign: 'Out', stopOrder: ['a', 'b', 'c', 'd', 'e', 'f'], stopPositions: positions,
          stopHeadways: { a: 9, b: 10, c: 10, d: 20, e: 20, f: 20 } }),
      ],
    },
  };

  it('draws one coloured piece per differing section, for the day shown, with the tier palette', () => {
    const out = buildSectionColourFeatures(layers, 'Weekday');
    expect(out).toHaveLength(2);
    expect(out.map(f => f.properties.tier)).toEqual(['10', '10']);
    expect(out[0].properties).toMatchObject({ agencySlug: 'demo', routeId: 'r', directionId: 0, headsign: 'Out', headway: 10, color: '#22863a' });
    // The start of the line to half way between c (0.4) and d (0.6).
    expect(out[0].geometry.coordinates[0]).toEqual([0, 0]);
    expect(out[0].geometry.coordinates.at(-1)).toEqual([2.5, 0]);
    expect(buildSectionColourFeatures(layers, 'Saturday').map(f => f.properties.tier)).toEqual(['60']);
  });

  it('honours the accept filter and empty input', () => {
    expect(buildSectionColourFeatures(layers, 'Weekday', 'default', p => p.routeId !== 'r')).toEqual([]);
    expect(buildSectionColourFeatures(undefined, 'Weekday')).toEqual([]);
  });
});
