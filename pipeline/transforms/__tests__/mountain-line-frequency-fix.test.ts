import { describe, expect, it } from 'vitest';
import { fixMountainLineFrequencyWindow } from '../mountain-line-frequency-fix.js';
import { expandFrequencyWindow, parseFrequencyWindow } from '../../transit-utils.js';
import type { GtfsData } from '../../../types/gtfs.js';

// Rows and first stop times copied from the mountain-line archive (route 46436, RT 46).
const feed = (row: { start_time: string; end_time: string }, firstStop = '14:15:00'): GtfsData => ({
  agencies: [], routes: [], stops: [], calendar: [], calendarDates: [], shapes: [],
  trips: [{ route_id: '46436', service_id: 'wk', trip_id: '4705552' }, { route_id: '46436', service_id: 'wk', trip_id: '4705554' }],
  stopTimes: [
    { trip_id: '4705552', arrival_time: firstStop, departure_time: firstStop, stop_id: 'a', stop_sequence: '1' },
    { trip_id: '4705552', arrival_time: '14:52:00', departure_time: '14:52:00', stop_id: 'b', stop_sequence: '2' },
    { trip_id: '4705554', arrival_time: '08:15:00', departure_time: '08:15:00', stop_id: 'a', stop_sequence: '1' },
  ],
  frequencies: [
    { trip_id: '4705552', ...row, headway_secs: '5400', exact_times: '1' },
    { trip_id: '4705554', start_time: '08:15:00', end_time: '11:42:00', headway_secs: '5400', exact_times: '1' },
  ],
} as unknown as GtfsData);

const departures = (gtfs: GtfsData, tripId: string) => gtfs.frequencies!
  .filter(f => f.trip_id === tripId)
  .flatMap(f => expandFrequencyWindow(parseFrequencyWindow(f)!))
  .map(m => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`);

describe('Mountain Line RT 46 afternoon window (#727)', () => {
  it('starts the window at 14:15 like its trip, giving the timetable\'s four departures', () => {
    const { gtfs, fixed } = fixMountainLineFrequencyWindow(feed({ start_time: '14:45:00', end_time: '19:12:00' }));
    expect(fixed).toBe(true);
    expect(departures(gtfs, '4705552')).toEqual(['14:15', '15:45', '17:15', '18:45']);
    expect(departures(gtfs, '4705554')).toEqual(['08:15', '09:45', '11:15']);
  });

  it('leaves a feed that changed the row, or the trip, as published', () => {
    expect(fixMountainLineFrequencyWindow(feed({ start_time: '14:15:00', end_time: '19:12:00' })).fixed).toBe(false);
    expect(fixMountainLineFrequencyWindow(feed({ start_time: '14:45:00', end_time: '19:42:00' })).fixed).toBe(false);
    expect(fixMountainLineFrequencyWindow(feed({ start_time: '14:45:00', end_time: '19:12:00' }, '14:45:00')).fixed).toBe(false);
  });
});
