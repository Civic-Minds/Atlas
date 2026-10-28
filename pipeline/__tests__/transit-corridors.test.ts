import { describe, expect, it } from 'vitest';
import { calculateCorridors, riderWait } from '../transit-corridors';
import type { GtfsData, GtfsStopTime, GtfsTrip } from '../../types/gtfs';

// Combined service where route numbers share stops (CIV-1092). Times are minutes after midnight.

const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}:00`;
const allWeek = { monday: '1', tuesday: '1', wednesday: '1', thursday: '1', friday: '1', saturday: '0', sunday: '0' };

interface Run { route: string; stops: string[]; starts: number[]; service?: string; skipPickup?: string[] }

function feed(runs: Run[], calendar = [{ service_id: 'wk', ...allWeek, start_date: '20261026', end_date: '20261130' }]): GtfsData {
  const trips: GtfsTrip[] = [];
  const stopTimes: GtfsStopTime[] = [];
  runs.forEach((run, r) => run.starts.forEach((start, k) => {
    const trip_id = `${run.route}-${r}-${k}`;
    trips.push({ trip_id, route_id: run.route, service_id: run.service ?? 'wk', direction_id: '0' } as GtfsTrip);
    run.stops.forEach((stop_id, i) => stopTimes.push({
      trip_id, stop_id, stop_sequence: String(i + 1), arrival_time: hhmm(start + i), departure_time: hhmm(start + i),
      pickup_type: run.skipPickup?.includes(stop_id) ? '1' : undefined,
    } as GtfsStopTime));
  }));
  const routes = [...new Set(runs.map(r => r.route))].map(id => ({ route_id: id, route_short_name: id, route_type: '3' }));
  return { agencies: [], routes, trips, stops: [], stopTimes, calendar, calendarDates: [], shapes: [] } as unknown as GtfsData;
}

// Every 20 from 09:00 to past the midday's end (15:00), offset by `offset` minutes for the second route.
const every20 = (offset = 0) => Array.from({ length: 24 }, (_, i) => 540 + offset + i * 20);
const shared = ['A', 'B', 'C', 'D'];

describe('riderWait', () => {
  it('reads the wait of a rider arriving at random, bunched pairs as one bus', () => {
    expect(riderWait([0, 10, 20, 30], 0, 30)).toBe(10);
    expect(riderWait([0, 5, 20, 25, 40], 0, 40)).toBeCloseTo(12.5);
    expect(riderWait([0, 1, 20, 21, 40], 0, 41)).toBe(20);
    expect(riderWait([0, 20], 0, 60)).toBeNull();
  });
});

describe('calculateCorridors (CIV-1092)', () => {
  it('two routes every 20 that alternate evenly give every 10 on the shared stops', () => {
    const [c] = calculateCorridors(feed([
      { route: '165', stops: ['X', ...shared], starts: every20() },
      { route: '96', stops: [...shared, 'Y'], starts: every20(10) },
    ]), 'Weekday', '20261028');
    expect(c).toMatchObject({ stopIds: shared, routeNames: ['165', '96'] });
    expect(c.waits.midday).toBe(10);
    expect(c.routeWaits['165'].midday).toBe(20);
  });

  it('two routes every 20 running five minutes apart give every 13, not 10', () => {
    const [c] = calculateCorridors(feed([
      { route: '165', stops: shared, starts: every20() },
      { route: '96', stops: shared, starts: every20(5) },
    ]), 'Weekday', '20261028');
    expect(c.waits.midday).toBe(13); // gaps of 5 and 15: (25 + 225) / 20 = 12.5
  });

  it('routes that cross at one or two stops, or share stops in opposite directions, make no corridor', () => {
    expect(calculateCorridors(feed([
      { route: '84', stops: ['P', 'A', 'B', 'Q'], starts: every20() },
      { route: '165', stops: ['R', 'A', 'B', 'S'], starts: every20(10) },
    ]), 'Weekday', '20261028')).toEqual([]);
    expect(calculateCorridors(feed([
      { route: '165', stops: shared, starts: every20() },
      { route: '96', stops: [...shared].reverse(), starts: every20(10) },
    ]), 'Weekday', '20261028')).toEqual([]);
  });

  it('a bus that only sets down, or skips a stop, adds no departure there', () => {
    // 96 skips B, so A>B>C>D is not shared and the corridor needs another run of three.
    expect(calculateCorridors(feed([
      { route: '165', stops: shared, starts: every20() },
      { route: '96', stops: ['A', 'C', 'D'], starts: every20(10) },
    ]), 'Weekday', '20261028')).toEqual([]);
    expect(calculateCorridors(feed([
      { route: '165', stops: shared, starts: every20() },
      { route: '96', stops: shared, starts: every20(10), skipPickup: ['B'] },
    ]), 'Weekday', '20261028')).toEqual([]);
  });

  it('a route running only some weekdays never makes the Weekday corridor better than its worst day', () => {
    const [c] = calculateCorridors(feed([
      { route: '165', stops: shared, starts: every20() },
      { route: '96', stops: shared, starts: every20(10), service: 'mon' },
    ], [
      { service_id: 'wk', ...allWeek, start_date: '20261026', end_date: '20261130' },
      { service_id: 'mon', ...allWeek, tuesday: '0', wednesday: '0', thursday: '0', friday: '0', start_date: '20261026', end_date: '20261130' },
    ]), 'Weekday', '20261028');
    expect(c.waits.midday).toBe(20);
  });
});

describe('riderWait reads the whole period', () => {
  it('a burst of three buses ten minutes apart at the start of a six-hour period is not "every 10"', () => {
    // 09:00-15:00 with buses at 09:00, 09:10, 09:20 and the next at 15:30.
    expect(riderWait([540, 550, 560, 930], 540, 900)).toBeGreaterThan(300);
  });
  it('a period whose service starts late counts the wait for the first bus', () => {
    expect(riderWait([600, 610, 620, 630, 640, 650, 660], 540, 660)).toBe(35);
  });
  it('a period whose service stops partway has no value', () => {
    // Every 10 from 09:00 to 13:00, then nothing for the last two hours of the midday.
    expect(riderWait(Array.from({ length: 25 }, (_, i) => 540 + i * 10), 540, 900)).toBeNull();
  });
});
