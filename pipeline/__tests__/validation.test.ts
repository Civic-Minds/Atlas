import { describe, expect, it } from 'vitest';
import { validateGtfs } from '../validation.js';
import type { GtfsData } from '../../types/gtfs.js';

function minimalValidGtfs(): GtfsData {
  return {
    agencies: [{ agency_name: 'Test Transit', agency_timezone: 'America/Toronto' }],
    routes: [{ route_id: 'R1', route_type: '3', route_short_name: '1' }],
    trips: [{ route_id: 'R1', service_id: 'WK', trip_id: 'T1' }],
    stops: [{ stop_id: 'S1', stop_name: 'Main', stop_lat: '43.0', stop_lon: '-79.0' }],
    stopTimes: [
      { trip_id: 'T1', stop_id: 'S1', stop_sequence: '1', arrival_time: '08:00:00', departure_time: '08:00:00' },
    ],
    calendar: [{
      service_id: 'WK',
      monday: '1', tuesday: '1', wednesday: '1', thursday: '1', friday: '1',
      saturday: '0', sunday: '0',
      start_date: '20240101', end_date: '20241231',
    }],
    calendarDates: [],
    shapes: [],
  };
}

describe('validateGtfs', () => {
  it('reports errors for empty required tables', () => {
    const report = validateGtfs({
      agencies: [],
      routes: [],
      trips: [],
      stops: [],
      stopTimes: [],
      calendar: [],
      calendarDates: [],
      shapes: [],
    }, 'empty');
    expect(report.errors).toBeGreaterThan(0);
    const codes = report.issues.filter(i => i.severity === 'error').map(i => i.code);
    expect(codes).toContain('E001');
    expect(codes).toContain('E002');
    expect(codes).toContain('E003');
    expect(codes).toContain('E004');
    expect(codes).toContain('E005');
  });

  it('accepts a minimal structurally valid feed (shapes missing is warning only)', () => {
    const report = validateGtfs(minimalValidGtfs(), 'ok');
    expect(report.errors).toBe(0);
    expect(report.warnings).toBeGreaterThanOrEqual(1); // W001 missing shapes
  });

  it('flags orphan trips as errors', () => {
    const gtfs = minimalValidGtfs();
    gtfs.trips!.push({ route_id: 'MISSING', service_id: 'WK', trip_id: 'T2' });
    const report = validateGtfs(gtfs, 'orphan');
    expect(report.errors).toBeGreaterThan(0);
    expect(report.issues.some(i => i.code === 'E010')).toBe(true);
  });
});
