import { describe, expect, it } from 'vitest';
import { frequencyChanges, parseClock, parseDay, parsePeriod, periodsIn, publicAgencies } from '../mcp/atlasData';
import { stopToStopRuns } from '../../pipeline/stopToStop';
import type { GtfsData } from '../../types/gtfs';
import type { StudioBeforeAfterFile } from '../../shared/studioBeforeAfter';

describe('Atlas MCP server data (CIV-1650)', () => {
  it('reads days and periods by the shared names', () => {
    expect([parseDay('saturday'), parseDay(undefined), parseDay('nonsense')]).toEqual(['Saturday', 'Weekday', 'Weekday']);
    expect([parsePeriod('Midday'), parsePeriod('AM peak'), parsePeriod('pm_peak'), parsePeriod('lunch')]).toEqual(['midday', 'amPeak', 'pmPeak', null]);
  });

  it('answers only for public agencies', () => {
    expect(publicAgencies().length).toBeGreaterThan(100);
    expect(publicAgencies().some(a => a.betaOnly)).toBe(false);
  });

  it('lists schedule changes by the shared rule: a move inside a grade is none (Hamilton 44, 30 → 29)', () => {
    const day = (midday: number | null) => ({ headway: { midday }, trips: 0, first: null, last: null, runMinutes: [] });
    const file = { changes: [
      { route: '44', name: null, before: day(30), after: day(29), size: 'small' },
      { route: '1', name: null, before: day(30), after: day(15), size: 'frequency' },
      { route: '2', name: null, before: null, after: day(20), size: 'frequency' },
    ] } as unknown as StudioBeforeAfterFile;
    expect(frequencyChanges(file).map(c => [c.route, c.steps])).toEqual([['2', 8], ['1', 2]]);
  });

  it('reads clock times and names the Atlas periods a window overlaps', () => {
    expect(['10:00', '10 AM', '6 PM', '6:30 pm', '12 AM', 'noon'].map(parseClock)).toEqual([600, 600, 1080, 1110, 0, null]);
    expect(periodsIn(600, 1080)).toEqual(['Midday (9 AM–3 PM)', 'PM peak (3–7 PM)']);
  });

  it('times trips from one stop to a later one, matching a stop by its station, on the day read', () => {
    const day = { monday: '1', tuesday: '1', wednesday: '1', thursday: '1', friday: '1', saturday: '1', sunday: '1' };
    const st = (trip: string, stop: string, seq: number, time: string) => ({ trip_id: trip, stop_id: stop, stop_sequence: String(seq), arrival_time: time, departure_time: time });
    const gtfs = {
      routes: [{ route_id: 'r', route_short_name: '9' }],
      trips: [{ trip_id: 't1', route_id: 'r', service_id: 's' }, { trip_id: 't2', route_id: 'r', service_id: 's' }, { trip_id: 'back', route_id: 'r', service_id: 's' }],
      stops: [{ stop_id: 'A1', stop_name: 'A platform', parent_station: 'A' }, { stop_id: 'B', stop_name: 'B' }],
      stopTimes: [st('t1', 'A1', 1, '10:00:00'), st('t1', 'B', 2, '10:30:00'), st('t2', 'A1', 1, '10:20:00'), st('t2', 'B', 2, '10:45:00'), st('back', 'B', 1, '11:00:00'), st('back', 'A1', 2, '11:30:00')],
      calendar: [{ service_id: 's', ...day, start_date: '20260101', end_date: '20271231' }],
      calendarDates: [],
    } as unknown as GtfsData;
    const { runs } = stopToStopRuns(gtfs, new Set(['A']), new Set(['B']), 'Saturday');
    expect(runs.map(r => [r.tripId, r.start, r.minutes]).sort()).toEqual([['t1', 600, 30], ['t2', 620, 25]]);
  });
});
