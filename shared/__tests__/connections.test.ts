import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  compareStopsWorstFirst, connectionWaits, formatClock, gtfsTimeToMinutes, isNearby, NEARBY_METERS, rankWorstFirst, summarizeWaits,
  type HubArrival, type LocalDeparture,
} from '../connections';

const arrival = (time: number, routeName = 'West'): HubArrival => ({ time, routeName, headsign: null });
const departure = (time: number, routeName = '1', distanceM = 100): LocalDeparture => ({
  time, agencySlug: 'local', routeName, headsign: null, stopName: 'Stop', distanceM,
});

describe('connectionWaits (CIV-101)', () => {
  it('gives the real wait for the next local departure, with no cut-off', () => {
    const waits = connectionWaits([arrival(600), arrival(700)], [departure(590), departure(606, '2'), departure(900, '3')]);
    expect(waits.map(w => [w.waitMin, w.next?.routeName])).toEqual([[6, '2'], [200, '3']]);
  });

  it('counts a departure in the same minute as the arrival', () => {
    expect(connectionWaits([arrival(600)], [departure(600)])[0].waitMin).toBe(0);
  });

  it('reads "no local bus" when nothing leaves after the arrival that service day', () => {
    const [w] = connectionWaits([arrival(1300)], [departure(400), departure(1290)]);
    expect(w.next).toBeNull();
    expect(w.waitMin).toBeNull();
  });

  it('keeps times past 24:00 in the same service day', () => {
    expect(gtfsTimeToMinutes('25:10:00')).toBe(1510);
    expect(connectionWaits([arrival(1440 + 5)], [departure(1440 + 20)])[0].waitMin).toBe(15);
    expect(formatClock(1510)).toBe('1:10 AM');
  });

  it('prefers the closer stop when two departures leave at the same minute', () => {
    const [w] = connectionWaits([arrival(600)], [departure(610, 'far', 380), departure(610, 'near', 20)]);
    expect(w.next?.routeName).toBe('near');
  });

  it('reads blank GTFS times as missing', () => {
    expect(gtfsTimeToMinutes('')).toBeNull();
    expect(gtfsTimeToMinutes(undefined)).toBeNull();
    expect(gtfsTimeToMinutes('08:45:00')).toBe(525);
  });
});

describe('nearby is 400 m in a straight line', () => {
  it('uses 400 m', () => {
    expect(NEARBY_METERS).toBe(400);
    const a = { lat: 39.7196, lon: -105.1295 };
    expect(isNearby(a, { lat: a.lat + 0.0035, lon: a.lon })).toBe(true); // about 390 m
    expect(isNearby(a, { lat: a.lat + 0.0037, lon: a.lon })).toBe(false); // about 410 m
  });
});

describe('ranking: worst first, no cut-off and no pass/fail', () => {
  const stop = (name: string, waits: Array<number | null>) => ({
    name,
    waits: waits.map((w, i) => ({ arrival: arrival(600 + i), next: w === null ? null : departure(600 + i + w), waitMin: w })),
  });

  it('ranks arrivals with no local bus after them worst, then the longest real wait', () => {
    const ranked = rankWorstFirst([stop('short', [2, 3]), stop('none-after', [1, null]), stop('long', [5, 90]), stop('empty', [])], s => s.waits);
    expect(ranked.map(r => r.item.name)).toEqual(['none-after', 'long', 'short', 'empty']);
  });

  it('summarizes from the same waits the table shows', () => {
    expect(summarizeWaits(stop('x', [4, null, 10, 2]).waits)).toEqual({ arrivals: 4, noBusAfter: 1, longestWaitMin: 10, medianWaitMin: 4 });
    expect(compareStopsWorstFirst(summarizeWaits([]), summarizeWaits(stop('y', [1]).waits))).toBeGreaterThan(0);
  });
});

describe('real sample: Bustang at Federal Center Station and RTD within 400 m, Wednesday 2026-11-04', () => {
  // Bustang arrivals and RTD boarding departures read from the published zips (see the fixture's note).
  // Expected waits hand-checked against the raw stop_times:
  //   West 116053714 arrives 08:45:00 -> RTD 17 trip 116040991 leaves stop 33665 at 08:45:02: 0 min
  //   Pegasus 116053073 arrives 09:35:00 -> RTD 3 trip 116042780 leaves stop 34370 at 09:38:40: 4 min
  //   Pegasus 116053074 arrives 11:35:00 -> RTD W trip 116034554 leaves stop 33566 at 11:39:45: 5 min
  //   West 116053716 arrives 11:45:00 -> RTD 17 trip 116040898 leaves stop 34370 at 11:46:14: 1 min
  const fixture = JSON.parse(readFileSync(join(__dirname, 'fixtures', 'bustang-rtd-federal-center-weekday.json'), 'utf8')) as {
    arrivals: HubArrival[];
    departures: LocalDeparture[];
  };

  it('matches the hand-checked waits', () => {
    const waits = connectionWaits(fixture.arrivals, fixture.departures);
    expect(waits.map(w => [formatClock(w.arrival.time), w.arrival.routeName, w.waitMin, w.next?.routeName])).toEqual([
      ['8:45 AM', 'West', 0, '17'],
      ['9:35 AM', 'Pegasus', 4, '3'],
      ['11:35 AM', 'Pegasus', 5, 'W'],
      ['11:45 AM', 'West', 1, '17'],
    ]);
    expect(waits.every(w => w.next!.distanceM <= NEARBY_METERS)).toBe(true);
  });
});
