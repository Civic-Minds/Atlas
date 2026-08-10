import { describe, expect, it } from 'vitest';
import { filterGtfsByAgencyId, filterGtfsByExcludedTripHeadsigns } from '../filterGtfs';
import type { GtfsData } from '../../types/gtfs';

describe('filterGtfsByAgencyId', () => {
  it('keeps only the selected agency and its dependent schedule data', () => {
    const gtfs = {
      agencies: [
        { agency_id: '23', agency_name: 'Seattle Streetcar' },
        { agency_id: '1', agency_name: 'King County Metro' },
      ],
      routes: [
        { route_id: 'streetcar', agency_id: '23', route_type: '0' },
        { route_id: 'metro', agency_id: '1', route_type: '3' },
      ],
      trips: [
        { trip_id: 'streetcar-trip', route_id: 'streetcar', service_id: 'weekday', shape_id: 'streetcar-shape' },
        { trip_id: 'metro-trip', route_id: 'metro', service_id: 'weekday', shape_id: 'metro-shape' },
      ],
      stop_times: [
        { trip_id: 'streetcar-trip', arrival_time: '08:00:00', departure_time: '08:00:00', stop_id: 'streetcar-stop', stop_sequence: '1' },
        { trip_id: 'metro-trip', arrival_time: '08:00:00', departure_time: '08:00:00', stop_id: 'metro-stop', stop_sequence: '1' },
      ],
      shapes: [{ id: 'streetcar-shape', points: [] }, { id: 'metro-shape', points: [] }],
      frequencies: [{ trip_id: 'streetcar-trip', start_time: '08:00:00', end_time: '09:00:00', headway_secs: '600' }],
      calendar: [{ service_id: 'weekday', monday: '1', tuesday: '1', wednesday: '1', thursday: '1', friday: '1', saturday: '0', sunday: '0', start_date: '20260101', end_date: '20261231' }],
      calendarDates: [],
      fareAttributes: [],
      fareRules: [],
    } as unknown as GtfsData;

    const filtered = filterGtfsByAgencyId(gtfs, '23');
    expect(filtered.agencies.map(a => a.agency_id)).toEqual(['23']);
    expect(filtered.routes.map(r => r.route_id)).toEqual(['streetcar']);
    expect(filtered.trips.map(t => t.trip_id)).toEqual(['streetcar-trip']);
    expect(filtered.stop_times.map(st => st.trip_id)).toEqual(['streetcar-trip']);
    expect(filtered.shapes.map(s => s.id)).toEqual(['streetcar-shape']);
    expect(filtered.frequencies?.map(f => f.trip_id)).toEqual(['streetcar-trip']);
  });
});

describe('filterGtfsByExcludedTripHeadsigns', () => {
  it('removes matching trips and their dependent schedule data', () => {
    const gtfs = {
      routes: [{ route_id: '12' }],
      trips: [
        { trip_id: 'passenger', route_id: '12', service_id: 'weekday', shape_id: 'shape-a', trip_headsign: 'Canal Street' },
        { trip_id: 'deadhead', route_id: '12', service_id: 'deadhead-service', shape_id: 'shape-b', trip_headsign: 'Not in Service' },
      ],
      stop_times: [
        { trip_id: 'passenger', stop_id: 'a', stop_sequence: '1' },
        { trip_id: 'deadhead', stop_id: 'b', stop_sequence: '1' },
      ],
      shapes: [{ id: 'shape-a', points: [] }, { id: 'shape-b', points: [] }],
      frequencies: [{ trip_id: 'deadhead', start_time: '08:00:00', end_time: '09:00:00', headway_secs: '600' }],
      calendar: [
        { service_id: 'weekday' },
        { service_id: 'deadhead-service' },
      ],
      calendarDates: [{ service_id: 'deadhead-service' }],
    } as unknown as GtfsData;

    const filtered = filterGtfsByExcludedTripHeadsigns(gtfs, ['not in service']);
    expect(filtered.trips.map(t => t.trip_id)).toEqual(['passenger']);
    expect(filtered.stop_times.map(st => st.trip_id)).toEqual(['passenger']);
    expect(filtered.shapes.map(s => s.id)).toEqual(['shape-a']);
    expect(filtered.frequencies).toEqual([]);
    expect(filtered.calendar).toEqual([{ service_id: 'weekday' }]);
    expect(filtered.calendarDates).toEqual([]);
  });
});
