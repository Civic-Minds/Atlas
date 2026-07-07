import { renderHook } from '@testing-library/react';
import { useIntervalStats } from '../useIntervalStats';
import type { AgencyLayers } from '../useAgencyData';
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

  it('should handle combined-frequency corridors', () => {
    const layersWithCorridor: AgencyLayers = {
      'ttc': {
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            geometry: { type: 'LineString', coordinates: [[0, 0], [1, 1]] },
            properties: { 
              isCorridor: true, 
              headway: 5, 
              routeIds: ['1', '2', '3'], 
              agencyName: 'TTC' 
            }
          }
        ]
      }
    };

    // By default corridors are hidden (showCorridors is false)
    const { result: hidden } = renderHook(() => useIntervalStats(layersWithCorridor, defaultFilters));
    expect(hidden.current.filteredLayers['ttc']).toBeUndefined();

    // When enabled, corridors should appear if they meet the criteria (3+ routes or high freq)
    const { result: visible } = renderHook(() => useIntervalStats(layersWithCorridor, { 
      ...defaultFilters, 
      showCorridors: true 
    }));
    expect(visible.current.filteredLayers['ttc'].features.length).toBe(1);

    // Corridors with few routes and low frequency should stay hidden
    const layersWithNoisyCorridor: AgencyLayers = {
      'ttc': {
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            geometry: { type: 'LineString', coordinates: [[0, 0], [1, 1]] },
            properties: { 
              isCorridor: true, 
              headway: 20, 
              routeIds: ['1', '2'], 
              agencyName: 'TTC' 
            }
          }
        ]
      }
    };
    const { result: noisy } = renderHook(() => useIntervalStats(layersWithNoisyCorridor, { 
      ...defaultFilters, 
      showCorridors: true 
    }));
    expect(noisy.current.filteredLayers['ttc']).toBeUndefined();
  });

  it('should filter by worst-direction period headway', () => {
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

    const { result: passes } = renderHook(() => useIntervalStats(layers, { ...base, period: 'all' }));
    expect(passes.current.stats?.matching).toBe(1);

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
});
