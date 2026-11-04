import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  bestWindow, compareStopsWorstFirst, connectionWaits, departuresWithin, gtfsTimeToMinutes, isNearby, NEARBY_CHOICES, NEARBY_METERS, parseNearbyChoice, rankWorstFirst, routeConnections, summarizeWaits, worstWaitGroup,
  type HubArrival, type LocalDeparture,
} from '../connections';
import { clockTime } from '../timeText';

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
    expect(clockTime(1510)).toBe('1:10 AM');
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

describe('distance choices (Ryan, 2026-11-03: 200, 400 and 800 m, starting at 400)', () => {
  it('offers the three choices and falls back to 400', () => {
    expect(NEARBY_CHOICES).toEqual([200, 400, 800]);
    expect(parseNearbyChoice('800')).toBe(800);
    expect(parseNearbyChoice(null)).toBe(400);
    expect(parseNearbyChoice('500')).toBe(400);
  });

  it('keeps the departures within each distance, so a wider choice can only shorten a wait', () => {
    const deps = [departure(640, 'far', 700), departure(610, 'mid', 400), departure(620, 'near', 150)];
    expect(departuresWithin(deps, 200).map(d => d.routeName)).toEqual(['near']);
    expect(departuresWithin(deps, 400).map(d => d.routeName)).toEqual(['mid', 'near']);
    const waits = NEARBY_CHOICES.map(m => connectionWaits([arrival(605)], departuresWithin(deps, m))[0].waitMin);
    expect(waits).toEqual([15, 5, 5]);
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
    expect(waits.map(w => [clockTime(w.arrival.time), w.arrival.routeName, w.waitMin, w.next?.routeName])).toEqual([
      ['8:45 AM', 'West', 0, '17'],
      ['9:35 AM', 'Pegasus', 4, '3'],
      ['11:35 AM', 'Pegasus', 5, 'W'],
      ['11:45 AM', 'West', 1, '17'],
    ]);
    expect(waits.every(w => w.next!.distanceM <= NEARBY_METERS)).toBe(true);
  });
});

describe('catching Bustang: the same search run backwards (Ryan, 2026-11-04)', () => {
  it('gives each Bustang departure its wait since the last local drop-off before it', () => {
    const waits = connectionWaits([arrival(600), arrival(700)], [departure(590), departure(606, '2'), departure(650, '3')], 'before');
    expect(waits.map(w => [w.waitMin, w.next?.routeName])).toEqual([[10, '1'], [50, '3']]);
  });

  it('counts a drop-off in the same minute, and reads nothing before the first local bus as no bus', () => {
    expect(connectionWaits([arrival(600)], [departure(600)], 'before')[0].waitMin).toBe(0);
    const [w] = connectionWaits([arrival(300)], [departure(400)], 'before');
    expect(w.next).toBeNull();
    expect(w.waitMin).toBeNull();
  });

  it('prefers the closer stop at the same minute on this side too', () => {
    const [w] = connectionWaits([arrival(600)], [departure(590, 'far', 380), departure(590, 'near', 20)], 'before');
    expect(w.next?.routeName).toBe('near');
  });
});

describe('routes in their best group, with a count (15, 30 or 60 min)', () => {
  // Eight Bustang arrivals an hour apart; route 1 leaves 5 min after six of them, route 2 at 25 min after two, route 3 never within 60.
  const hub = Array.from({ length: 8 }, (_, i) => arrival(360 + i * 60));
  const local = [
    ...hub.slice(0, 6).map(a => departure(a.time + 5, '1', 50)),
    ...hub.slice(0, 2).map(a => departure(a.time + 25, '2', 300)),
    departure(1400, '3'),
  ];

  it('places each route once, in the tightest window it makes at least once', () => {
    const routes = routeConnections(hub, local, 'after');
    expect(routes.map(r => [r.routeName, r.trips, r.within])).toEqual([
      ['1', 8, [6, 6, 6]],
      ['2', 8, [0, 2, 2]],
      ['3', 8, [0, 0, 0]],
    ]);
    expect(routes.map(r => bestWindow(r))).toEqual([{ window: 15, count: 6, of: 8 }, { window: 30, count: 2, of: 8 }, null]);
  });

  it("reads one route's buses alone, so another route's earlier bus does not hide it", () => {
    const routes = routeConnections([arrival(600)], [departure(601, 'A'), departure(620, 'B')], 'after');
    expect(routes.find(r => r.routeName === 'B')?.within).toEqual([0, 1, 1]);
  });

  it('works the same on the catching side', () => {
    const routes = routeConnections([arrival(600)], [departure(590, 'A'), departure(550, 'B')], 'before');
    expect(routes.map(r => [r.routeName, bestWindow(r)?.window])).toEqual([['A', 15], ['B', 60]]);
  });

  it('keeps routes of two agencies with the same name apart', () => {
    const routes = routeConnections([arrival(600)], [departure(605, '1'), { ...departure(610, '1'), agencySlug: 'other' }], 'after');
    expect(routes).toHaveLength(2);
  });
});

describe('map colour groups from the ranking summary', () => {
  it('uses the longest wait, and treats an arrival with no bus after as the worst', () => {
    const s = (longestWaitMin: number | null, noBusAfter = 0, arrivals = 3) => ({ arrivals, noBusAfter, longestWaitMin, medianWaitMin: 1 });
    expect([s(15), s(16), s(60), s(61), s(5, 1), s(null, 0, 0)].map(worstWaitGroup)).toEqual([15, 30, 60, 'longer', 'longer', null]);
  });
});
