import { describe, expect, it } from 'vitest';
import { filterGtfsByAgencyName } from '../filterGtfs';

describe('filterGtfsByAgencyName', () => {
  it('keeps only the selected agency and its dependent GTFS records', () => {
    const result = filterGtfsByAgencyName({
      agencies: [
        { agency_id: 'metro', agency_name: 'Sistema de Transporte Colectivo Metro' },
        { agency_id: 'bus', agency_name: 'Red de Transporte de Pasajeros' },
      ],
      routes: [
        { route_id: 'm1', agency_id: 'metro', route_type: '1' },
        { route_id: 'b1', agency_id: 'bus', route_type: '3' },
      ],
      trips: [
        { trip_id: 'tm1', route_id: 'm1', service_id: 'weekday', shape_id: 'sm' },
        { trip_id: 'tb1', route_id: 'b1', service_id: 'weekday', shape_id: 'sb' },
      ],
      stops: [
        { stop_id: 'metro-stop', stop_name: 'Metro', stop_lat: '19.4', stop_lon: '-99.1' },
        { stop_id: 'bus-stop', stop_name: 'Bus', stop_lat: '19.5', stop_lon: '-99.2' },
      ],
      stopTimes: [
        { trip_id: 'tm1', stop_id: 'metro-stop', arrival_time: '08:00:00', departure_time: '08:00:00', stop_sequence: '1' },
        { trip_id: 'tb1', stop_id: 'bus-stop', arrival_time: '08:00:00', departure_time: '08:00:00', stop_sequence: '1' },
      ],
      calendar: [{ service_id: 'weekday', monday: '1', tuesday: '1', wednesday: '1', thursday: '1', friday: '1', saturday: '0', sunday: '0', start_date: '20260101', end_date: '20261231' }],
      calendarDates: [],
      shapes: [{ id: 'sm', points: [[-99.1, 19.4]] }, { id: 'sb', points: [[-99.2, 19.5]] }],
      frequencies: [{ trip_id: 'tm1', start_time: '06:00:00', end_time: '22:00:00', headway_secs: '300' }, { trip_id: 'tb1', start_time: '06:00:00', end_time: '22:00:00', headway_secs: '1800' }],
    }, 'Sistema de Transporte Colectivo Metro');

    expect(result.agencies.map(a => a.agency_id)).toEqual(['metro']);
    expect(result.routes.map(r => r.route_id)).toEqual(['m1']);
    expect(result.trips.map(t => t.trip_id)).toEqual(['tm1']);
    expect(result.stopTimes.map(st => st.trip_id)).toEqual(['tm1']);
    expect(result.stops.map(s => s.stop_id)).toEqual(['metro-stop']);
    expect(result.shapes.map(s => s.id)).toEqual(['sm']);
    expect(result.frequencies?.map(f => f.trip_id)).toEqual(['tm1']);
  });

  it('fails clearly when the requested agency is absent', () => {
    expect(() => filterGtfsByAgencyName({ agencies: [], routes: [], trips: [], stops: [], stopTimes: [], calendar: [], calendarDates: [], shapes: [] }, 'Metro')).toThrow('GTFS agency not found: Metro');
  });
});
