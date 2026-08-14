import { describe, expect, it } from 'vitest';
import { linkWvuPrtShapes } from '../wvu-prt-shapes.js';
import type { GtfsData } from '../../../types/gtfs.js';

describe('linkWvuPrtShapes', () => {
  it('links trips to the published first-stop/last-stop shapes', () => {
    const gtfs: GtfsData = {
      agencies: [],
      routes: [],
      trips: [{ route_id: '1', service_id: 'weekday', trip_id: 'trip-1' }],
      stops: [
        { stop_id: '1', stop_name: 'HSC', stop_lat: '0', stop_lon: '0' },
        { stop_id: '2', stop_name: 'Towers', stop_lat: '0', stop_lon: '0' },
      ],
      stopTimes: [
        { trip_id: 'trip-1', arrival_time: '06:30:00', departure_time: '06:30:00', stop_id: '1', stop_sequence: '1' },
        { trip_id: 'trip-1', arrival_time: '06:45:00', departure_time: '06:45:00', stop_id: '2', stop_sequence: '2' },
      ],
      calendar: [],
      calendarDates: [],
      shapes: [{ id: 'HSC-TOW', points: [[0, 0], [1, 1]] }],
    };

    expect(linkWvuPrtShapes(gtfs).trips[0].shape_id).toBe('HSC-TOW');
  });
});
