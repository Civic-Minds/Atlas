import { describe, expect, it } from 'vitest';
import { buildShape } from '../shapeProjection.js';
import {
  aggregateSegments, averageWaitSec, bandForHour, classifyTripStops, detectHolds, headwayBandStat, isTurnBack, standingStillExcess, headwayWindows, percentile, projectRun,
  segmentObservations, stopPassages, type Pattern, type ScheduledRunTimes,
} from '../segmentDelay.js';

// A straight east-west line along latitude 43.65, ~0.0124 deg lon per km.
const LAT = 43.65;
const lonAt = (m: number) => -79.4 + m / 80_500;
const shape = buildShape([[lonAt(0), LAT], [lonAt(3000), LAT]]);
const pattern: Pattern = {
  id: 's', directionId: 0, shape,
  stops: [{ stopId: 'A', along: 0 }, { stopId: 'B', along: 1000 }, { stopId: 'C', along: 2000 }, { stopId: 'D', along: 3000 }],
};

describe('stopPassages', () => {
  it('interpolates the time a vehicle passed each stop by distance along the shape', () => {
    // 10 m/s, sampled every 60 s from the start of the line
    const samples = Array.from({ length: 6 }, (_, i) => ({ t: 1000 + i * 60, lat: LAT, lon: lonAt(i * 600) }));
    const legs = stopPassages(projectRun(samples, pattern), pattern);
    expect(legs).toHaveLength(1);
    const byStop = Object.fromEntries(legs[0].map(p => [p.stopId, p.t]));
    expect(byStop.B - byStop.A).toBeCloseTo(100, 0);
    expect(byStop.C - byStop.B).toBeCloseTo(100, 0);
  });

  it('drops a fix that implies an impossible speed', () => {
    const samples = [
      { t: 0, lat: LAT, lon: lonAt(900) },
      { t: 60, lat: LAT, lon: lonAt(2500) }, // 1.6 km in 60 s
      { t: 120, lat: LAT, lon: lonAt(1500) },
    ];
    const ids = stopPassages(projectRun(samples, pattern), pattern).flat().map(p => p.stopId);
    expect(ids).toEqual(['B']);
  });

  it('skips stops whose bracketing samples are too far apart in time', () => {
    const samples = [
      { t: 0, lat: LAT, lon: lonAt(500) },
      { t: 600, lat: LAT, lon: lonAt(1500) }, // 10 min gap across B
      { t: 660, lat: LAT, lon: lonAt(2100) },
    ];
    const ids = stopPassages(projectRun(samples, pattern), pattern).flat().map(p => p.stopId);
    expect(ids).toEqual(['C']);
  });

  it('never pairs stops across a diversion off the route', () => {
    const samples = [
      { t: 0, lat: LAT, lon: lonAt(900) },
      { t: 60, lat: LAT, lon: lonAt(1100) },
      { t: 120, lat: LAT + 0.0007, lon: lonAt(1500) }, // ~78 m off the line
      { t: 180, lat: LAT, lon: lonAt(1900) },
      { t: 240, lat: LAT, lon: lonAt(2100) },
    ];
    const legs = stopPassages(projectRun(samples, pattern), pattern);
    const obs = segmentObservations(legs, pattern, '2026-10-01');
    expect(obs.map(o => `${o.fromStopId}>${o.toStopId}`)).toEqual([]);
    expect(legs.flat().map(p => p.stopId)).toEqual(['B', 'C']);
  });
});

describe('aggregateSegments', () => {
  it('compares each pass with the timetable time for its band and reports median and 90th percentile', () => {
    const sched: ScheduledRunTimes = new Map([['k', new Map([['A>B', new Map([['midday', 60]])]])]]);
    const obs = Array.from({ length: 10 }, (_, i) => ({
      fromStopId: 'A', toStopId: 'B', directionId: 0, departT: 0, actualSec: 60 + i * 10, date: i < 5 ? '2026-10-01' : '2026-10-02',
    }));
    const [s] = aggregateSegments(obs, sched, () => 'k', () => 12);
    expect(s.bands.midday).toMatchObject({ trips: 10, days: 2, scheduledMedianSec: 60, gainedMedianSec: 45, gainedP90Sec: 80 });
    expect(s.bands.all?.trips).toBe(10);
  });

  it('drops passes on dates with no timetable instead of guessing', () => {
    const sched: ScheduledRunTimes = new Map();
    const obs = [{ fromStopId: 'A', toStopId: 'B', directionId: 0, departT: 0, actualSec: 60, date: '2026-09-01' }];
    expect(aggregateSegments(obs, sched, () => null, () => 12)).toEqual([]);
  });
});

describe('headway adherence', () => {
  it('average wait is half the headway when spacing is perfectly even, and grows with bunching', () => {
    expect(averageWaitSec([300, 300, 300])).toBe(150);
    expect(averageWaitSec([60, 540])).toBeGreaterThan(150);
  });

  const sched = Array.from({ length: 10 }, (_, i) => ({ tripId: `t${i}`, t: i * 300 }));

  it('never turns an unobserved pass into a fake long gap', () => {
    // Perfect service, but trip t5 wasn't seen: the stretch splits around it.
    const seen = new Map(sched.filter(s => s.tripId !== 't5').map(s => [s.tripId, s.t]));
    const wins = headwayWindows(sched, seen, [...seen.values()]);
    expect(wins.map(w => w.actualGaps)).toEqual([[300, 300, 300, 300], [300, 300, 300]]);
    const stat = headwayBandStat(wins.map(w => ({ date: 'd', ...w })))!;
    expect(stat.excessWaitSec).toBe(0);
    expect(stat.withinShare).toBe(1);
  });

  it('measures bunching as extra wait', () => {
    const seen = new Map(sched.map(s => [s.tripId, s.tripId === 't1' ? 30 : s.t]));
    const [w] = headwayWindows(sched, seen, [...seen.values()]);
    const stat = headwayBandStat([{ date: 'd', ...w }])!;
    expect(stat.excessWaitSec).toBeGreaterThan(0);
    expect(stat.withinShare).toBeLessThan(1);
  });

  it('grades each window against its own schedule', () => {
    const even = (gap: number) => ({ date: 'd', actualGaps: [gap, gap, gap], scheduledGaps: [gap, gap, gap] });
    const stat = headwayBandStat([even(240), even(600)])!;
    expect(stat.withinShare).toBe(1);
    expect(stat.excessWaitSec).toBe(0);
  });

  it('returns null extra wait when there is nothing to measure', () => {
    expect(headwayBandStat([])).toBeNull();
  });
});

describe('helpers', () => {
  it('bands wrap past midnight', () => {
    expect(bandForHour(8)).toBe('am');
    expect(bandForHour(16)).toBe('pm');
    expect(bandForHour(2)).toBe('late');
    expect(bandForHour(25)).toBe('late');
  });
  it('percentile uses nearest rank', () => {
    expect(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 0.9)).toBe(9);
  });
});

describe('detectHolds', () => {
  it('finds a 2+ minute stop at a stop, and ignores a short dwell', () => {
    const at = (m: number, t: number) => ({ t, lat: LAT, lon: lonAt(m) });
    const held = [at(900, 0), at(995, 60), at(1000, 120), at(1005, 180), at(1300, 240)];
    expect(detectHolds(projectRun(held, pattern), pattern)).toEqual([{ stopId: 'B', start: 60, end: 180 }]);
    const dwell = [at(900, 0), at(1000, 60), at(1400, 120)];
    expect(detectHolds(projectRun(dwell, pattern), pattern)).toEqual([]);
  });

  it('only reports a stop when the vehicle sat near one', () => {
    const at = (m: number, t: number) => ({ t, lat: LAT, lon: lonAt(m) });
    const midBlock = [at(1500, 0), at(1500, 60), at(1505, 120), at(1510, 180)];
    expect(detectHolds(projectRun(midBlock, pattern), pattern)).toEqual([]);
  });
});

describe('classifyTripStops', () => {
  // Five stops 1 km apart, 2 min apart in the timetable.
  const base = {
    stopIds: ['A', 'B', 'C', 'D', 'E'], stopAlong: [0, 1000, 2000, 3000, 4000],
    scheduledT: [0, 120, 240, 360, 480], feedDown: () => false,
  };
  const pass = (entries: [string, number][]) => new Map(entries);
  const ping = (t: number, along: number | null) => ({ t, along });

  it('a trip nobody reported is "not seen" only with a healthy feed and no unlisted cars about', () => {
    expect(classifyTripStops({ ...base, passT: pass([]), pings: [] })).toEqual(Array(5).fill('not_seen'));
    expect(classifyTripStops({ ...base, passT: pass([]), pings: [], feedDown: t => t === 360 })).toEqual(Array(5).fill('feed_gap'));
    expect(classifyTripStops({ ...base, passT: pass([]), pings: [], unlistedCover: true })).toEqual(Array(5).fill('unlisted_cover'));
  });

  it('judges a late join by where the car first appears on the route, not by timetable times', () => {
    // First seen 2.5 km along: A and B were never served by this car (a short turn elsewhere).
    const args = { ...base, passT: pass([['C', 300], ['D', 420], ['E', 540]]), pings: [ping(250, 2500), ping(310, 2100), ping(540, 4000)] };
    expect(classifyTripStops(args).slice(0, 2)).toEqual(['joined_late', 'joined_late']);
    // Only when the car finished its previous trip right by stop A did it start at the start.
    expect(classifyTripStops({ ...args, startedAtFirstStop: true }).slice(0, 2)).toEqual(['timing_gap', 'timing_gap']);
  });

  it('ignores early reports from a car still running the other way on its previous trip', () => {
    // Took this trip number at 3.5 km while heading back towards A, then ran A -> E.
    const pings = [ping(-300, 3500), ping(-200, 2000), ping(-100, 500), ping(0, 0), ping(130, 1100), ping(480, 4000)];
    const res = classifyTripStops({ ...base, passT: pass([['B', 120], ['E', 480]]), pings });
    expect(res[0]).toBe('timing_gap');
  });

  it('stops beyond the car\'s last position on the route are "stopped reporting"; a quiet spell it came back from is not', () => {
    expect(classifyTripStops({ ...base, passT: pass([['A', 0], ['B', 120]]), pings: [ping(0, 0), ping(60, 500), ping(170, 1700)] }))
      .toEqual(['ran', 'ran', 'timing_gap', 'stopped_reporting', 'stopped_reporting']);
    expect(classifyTripStops({ ...base, passT: pass([['A', 0], ['E', 480]]), pings: [ping(0, 0), ping(60, 500), ping(480, 4000)] }))
      .toEqual(['ran', 'timing_gap', 'quiet_spell', 'quiet_spell', 'ran']);
  });

  it('labels untimed stops during a detour as off route, and stops after a turn-back separately', () => {
    const pings = [0, 60, 120, 180, 240, 300, 360, 420, 480].map(t => ping(t, t * 8.3));
    expect(classifyTripStops({ ...base, passT: pass([['A', 0], ['B', 120], ['E', 480]]), pings, offRoute: [[200, 380]] }).slice(2, 4))
      .toEqual(['off_route', 'off_route']);
    expect(classifyTripStops({ ...base, passT: pass([['A', 0], ['B', 120]]), pings: pings.slice(0, 3), startedOtherTripAfterIndex: 1 }).slice(2))
      .toEqual(['started_other_trip', 'started_other_trip', 'started_other_trip']);
  });
});

describe('isTurnBack', () => {
  const ok = {
    metresFromRouteEnd: 3000, nextTripSameDirection: false, gapSec: 300, distanceM: 100,
    reversedM: 600, overlappingCars: false, offRouteBeforeEnd: false,
  };
  it('needs the opposite direction, distance from the route end, and an actual reversal', () => {
    expect(isTurnBack(ok)).toBe(true);
    expect(isTurnBack({ ...ok, nextTripSameDirection: true })).toBe(false); // trip-number change
    expect(isTurnBack({ ...ok, metresFromRouteEnd: 400 })).toBe(false); // terminal loop
    expect(isTurnBack({ ...ok, reversedM: 0 })).toBe(false); // took the next trip number but didn't head back
    expect(isTurnBack({ ...ok, overlappingCars: true })).toBe(false); // two cars on one trip number
    expect(isTurnBack({ ...ok, offRouteBeforeEnd: true })).toBe(false); // a detour, not a turn-back
  });
  it('counts late cars too (no "stopped before its scheduled end" rule)', () => {
    expect(isTurnBack(ok)).toBe(true);
  });
});

describe('standingStillExcess', () => {
  const ok = {
    start: 5000, end: 5300, runFirst: 1000, runLast: 9000, stopIndex: 10, patternStops: 40,
    nearCarhouse: false, scheduledStart: 1000, scheduledEnd: 9000, scheduledDwellSec: 60,
  };
  it('counts only time beyond the timetable dwell, away from trip changes, ends and carhouses (blocker 4)', () => {
    expect(standingStillExcess(ok)).toBe(240);
    expect(standingStillExcess({ ...ok, runLast: 5500 })).toBeNull(); // car left the feed / changed trip soon after
    expect(standingStillExcess({ ...ok, start: 1200 })).toBeNull(); // right after a trip change
    expect(standingStillExcess({ ...ok, stopIndex: 1 })).toBeNull(); // pattern end
    expect(standingStillExcess({ ...ok, nearCarhouse: true })).toBeNull();
    expect(standingStillExcess({ ...ok, end: 9500, runLast: 20000 })).toBeNull(); // outside the trip's span
    expect(standingStillExcess({ ...ok, scheduledDwellSec: 240 })).toBeNull(); // only 60 s over the timetable
  });
});
