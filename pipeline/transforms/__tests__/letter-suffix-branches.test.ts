import { describe, expect, it } from 'vitest';
import type { GtfsData } from '../../../types/gtfs';
import { mergeLetterSuffixBranches } from '../letter-suffix-branches';

function minimalGtfs(overrides: Partial<GtfsData> = {}): GtfsData {
  return {
    agencies: [{ agency_name: 'Test' }],
    routes: [],
    trips: [],
    stops: [],
    stopTimes: [],
    calendar: [],
    calendarDates: [],
    shapes: [],
    ...overrides,
  };
}

describe('mergeLetterSuffixBranches', () => {
  it('merges VIVA Blue B into Blue', () => {
    const gtfs = minimalGtfs({
      routes: [
        { route_id: '601', route_short_name: 'blue', route_long_name: 'VIVA BLUE', route_type: '3' },
        { route_id: '60102', route_short_name: 'blue B', route_long_name: 'VIVA BLUE B', route_type: '3' },
      ],
      trips: [
        { trip_id: 't1', route_id: '601', service_id: 'wd' },
        { trip_id: 't2', route_id: '60102', service_id: 'wd' },
      ],
    });

    const { gtfs: out, result } = mergeLetterSuffixBranches(gtfs);
    expect(result.mergedPairs).toHaveLength(1);
    expect(out.routes).toHaveLength(1);
    expect(out.trips.every(t => t.route_id === '601')).toBe(true);
  });

  it('merges VIVA Purple A into Purple', () => {
    const gtfs = minimalGtfs({
      routes: [
        { route_id: '603', route_short_name: 'purple', route_long_name: 'VIVA PURPLE', route_type: '3' },
        { route_id: '60301', route_short_name: 'purple A', route_long_name: 'VIVA PURPLE A', route_type: '3' },
      ],
      trips: [{ trip_id: 't1', route_id: '60301', service_id: 'wd' }],
    });

    const { gtfs: out, result } = mergeLetterSuffixBranches(gtfs);
    expect(result.mergedPairs).toHaveLength(1);
    expect(out.trips[0].route_id).toBe('603');
  });

  it('skips unrelated letter-suffixed routes', () => {
    const gtfs = minimalGtfs({
      routes: [
        { route_id: 'r1', route_short_name: '90', route_long_name: 'Main Street', route_type: '3' },
        { route_id: 'r2', route_short_name: '90 A', route_long_name: 'Industrial Park', route_type: '3' },
      ],
      trips: [{ trip_id: 't1', route_id: 'r2', service_id: 'wd' }],
    });

    const { gtfs: out, result } = mergeLetterSuffixBranches(gtfs);
    expect(result.mergedPairs).toHaveLength(0);
    expect(result.skippedBranches).toContain('90 A');
    expect(out.routes).toHaveLength(2);
  });
});
