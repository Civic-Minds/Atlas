import { describe, expect, it } from 'vitest';
import type { GtfsData } from '../../../types/gtfs.js';
import { headsignsFromLastStop, lastStopDestination } from '../last-stop-destinations.js';

describe('lastStopDestination (CIV-2999)', () => {
  it('reads a stop-position name as a place', () => {
    expect(lastStopDestination('EB Wellness before Willow')).toBe('Wellness & Willow');
    expect(lastStopDestination('South Strip Transit Terminal Bay 6')).toBe('South Strip Transit Terminal');
    expect(lastStopDestination('EB Blue Diamond after Rainbow')).toBe('Blue Diamond & Rainbow');
    expect(lastStopDestination('Harry Reid Intl Airport Zero Level')).toBe('Harry Reid Intl Airport Zero Level');
    expect(lastStopDestination('SB LV Blvd at Fremont St Experience')).toBe('LV Blvd at Fremont St Experience');
  });
});

describe('headsignsFromLastStop (CIV-2999, RTC Red Line)', () => {
  const gtfs = {
    routes: [{ route_id: '4760', route_short_name: 'RED LINE', route_long_name: 'RED LINE Maryland Pkwy BRT', route_type: '3' }],
    trips: [
      { trip_id: 'n', route_id: '4760', service_id: 'wk', direction_id: '0', trip_headsign: 'RED LINE Maryland Pkwy Northbound' },
      { trip_id: 's', route_id: '4760', service_id: 'wk', direction_id: '1', trip_headsign: 'RED LINE Maryland Pkwy Southbound' },
      { trip_id: 'x', route_id: '4760', service_id: 'wk', direction_id: '1', trip_headsign: 'Downtown' },
    ],
    stops: [
      { stop_id: 'sst18', stop_name: 'South Strip Transit Terminal Bay 18', stop_lat: '0', stop_lon: '0' },
      { stop_id: 'well', stop_name: 'EB Wellness before Willow', stop_lat: '0', stop_lon: '0' },
      { stop_id: 'sst6', stop_name: 'South Strip Transit Terminal Bay 6', stop_lat: '0', stop_lon: '0' },
    ],
    stopTimes: [
      { trip_id: 'n', stop_id: 'sst18', stop_sequence: '1', arrival_time: '08:00:00', departure_time: '08:00:00' },
      { trip_id: 'n', stop_id: 'well', stop_sequence: '2', arrival_time: '08:40:00', departure_time: '08:40:00' },
      { trip_id: 's', stop_id: 'well', stop_sequence: '1', arrival_time: '09:00:00', departure_time: '09:00:00' },
      { trip_id: 's', stop_id: 'sst6', stop_sequence: '2', arrival_time: '09:40:00', departure_time: '09:40:00' },
      { trip_id: 'x', stop_id: 'well', stop_sequence: '1', arrival_time: '10:00:00', departure_time: '10:00:00' },
      { trip_id: 'x', stop_id: 'sst6', stop_sequence: '2', arrival_time: '10:40:00', departure_time: '10:40:00' },
    ],
  } as unknown as GtfsData;

  it('names each direction by its last stop, and leaves a real destination as published', () => {
    const { gtfs: out, renamed } = headsignsFromLastStop(gtfs);
    const byTrip = Object.fromEntries((out.trips ?? []).map(t => [t.trip_id, t.trip_headsign]));
    expect(byTrip).toEqual({ n: 'Wellness & Willow', s: 'South Strip Transit Terminal', x: 'Downtown' });
    expect(renamed).toBe(2);
  });

  it('renames a headsign as a whole: its trips stay one group, named by the stop most of them end at, route number kept', () => {
    const trip = (id: string, headsign: string) => ({ trip_id: id, route_id: 'r', service_id: 'wk', direction_id: '0', trip_headsign: headsign });
    const stopTime = (id: string, stop: string) => ({ trip_id: id, stop_id: stop, stop_sequence: '9', arrival_time: '08:00:00', departure_time: '08:00:00' });
    const grouped = {
      routes: [{ route_id: 'r', route_short_name: '104', route_long_name: '', route_type: '3' }],
      trips: [trip('a', '104 Valley View Northbound'), trip('b', '104 Valley View Northbound'), trip('c', '104 Valley View Northbound'),
        trip('d', '104 Valley View Northbound (ends at Sahara)'), trip('e', '104 Valley View Northbound (ends at Sahara)')],
      stops: [
        { stop_id: 'ct', stop_name: 'NB Tenaya before Cheyenne', stop_lat: '0', stop_lon: '0' },
        { stop_id: 'tc', stop_name: 'EB Cheyenne after Tenaya', stop_lat: '0', stop_lon: '0' },
      ],
      // Two short-turn trips end at the same corner as the main pattern: they keep their own headsign, not a merge.
      stopTimes: [stopTime('a', 'ct'), stopTime('b', 'ct'), stopTime('c', 'tc'), stopTime('d', 'ct'), stopTime('e', 'ct')],
    } as unknown as GtfsData;
    const byTrip = Object.fromEntries((headsignsFromLastStop(grouped).gtfs.trips ?? []).map(t => [t.trip_id, t.trip_headsign]));
    expect(byTrip).toEqual({
      a: '104 Tenaya & Cheyenne', b: '104 Tenaya & Cheyenne', c: '104 Tenaya & Cheyenne',
      d: '104 Valley View Northbound (ends at Sahara)', e: '104 Valley View Northbound (ends at Sahara)',
    });
  });
});
