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
            properties: { routeId: '1', headway: 10, agencyName: 'TTC', routeType: 1 } // Subway
          },
          {
            type: 'Feature',
            geometry: { type: 'LineString', coordinates: [[0, 0], [1, 1]] },
            properties: { routeId: '2', headway: 10, agencyName: 'TTC', routeType: 3 } // Bus
          }
        ]
      }
    };

    const { result } = renderHook(() => useIntervalStats(layersWithModes, { 
      ...defaultFilters, 
      modes: new Set([1]) 
    }));
    
    expect(result.current.stats?.matching).toBe(1);
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

  it('should handle empty layers gracefully', () => {
    const { result } = renderHook(() => useIntervalStats({}, defaultFilters));
    expect(result.current.stats).toBeNull();
    expect(result.current.searchMatches).toBeNull();
  });
});
