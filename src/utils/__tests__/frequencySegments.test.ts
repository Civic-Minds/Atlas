import { describe, it, expect } from 'vitest';
import {
  findQualifyingStopRanges,
  computeFrequencySegmentOverlay,
  buildPartialMatchFilterExpression,
  broadenFilterForPartialMatches,
  selectedSharedStretchRoutes,
} from '../frequencySegments';
import type { AgencyLayers } from '../../hooks/useAgencyData';

describe('findQualifyingStopRanges', () => {
  it('finds a single contiguous run under threshold', () => {
    const stops = ['a', 'b', 'c', 'd', 'e'];
    const hw: Record<string, number> = { a: 30, b: 12, c: 10, d: 14, e: 30 };
    const ranges = findQualifyingStopRanges(stops, id => hw[id], 15);
    expect(ranges).toEqual([[1, 3]]);
  });

  it('splits into multiple runs when a middle stop fails', () => {
    const stops = ['a', 'b', 'c', 'd', 'e'];
    const hw: Record<string, number> = { a: 10, b: 12, c: 30, d: 14, e: 10 };
    const ranges = findQualifyingStopRanges(stops, id => hw[id], 15);
    expect(ranges).toEqual([[0, 1], [3, 4]]);
  });

  it('treats missing headway data as breaking a run, not passing it', () => {
    const stops = ['a', 'b', 'c'];
    const hw: Record<string, number | null> = { a: 10, b: 10 };
    // c has no data at all (undefined, not just null)
    const ranges = findQualifyingStopRanges(stops, id => hw[id] ?? null, 15);
    expect(ranges).toEqual([[0, 1]]);
  });

  it('drops isolated single-stop qualifying runs (no line to draw)', () => {
    const stops = ['a', 'b', 'c'];
    const hw: Record<string, number> = { a: 30, b: 10, c: 30 };
    const ranges = findQualifyingStopRanges(stops, id => hw[id], 15);
    expect(ranges).toEqual([]);
  });

  it('returns the whole span when every stop qualifies', () => {
    const stops = ['a', 'b', 'c'];
    const hw: Record<string, number> = { a: 5, b: 8, c: 10 };
    const ranges = findQualifyingStopRanges(stops, id => hw[id], 15);
    expect(ranges).toEqual([[0, 2]]);
  });

  it('returns no ranges when nothing qualifies', () => {
    const stops = ['a', 'b', 'c'];
    const hw: Record<string, number> = { a: 30, b: 40, c: 50 };
    expect(findQualifyingStopRanges(stops, id => hw[id], 15)).toEqual([]);
  });
});

/** Builds a straight west-to-east route feature with evenly spaced on-shape stops. */
function makeRouteFeature(opts: {
  routeId: string;
  directionId?: number;
  headsign?: string | null;
  day?: string;
  stopIds: string[];
  stopHeadways?: Record<string, number | null>;
  stopPeriodHeadways?: Record<string, Record<string, number | null>>;
}): GeoJSON.Feature {
  const n = opts.stopIds.length;
  const coordinates = Array.from({ length: n }, (_, i) => [i * 0.01, 0]);
  const stopPositions = Array.from({ length: n }, (_, i) => (n === 1 ? 0 : i / (n - 1)));
  return {
    type: 'Feature',
    geometry: { type: 'LineString', coordinates },
    properties: {
      routeId: opts.routeId,
      directionId: opts.directionId ?? 0,
      headsign: opts.headsign ?? null,
      day: opts.day ?? 'Saturday',
      routeShortName: opts.routeId,
      tier: '15',
      stopOrder: opts.stopIds,
      stopPositions,
      stopHeadways: opts.stopHeadways,
      stopPeriodHeadways: opts.stopPeriodHeadways,
    },
  };
}

function branchWithStopHeadways(
  headsign: string,
  stopHeadways: Record<string, number>,
  stopOrder: string[] = ['A', 'B', 'C'],
  stopPositions = stopOrder.map((_, index) => index / (stopOrder.length - 1)),
): GeoJSON.Feature {
  return {
    ...makeRouteFeature({
      routeId: '121',
      headsign,
      stopIds: stopOrder,
      stopHeadways,
      stopPeriodHeadways: Object.fromEntries(
        Object.entries(stopHeadways).map(([stopId, value]) => [stopId, { evening: value }]),
      ),
    }),
    properties: {
      ...makeRouteFeature({ routeId: '121', headsign, stopIds: stopOrder }).properties,
      agencySlug: 'marta',
      routeId: '121',
      directionId: 1,
      day: 'Weekday',
      tier: '60',
      headway: 30,
      headwayByPeriod: { evening: 30 },
      stopOrder,
      stopPositions,
      stopHeadways,
      stopPeriodHeadways: Object.fromEntries(
        Object.entries(stopHeadways).map(([stopId, value]) => [stopId, { evening: value }]),
      ),
    },
  };
}

describe('computeFrequencySegmentOverlay', () => {
  it('returns nothing when no frequency filter is active (maxHeadway = Infinity)', () => {
    const layers: AgencyLayers = {
      octranspo: {
        type: 'FeatureCollection',
        features: [makeRouteFeature({
          routeId: '6',
          stopIds: ['s1', 's2', 's3'],
          stopPeriodHeadways: { s1: { midday: 24 }, s2: { midday: 12 }, s3: { midday: 24 } },
        })],
      },
    };
    const overlay = computeFrequencySegmentOverlay(layers, 'midday', Infinity);
    expect(overlay.segments).toEqual([]);
    expect(overlay.partialMatches).toEqual([]);
  });

  // Real repro from #317's investigation comment: OC Transpo route 6 "Greenboro", dir 0,
  // Saturday midday -- minStopHeadwayByPeriod 12, headwayByPeriod (terminal) 24,
  // worstDirectionHeadwayByPeriod 38. The route passes a 15-min midday filter because of one
  // good stop, but most of the route only runs every 24 min.
  it('does not re-add a route when only one direction has a qualifying stretch', () => {
    const stopIds = ['s1', 's2', 's3', 's4', 's5'];
    const layers: AgencyLayers = {
      octranspo: {
        type: 'FeatureCollection',
        features: [makeRouteFeature({
          routeId: '6',
          headsign: 'Greenboro',
          stopIds,
          stopPeriodHeadways: {
            s1: { midday: 24 },
            s2: { midday: 24 },
            s3: { midday: 12 }, // the one good stop driving minStopHeadwayByPeriod
            s4: { midday: 13 },
            s5: { midday: 24 },
          },
        })],
      },
    };

    const overlay = computeFrequencySegmentOverlay(layers, 'midday', 15);

    expect(overlay.partialMatches).toEqual([]);
    expect(overlay.segments).toEqual([]);
  });

  // Owner rule: a combined shared-core cadence (two 30-minute branches = "every 15") is a busiest
  // stretch in one direction. It must never draw a route that fails the filter in every branch.
  it('does not draw a combined shared-core cadence on branches that fail the filter', () => {
    const result = computeFrequencySegmentOverlay({
      marta: {
        type: 'FeatureCollection',
        features: [
          branchWithStopHeadways('DORAVILLE STN', { A: 32, B: 32, C: 32 }),
          branchWithStopHeadways('GOLDSMITH P&R', { A: 33, B: 31, C: 30 }),
        ],
      },
    }, 'evening', 15);

    expect(result.segments).toHaveLength(0);
    expect(result.partialMatches).toHaveLength(0);
  });

  it('does not draw a shared core for failing branches even when terminal loops reverse stop order', () => {
    const result = computeFrequencySegmentOverlay({
      marta: {
        type: 'FeatureCollection',
        features: [
          branchWithStopHeadways('DORAVILLE STN', { A: 32, B: 32, C: 32 }),
          branchWithStopHeadways('GOLDSMITH P&R', { A: 33, B: 31, C: 30 }, ['B', 'A', 'C']),
        ],
      },
    }, 'evening', 15);

    expect(result.segments).toHaveLength(0);
    expect(result.partialMatches).toHaveLength(0);
  });

  it('does not draw a shared core lead-in for failing branches', () => {
    const result = computeFrequencySegmentOverlay({
      marta: {
        type: 'FeatureCollection',
        features: [
          branchWithStopHeadways('DORAVILLE STN', { A: 32, B: 32, C: 32 }, ['A', 'B', 'C'], [0.2, 0.5, 1]),
          branchWithStopHeadways('GOLDSMITH P&R', { A: 33, B: 31, C: 30 }, ['A', 'B', 'C'], [0.2, 0.5, 1]),
        ],
      },
    }, 'evening', 15);

    expect(result.segments).toHaveLength(0);
    expect(result.partialMatches).toHaveLength(0);
  });

  it('clips uneven stop coverage after the route-level both-direction metric passes', () => {
    const stopIds = ['s1', 's2', 's3', 's4', 's5'];
    const feature = makeRouteFeature({
      routeId: '6',
      headsign: 'Greenboro',
      stopIds,
      stopPeriodHeadways: {
        s1: { midday: 24 },
        s2: { midday: 15 },
        s3: { midday: 12 },
        s4: { midday: 13 },
        s5: { midday: 24 },
      },
    });
    feature.properties = {
      ...feature.properties,
      worstDirectionHeadway: 15,
      worstDirectionHeadwayByPeriod: { midday: 15 },
    };
    const layers: AgencyLayers = {
      octranspo: { type: 'FeatureCollection', features: [feature] },
    };

    const overlay = computeFrequencySegmentOverlay(layers, 'midday', 15);

    expect(overlay.partialMatches).toEqual([{
      agencySlug: 'octranspo',
      routeId: '6',
      directionId: 0,
      headsign: 'Greenboro',
      day: 'Saturday',
    }]);
    expect(overlay.segments).toHaveLength(1);
    // Clipped segment should sit strictly inside the full route, not span it end to end.
    const [seg] = overlay.segments;
    const coords = seg.geometry.coordinates;
    expect(coords[0][0]).toBeGreaterThan(0);
    expect(coords.at(-1)![0]).toBeLessThan(0.04);
    expect(seg.properties).toMatchObject({
      agencySlug: 'octranspo',
      routeId: '6',
      directionId: 0,
      headsign: 'Greenboro',
      day: 'Saturday',
    });
  });

  it('does not flag a route where every on-shape stop qualifies', () => {
    const layers: AgencyLayers = {
      agency: {
        type: 'FeatureCollection',
        features: [makeRouteFeature({
          routeId: 'A',
          stopIds: ['s1', 's2', 's3'],
          stopPeriodHeadways: { s1: { midday: 10 }, s2: { midday: 8 }, s3: { midday: 9 } },
        })],
      },
    };
    const overlay = computeFrequencySegmentOverlay(layers, 'midday', 15);
    expect(overlay.segments).toEqual([]);
    expect(overlay.partialMatches).toEqual([]);
  });

  it('skips features without on-shape stop data instead of guessing', () => {
    const layers: AgencyLayers = {
      agency: {
        type: 'FeatureCollection',
        features: [{
          type: 'Feature',
          geometry: { type: 'LineString', coordinates: [[0, 0], [1, 0]] },
          properties: { routeId: 'B', directionId: 0, day: 'Saturday' },
        }],
      },
    };
    const overlay = computeFrequencySegmentOverlay(layers, 'midday', 15);
    expect(overlay.segments).toEqual([]);
    expect(overlay.partialMatches).toEqual([]);
  });

  it('uses stopHeadways (not stopPeriodHeadways) for the all-day period', () => {
    const stopIds = ['s1', 's2', 's3'];
    const feature = makeRouteFeature({
      routeId: 'C',
      stopIds,
      stopHeadways: { s1: 30, s2: 12, s3: 13 },
    });
    feature.properties = { ...feature.properties, worstDirectionHeadway: 15 };
    const layers: AgencyLayers = {
      agency: {
        type: 'FeatureCollection',
        features: [feature],
      },
    };
    const overlay = computeFrequencySegmentOverlay(layers, 'all', 15);
    expect(overlay.partialMatches).toHaveLength(1);
    expect(overlay.segments).toHaveLength(1);
  });

  it('uses scheduled period headways instead of coverage gaps', () => {
    const stopIds = ['s1', 's2', 's3'];
    const feature = makeRouteFeature({
      routeId: 'dart-25',
      stopIds,
      stopPeriodHeadways: {
        s1: { midday: 20 },
        s2: { midday: 20 },
        s3: { midday: 20 },
      },
    });
    feature.properties = {
      ...feature.properties,
      headwayByPeriod: { midday: 20 },
      periodCoverageHeadway: { midday: 172 },
      stopPeriodCoverageHeadways: {
        s1: { midday: 80 },
        s2: { midday: 120 },
        s3: { midday: 172 },
      },
    };

    const overlay = computeFrequencySegmentOverlay({ agency: {
      type: 'FeatureCollection',
      features: [feature],
    } }, 'midday', 20);

    expect(overlay.segments).toEqual([]);
    expect(overlay.partialMatches).toEqual([]);
  });

  it('ignores corridor layers (keyed with a "-corridors" suffix)', () => {
    const layers: AgencyLayers = {
      'agency-corridors': {
        type: 'FeatureCollection',
        features: [makeRouteFeature({
          routeId: 'D',
          stopIds: ['s1', 's2', 's3'],
          stopPeriodHeadways: { s1: { midday: 24 }, s2: { midday: 12 }, s3: { midday: 24 } },
        })],
      },
    };
    const overlay = computeFrequencySegmentOverlay(layers, 'midday', 15);
    expect(overlay.segments).toEqual([]);
    expect(overlay.partialMatches).toEqual([]);
  });
});

describe('buildPartialMatchFilterExpression', () => {
  it('returns false (matches nothing) for an empty key list', () => {
    expect(buildPartialMatchFilterExpression([])).toBe(false);
  });

  it('builds an any/all filter scoped to agency + route + direction + headsign + day', () => {
    const expr = buildPartialMatchFilterExpression([
      { agencySlug: 'octranspo', routeId: '6', directionId: 0, headsign: 'Greenboro', day: 'Saturday' },
    ]);
    expect(expr[0]).toBe('any');
    expect(expr).toHaveLength(2);
    expect(expr[1][0]).toBe('all');
  });
});

describe('broadenFilterForPartialMatches', () => {
  it('returns the base filter unchanged when there are no partial matches', () => {
    const base = ['<=', ['get', 'headway'], 15];
    expect(broadenFilterForPartialMatches(base, [])).toBe(base);
  });

  it('ORs the base filter with a partial-match expression, so a route excluded by the base', () => {
    // filter (e.g. worst-direction headway too high) is pulled back in when it's a confirmed
    // partial match -- this is what lets a route render (and be hoverable/selectable) at all
    // for the #317 overlay's dimmed remainder, instead of just being absent from the map.
    const base = ['<=', ['get', 'wdph_midday'], 15];
    const keys = [{ agencySlug: 'octranspo', routeId: '6', directionId: 0, headsign: 'Greenboro', day: 'Saturday' }];
    const expr = broadenFilterForPartialMatches(base, keys);
    expect(expr).toEqual(['any', base, buildPartialMatchFilterExpression(keys)]);
  });
});

// #850 (TTC 52, h=10 midday): every branch runs every 20, so the route fails, but the four
// pooled branches pass on the shared stretch (CIV-82). Selecting the route must bring its
// features back into the base layer; unselected, only the stretch overlay draws.
describe('shared-stretch-only routes (#850)', () => {
  const stops = ['A', 'B', 'C', 'D'];
  const lon = [0, 0.002, 0.004, 0.006];
  const pooled = Object.fromEntries(stops.map(s => [s, { periods: [null, 10], coverage: [null, 10] }]));
  const branch = (headsign: string, directionId: number): GeoJSON.Feature => {
    const order = directionId === 0 ? stops : [...stops].reverse().map(s => s.toLowerCase());
    const coords = (directionId === 0 ? lon : [...lon].reverse()).map(x => [x, 0]);
    const own = Object.fromEntries(order.map(s => [s, { midday: 20 }]));
    return {
      type: 'Feature',
      geometry: { type: 'LineString', coordinates: coords },
      properties: {
        agencySlug: 'ttc', routeId: '52', routeBranch: null, directionId, headsign, day: 'Weekday',
        tier: '20', headway: 20, worstDirectionHeadway: 20,
        headwayByPeriod: { midday: 20 }, worstDirectionHeadwayByPeriod: { midday: 20 },
        minStopHeadwayByPeriod: { midday: 20 }, headwayByPeriodSustained: { midday: true },
        stopOrder: order, stopPositions: [0, 1 / 3, 2 / 3, 1],
        stopPeriodHeadways: own, stopPeriodCoverageHeadways: own,
        sharedStretches: [{ from: 0, to: 3, with: [] }],
        sharedStops: directionId === 0 ? pooled : Object.fromEntries(Object.entries(pooled).map(([k, v]) => [k.toLowerCase(), v])),
      },
    };
  };
  const stopPoints: GeoJSON.Feature[] = stops.flatMap((s, i) => [s, s.toLowerCase()].map(id => ({
    type: 'Feature' as const,
    geometry: { type: 'Point' as const, coordinates: [lon[i], 0] },
    properties: { stopId: id },
  })));
  const layers = {
    ttc: {
      type: 'FeatureCollection',
      features: [branch('Lawrence', 0), branch('Lawrence West Station', 0), branch('Pearson Airport', 1), branch('Royal York', 1), ...stopPoints],
    },
  } as unknown as AgencyLayers;

  it('lists the failing route as a shared-stretch route, not a partial match', () => {
    const overlay = computeFrequencySegmentOverlay(layers, 'midday', 10);
    expect(overlay.segments.length).toBeGreaterThan(0);
    expect(overlay.partialMatches).toEqual([]);
    expect(overlay.sharedStretchRoutes.map(k => k.headsign).sort()).toEqual(['Lawrence', 'Lawrence West Station', 'Pearson Airport', 'Royal York']);
  });

  it('adds the shared-stretch features back only for the selected route', () => {
    const { sharedStretchRoutes } = computeFrequencySegmentOverlay(layers, 'midday', 10);
    expect(selectedSharedStretchRoutes(sharedStretchRoutes, 'ttc::52')).toHaveLength(4);
    expect(selectedSharedStretchRoutes(sharedStretchRoutes, 'ttc::29')).toEqual([]);
    expect(selectedSharedStretchRoutes(sharedStretchRoutes, null)).toEqual([]);
  });
});
