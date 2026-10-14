import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildSectionColourFeatures, rank, runExtent, sectionRuns, sectionTiers } from '../sectionColours';

const fixture = (name: string) => JSON.parse(readFileSync(resolve(__dirname, 'fixtures', `${name}.json`), 'utf8')) as GeoJSON.FeatureCollection;
const byLine = (features: ReturnType<typeof buildSectionColourFeatures>) => {
  const out: Record<string, string[]> = {};
  for (const f of features) { const k = `${f.properties.directionId} ${f.properties.headsign}`; (out[k] ??= []).push(f.properties.tier); }
  for (const k of Object.keys(out)) out[k].sort();
  return out;
};

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

describe('tier order (rail 8 and 5)', () => {
  it('ranks every tier by value, infrequent and span last, so a streetcar graded 8 is not the worst', () => {
    const order = ['5', '8', '10', '15', '20', '30', '60', 'infrequent', 'span'];
    for (let i = 1; i < order.length; i++) expect(rank(order[i])).toBeGreaterThan(rank(order[i - 1]));
    // A streetcar at tier 8 with two stops graded 15 draws those stops as a slower section;
    // a bus at 10 whose first stops pool with a streetcar at 8 draws them as a faster one.
    expect(sectionRuns(['8', '8', '15', '15'], '8')).toEqual([{ from: 2, to: 3, tier: '15', headway: null }]);
    expect(sectionRuns(['8', '8', '10', '10'], '10')).toEqual([{ from: 0, to: 1, tier: '8', headway: null }]);
    expect(sectionRuns(['5', null, '5', '8'], '8')).toEqual([{ from: 0, to: 2, tier: '5', headway: null }]);
  });

  it('colours a tier-8 section with the frequent colour, not the infrequent one', () => {
    const streetcar: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: [
        { type: 'Feature', geometry: { type: 'LineString', coordinates: [[-79.4, 43.6], [-79.39, 43.6], [-79.38, 43.6], [-79.37, 43.6]] },
          properties: { routeId: '504', day: 'Weekday', directionId: 0, headsign: 'Dundas West', tier: '8', headway: 6, stopOrder: ['a', 'b', 'c', 'd'], stopPositions: [0, 0.33, 0.66, 1], stopTiers: { a: '8', b: '8', c: '15', d: '15' }, stopHeadways: { a: 6, b: 6, c: 12, d: 12 } } },
        ...['a', 'b', 'c', 'd'].map((id, i) => ({ type: 'Feature' as const, geometry: { type: 'Point' as const, coordinates: [-79.4 + i * 0.01, 43.6] }, properties: { stopId: id } })),
      ],
    };
    const out = buildSectionColourFeatures({ ttc: streetcar }, 'Weekday');
    expect(out.map(f => f.properties.tier)).toEqual(['15']);
    const better: GeoJSON.FeatureCollection = { ...streetcar, features: streetcar.features.map(f => (f.geometry.type === 'LineString' ? { ...f, properties: { ...f.properties, tier: '15', stopTiers: { a: '8', b: '8', c: '15', d: '15' } } } : f)) };
    const faster = buildSectionColourFeatures({ ttc: better }, 'Weekday');
    expect(faster.map(f => f.properties.tier)).toEqual(['8']);
    expect(faster[0].properties.color).toBe('#22863a');
  });

  it('draws nothing on a span route', () => {
    const span: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: [
        { type: 'Feature', geometry: { type: 'LineString', coordinates: [[-79.4, 43.6], [-79.38, 43.6]] },
          properties: { routeId: '9', day: 'Weekday', directionId: 0, headsign: 'Depot', tier: 'span', headway: null, stopOrder: ['a', 'b'], stopPositions: [0, 1], stopTiers: { a: '30' }, stopHeadways: { a: 30 } } },
      ],
    };
    expect(buildSectionColourFeatures({ x: span }, 'Weekday')).toEqual([]);
  });
});

describe('named lines from processed data', () => {
  // Fixtures cut from dry-run previews of the #690 branch (route lines plus their stops).
  it('TTC 96 Wilson weekday: both York Mills patterns and the Carrier Dr, Humberline and Humber College patterns draw their every-10 trunk and every-15 stretches over a tier-20 line', () => {
    const out = buildSectionColourFeatures({ ttc: fixture('ttc-96-weekday') }, 'Weekday');
    expect(out).toHaveLength(15);
    expect(byLine(out)).toEqual({
      '0 York Mills via Martin Grove and Westhumber': ['10', '10', '15'],
      '0 York Mills via John Garland and Kipling': ['10', '10', '15'],
      '1 Carrier Dr via Kipling and John Garland': ['10', '10', '15'],
      '1 Humberline and Albion via Westhumber and Martin Grove': ['10', '10', '15'],
      '1 Humber College via Kipling and John Garland': ['10', '10', '15'],
    });
    // The two span patterns to Humber College draw nothing.
    expect(out.some(f => f.properties.headsign === 'Humber College')).toBe(false);
  });

  it('CTA J14 Saturday: the southbound line (tier 20) draws its every-15 stretch; the northbound patterns draw their every-20 stretches', () => {
    const out = buildSectionColourFeatures({ cta: fixture('cta-j14-saturday') }, 'Saturday');
    expect(byLine(out)).toEqual({
      '0 103rd Street & Stony Island Garage Terminal': ['15'],
      '1 Jefferson & Washington': ['20'],
      '1 Madison & Jefferson': ['15', '20'],
    });
  });

  it('IndyGo Red Line weekday: every stop grades like the line, so nothing is drawn', () => {
    expect(buildSectionColourFeatures({ indygo: fixture('indygo-red-weekday') }, 'Weekday')).toEqual([]);
  });

  it('the selected-route path builds from the unfiltered layers for its own day only', () => {
    const layers = { ttc: fixture('ttc-96-weekday') };
    expect(buildSectionColourFeatures(layers, 'Weekday', 'default', p => p.routeId === '96')).toHaveLength(15);
    expect(buildSectionColourFeatures(layers, 'Weekday', 'default', p => p.routeId === '52')).toHaveLength(0);
    expect(buildSectionColourFeatures(layers, 'Sunday')).toHaveLength(0);
  });
});
