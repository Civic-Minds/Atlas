import { describe, it, expect } from 'vitest';
import {
  findQualifyingStopRanges,
  computeFrequencySegmentOverlay,
  buildPartialMatchFilterExpression,
  broadenFilterForPartialMatches,
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
