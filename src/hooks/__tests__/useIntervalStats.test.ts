import { renderHook } from '@testing-library/react';
import { passesRouteFilter, useIntervalStats, featureBbox, inViewport } from '../useIntervalStats';
import type { AgencyLayers } from '../useAgencyData';
import type { ViewportBounds } from '../useIntervalStats';
import { describe, it, expect } from 'vitest';

const mockLayers: AgencyLayers = {
  'ttc': {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        geometry: { type: 'LineString', coordinates: [[0, 0], [1, 1]] },
        properties: {
          routeId: '504',
          routeShortName: '504',
          routeLongName: 'King',
          headway: 10,
          tier: '10',
          agencyName: 'TTC'
        }
      },
      {
        type: 'Feature',
        geometry: { type: 'LineString', coordinates: [[0, 0], [1, 1]] },
        properties: {
          routeId: '501',
          routeShortName: '501',
          routeLongName: 'Queen',
          headway: 20,
          tier: '20',
          agencyName: 'TTC'
        }
      }
    ]
  }
};

describe('useIntervalStats', () => {
  const defaultFilters: any = {
    query: '',
    maxHeadway: 60,
    agencies: new Set(),
    modes: new Set(),
    day: 'Weekday'
  };

  it('keeps selected-route visibility separate from the active filter explanation', () => {
    const route = { routeId: '12', agencySlug: 'kalamazoo', headway: 60, tier: '60' } as any;
    const filters = { ...defaultFilters, maxHeadway: 20, agencies: new Set(['kalamazoo']) };
    expect(passesRouteFilter(route, 'kalamazoo', { ...filters, selectedRoute: 'kalamazoo::12' }, null)).toBe(true);
    expect(passesRouteFilter(route, 'kalamazoo', { ...filters, selectedRoute: null }, null)).toBe(false);
  });

  it('hideSpan also hides a route whose other direction has no sustained pattern at all (Halifax 330, #318)', () => {
    // Eastbound: real 13-min tier, but the pipeline flagged the route because Westbound is span-only.
    const eastbound = {
      routeId: '330', agencySlug: 'halifax', headway: 13, tier: 'infrequent',
      routeHasIrregularDirection: true,
    } as any;
    const filters = { ...defaultFilters, maxHeadway: 20, agencies: new Set(['halifax']), hideSpan: true };
    expect(passesRouteFilter(eastbound, 'halifax', filters, null)).toBe(false);
    expect(passesRouteFilter(eastbound, 'halifax', { ...filters, hideSpan: false }, null)).toBe(true);
  });

  it('hideSpan does not hide a route where every direction has some real pattern (Kingston 701, #318)', () => {
    const viaDowntown = {
      routeId: '701', agencySlug: 'kingston', headway: 30, tier: '60',
      routeHasIrregularDirection: undefined,
    } as any;
    const filters = { ...defaultFilters, maxHeadway: 60, agencies: new Set(['kingston']), hideSpan: true };
    expect(passesRouteFilter(viaDowntown, 'kingston', filters, null)).toBe(true);
  });

  it('should return correct stats for default filters', () => {
    const { result } = renderHook(() => useIntervalStats(mockLayers, defaultFilters));
    
    expect(result.current.stats).toEqual({
      total: 2,
      matching: 2
    });
    expect(result.current.searchMatches).toBeNull();
  });

  it('should filter by maxHeadway', () => {
    const { result } = renderHook(() => useIntervalStats(mockLayers, { ...defaultFilters, maxHeadway: 15 }));
    
    expect(result.current.stats).toEqual({
      total: 2,
      matching: 1 // Only the 504 matches (10m headway)
    });
  });

  it('should filter by agency slug', () => {
    const { result } = renderHook(() => useIntervalStats(mockLayers, { 
      ...defaultFilters, 
      agencies: new Set(['not-ttc']) 
    }));
    
    expect(result.current.stats).toEqual({
      total: 2,
      matching: 0
    });

    const { result: resultMatch } = renderHook(() => useIntervalStats(mockLayers, { 
      ...defaultFilters, 
      agencies: new Set(['ttc']) 
    }));
    expect(resultMatch.current.stats?.matching).toBe(2);
  });

  it('should filter by route mode (routeType)', () => {
    const layersWithModes: AgencyLayers = {
      'ttc': {
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            geometry: { type: 'LineString', coordinates: [[0, 0], [1, 1]] },
            properties: { routeId: '1', headway: 10, agencyName: 'TTC', routeType: 1 }
          },
          {
            type: 'Feature',
            geometry: { type: 'LineString', coordinates: [[0, 0], [1, 1]] },
            properties: { routeId: '2', headway: 10, agencyName: 'TTC', routeType: 3 }
          }
        ]
      }
    };

    const { result } = renderHook(() => useIntervalStats(layersWithModes, {
      ...defaultFilters,
      modes: new Set([1]),
    }));

    expect(result.current.stats?.matching).toBe(1);
  });

  it('should filter by route mode when routeType is a string', () => {
    const layersWithModes: AgencyLayers = {
      'ttc': {
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            geometry: { type: 'LineString', coordinates: [[0, 0], [1, 1]] },
            properties: { routeId: '1', headway: 10, agencyName: 'TTC', routeType: '3' }
          },
          {
            type: 'Feature',
            geometry: { type: 'LineString', coordinates: [[0, 0], [1, 1]] },
            properties: { routeId: '2', headway: 10, agencyName: 'TTC', routeType: '1' }
          }
        ]
      }
    };

    const { result } = renderHook(() => useIntervalStats(layersWithModes, {
      ...defaultFilters,
      modes: new Set([3]),
    }));

    expect(result.current.stats?.matching).toBe(1);
  });

  it('tileFilter includes mode clause when modes are selected', () => {
    const { result } = renderHook(() => useIntervalStats(mockLayers, {
      ...defaultFilters,
      agencies: new Set(['ttc']),
      modes: new Set([1]),
    }));

    expect(JSON.stringify(result.current.tileFilter)).toContain('"any"');
    expect(JSON.stringify(result.current.tileFilter)).toContain('"routeType"');
  });

  it('should filter by day', () => {
    const layersWithDays: AgencyLayers = {
      'ttc': {
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            geometry: { type: 'LineString', coordinates: [[0, 0], [1, 1]] },
            properties: { routeId: '1', headway: 10, agencyName: 'TTC', day: 'Weekday' }
          },
          {
            type: 'Feature',
            geometry: { type: 'LineString', coordinates: [[0, 0], [1, 1]] },
            properties: { routeId: '2', headway: 10, agencyName: 'TTC', day: 'Saturday' }
          }
        ]
      }
    };

    const { result } = renderHook(() => useIntervalStats(layersWithDays, { 
      ...defaultFilters, 
      day: 'Saturday' 
    }));
    
    expect(result.current.stats?.matching).toBe(1);
  });

  it('should filter by search query', () => {
    const { result } = renderHook(() => useIntervalStats(mockLayers, { ...defaultFilters, query: 'King' }));
    
    expect(result.current.searchMatches).toBe(1);
    expect(result.current.matchesQuery(mockLayers['ttc'].features[0].properties as any)).toBe(true);
    expect(result.current.matchesQuery(mockLayers['ttc'].features[1].properties as any)).toBe(false);
  });

  it('should be case-insensitive in search', () => {
    const { result } = renderHook(() => useIntervalStats(mockLayers, { ...defaultFilters, query: 'kInG' }));
    expect(result.current.searchMatches).toBe(1);
  });

  it('should match by route number', () => {
    const { result } = renderHook(() => useIntervalStats(mockLayers, { ...defaultFilters, query: '501' }));
    expect(result.current.searchMatches).toBe(1);
  });

  it('should match route short names by substring', () => {
    const layersWithSuffix: AgencyLayers = {
      ttc: {
        type: 'FeatureCollection',
        features: [{
          type: 'Feature',
          geometry: { type: 'LineString', coordinates: [[0, 0], [1, 1]] },
          properties: {
            routeId: '6x',
            routeShortName: '6X',
            routeLongName: 'Express',
            headway: 10,
            tier: '10',
            agencyName: 'TTC',
          },
        }],
      },
    };
    const { result } = renderHook(() => useIntervalStats(layersWithSuffix, { ...defaultFilters, query: 'x' }));
    expect(result.current.searchMatches).toBe(1);
  });

  it('should handle empty layers gracefully', () => {
    const { result } = renderHook(() => useIntervalStats({}, defaultFilters));
    expect(result.current.stats).toBeNull();
    expect(result.current.searchMatches).toBeNull();
  });

  it('should scope stats to the viewport bounds', () => {
    const layersSpread: AgencyLayers = {
      'ttc': {
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            geometry: { type: 'LineString', coordinates: [[-79.4, 43.6], [-79.3, 43.7]] }, // Toronto
            properties: { routeId: '504', headway: 10, agencyName: 'TTC' }
          },
          {
            type: 'Feature',
            geometry: { type: 'LineString', coordinates: [[-80.5, 43.4], [-80.4, 43.5]] }, // Waterloo
            properties: { routeId: '201', headway: 10, agencyName: 'GRT' }
          }
        ]
      }
    };

    // Viewport over Toronto only
    const { result } = renderHook(() => useIntervalStats(layersSpread, {
      ...defaultFilters,
      bounds: { s: 43.5, w: -79.6, n: 43.8, e: -79.1 }
    }));
    expect(result.current.stats).toEqual({ total: 1, matching: 1 });

    // No bounds → whole region
    const { result: unscoped } = renderHook(() => useIntervalStats(layersSpread, defaultFilters));
    expect(unscoped.current.stats).toEqual({ total: 2, matching: 2 });
  });

  it('period filter requires worstDirectionHeadwayByPeriod to qualify, not just this branch\'s own headByPeriod (#314)', () => {
    const layers: AgencyLayers = {
      'test': {
        type: 'FeatureCollection',
        features: [{
          type: 'Feature',
          geometry: { type: 'LineString', coordinates: [[0, 0], [1, 1]] },
          properties: {
            routeId: '1',
            headway: 10,
            tier: '10',
            headwayByPeriod: { midday: 10 },
            worstDirectionHeadwayByPeriod: { midday: 45 },
          },
        }],
      },
    };
    const base = { ...defaultFilters, maxHeadway: 30, period: 'midday' as const };

    // All-day check has no period-specific worstDirectionHeadway to fall back on here, so it
    // uses the branch's own headway (10) and passes.
    const { result: passes } = renderHook(() => useIntervalStats(layers, { ...base, period: 'all' }));
    expect(passes.current.stats?.matching).toBe(1);

    // Kingston 701 case: this branch's own midday headway (10) would pass a 30-min filter on
    // its own, but the route's worst direction (45) doesn't -- the route must fail entirely,
    // not show based on one direction's optimistic number.
    const { result: fails } = renderHook(() => useIntervalStats(layers, base));
    expect(fails.current.stats?.matching).toBe(0);
  });

  it('tileFilter uses flat period keys and all-day fallback (PMTiles-safe)', () => {
    const layers: AgencyLayers = {
      'test': {
        type: 'FeatureCollection',
        features: [{
          type: 'Feature',
          geometry: { type: 'LineString', coordinates: [[0, 0], [1, 1]] },
          properties: {
            routeId: '1',
            headway: 10,
            worstDirectionHeadway: 45,
            tier: '10',
          },
        }],
      },
    };
    const filters = {
      ...defaultFilters,
      agencies: new Set(['test']),
      maxHeadway: 30,
      period: 'midday' as const,
    };
    const { result } = renderHook(() => useIntervalStats(layers, filters));
    const tf = JSON.stringify(result.current.tileFilter);
    // Flat period keys (post-PMTiles-build), not nested object access
    expect(tf).toContain('wdph_midday');
    expect(tf).toContain('worstDirectionHeadway');
    expect(tf).not.toContain('minStopHeadwayByPeriod');
  });

  it('tileFilter headway clause respects maxHeadway', () => {
    const layers: AgencyLayers = {
      'ttc': {
        type: 'FeatureCollection',
        features: [{
          type: 'Feature',
          geometry: { type: 'LineString', coordinates: [[0, 0], [1, 1]] },
          properties: { routeId: '1', headway: 10, tier: '10', agencySlug: 'ttc' },
        }],
      },
    };
    const { result } = renderHook(() => useIntervalStats(layers, {
      ...defaultFilters,
      agencies: new Set(['ttc']),
      maxHeadway: 15,
      period: 'all' as const,
    }));
    expect(JSON.stringify(result.current.tileFilter)).toContain('"<="');
    expect(JSON.stringify(result.current.tileFilter)).toContain('15');
  });

  it('period filter falls back to headwayByHour if period data is missing', () => {
    const layers: AgencyLayers = {
      'test': {
        type: 'FeatureCollection',
        features: [{
          type: 'Feature',
          geometry: { type: 'LineString', coordinates: [[0, 0], [1, 1]] },
          properties: {
            routeId: '1',
            headway: 20,
            worstDirectionHeadway: 20,
            headwayByHour: {
              5: null, 6: null, 7: null, 8: null,
              9: null, 10: 12, 11: null, 12: null, 13: null, 14: null,
              15: null
            }
          },
        }],
      },
    };

    const { result } = renderHook(() => useIntervalStats(layers, {
      ...defaultFilters,
      agencies: new Set(['test']),
      maxHeadway: 15,
      period: 'midday' as const,
    }));
    expect(result.current.stats?.matching).toBe(1);
  });

  it('does not count routes with explicit no-service period data as active matches', () => {
    const layers: AgencyLayers = {
      'test': {
        type: 'FeatureCollection',
        features: [{
          type: 'Feature',
          geometry: { type: 'LineString', coordinates: [[0, 0], [1, 1]] },
          properties: {
            routeId: '1',
            headway: 20,
            tier: '20',
            headwayByPeriod: { late: null },
          },
        }],
      },
    };

    const { result } = renderHook(() => useIntervalStats(layers, {
      ...defaultFilters,
      agencies: new Set(['test']),
      maxHeadway: 60,
      period: 'late' as const,
    }));
    expect(result.current.stats?.matching).toBe(0);
  });
});

describe('featureBbox / inViewport', () => {
  it('handles MultiLineString and caches bbox', () => {
    const f: GeoJSON.Feature = {
      type: 'Feature',
      geometry: {
        type: 'MultiLineString',
        coordinates: [
          [[-79.4, 43.6], [-79.3, 43.65]],
          [[-79.35, 43.7], [-79.2, 43.75]],
        ],
      },
      properties: {},
    };
    const bbox = featureBbox(f);
    expect(bbox[0]).toBeCloseTo(-79.4);
    expect(bbox[1]).toBeCloseTo(43.6);
    expect(bbox[2]).toBeCloseTo(-79.2);
    expect(bbox[3]).toBeCloseTo(43.75);
    expect(featureBbox(f)).toBe(bbox); // same cached array
  });

  it('reports features whose bbox intersects the viewport', () => {
    const f: GeoJSON.Feature = {
      type: 'Feature',
      geometry: { type: 'LineString', coordinates: [[-79.4, 43.6], [-79.3, 43.7]] },
      properties: {},
    };
    const view: ViewportBounds = { s: 43.5, w: -79.6, n: 43.8, e: -79.1 };
    const far: ViewportBounds = { s: 40, w: -90, n: 41, e: -89 };
    expect(inViewport(f, view)).toBe(true);
    expect(inViewport(f, far)).toBe(false);
  });
});
