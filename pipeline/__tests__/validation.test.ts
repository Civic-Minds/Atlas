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

  it('allows location_type 3 pathway nodes without stop_lat/stop_lon (MBTA style)', () => {
    const gtfs = minimalValidGtfs();
    gtfs.stops!.push({
      stop_id: 'node-1-platform',
      stop_name: 'Andrew',
      stop_lat: '',
      stop_lon: '',
      location_type: '3',
      parent_station: 'place-andrw',
    } as any);
    const report = validateGtfs(gtfs, 'mbta-pathway');
    expect(report.errors).toBe(0);
    expect(report.issues.some(i => i.code === 'E020' || String(i.code).startsWith('E040_stop_'))).toBe(false);
  });

  it('still requires coordinates on ordinary stops (location_type 0)', () => {
    const gtfs = minimalValidGtfs();
    gtfs.stops![0].stop_lat = '';
    gtfs.stops![0].stop_lon = '';
    const report = validateGtfs(gtfs, 'bad-stop');
    expect(report.errors).toBeGreaterThan(0);
    expect(report.issues.some(i => i.code === 'E040_stop_lat' || i.code === 'E020')).toBe(true);
  });

  it('treats duplicate trip_ids as warnings (pipeline keeps one row per id)', () => {
    const gtfs = minimalValidGtfs();
    gtfs.trips!.push({ route_id: 'R1', service_id: 'WK', trip_id: 'T1' });
    const report = validateGtfs(gtfs, 'dup-trip');
    expect(report.errors).toBe(0);
    const e032 = report.issues.find(i => i.code === 'E032');
    expect(e032?.severity).toBe('warning');
    expect(e032?.count).toBe(1);
  });

  it('warns on GTFS-Flex stop_times that use location_id without stop_id (no hard fail)', () => {
    const gtfs = minimalValidGtfs();
    gtfs.stopTimes!.push({
      trip_id: 'T1',
      stop_id: '',
      stop_sequence: '2',
      arrival_time: '',
      departure_time: '',
      location_id: 'area_146',
    });
    const report = validateGtfs(gtfs, 'flex');
    expect(report.errors).toBe(0);
    expect(report.issues.some(i => i.code === 'W032' && i.severity === 'warning')).toBe(true);
    expect(report.issues.some(i => i.code === 'E040_stop_id')).toBe(false);
  });

  it('still errors when stop_id is missing without a flex location_id', () => {
    const gtfs = minimalValidGtfs();
    gtfs.stopTimes!.push({
      trip_id: 'T1',
      stop_id: '',
      stop_sequence: '2',
      arrival_time: '08:05:00',
      departure_time: '08:05:00',
    });
    const report = validateGtfs(gtfs, 'missing-stop');
    expect(report.errors).toBeGreaterThan(0);
    expect(report.issues.some(i => i.code === 'E040_stop_id' && i.severity === 'error')).toBe(true);
  });
});
