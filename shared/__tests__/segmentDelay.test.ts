import { describe, expect, it } from 'vitest';
import { buildShape } from '../shapeProjection.js';
import {
  aggregateSegments, averageWaitSec, bandForHour, headwayBandStat, headwayWindows, percentile, projectRun,
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
    // 10 m/s, sampled every 60 s from 500 m behind A
    const samples = Array.from({ length: 7 }, (_, i) => ({ t: 1000 + i * 60, lat: LAT, lon: lonAt(-100 + i * 600) }));
    const legs = stopPassages(projectRun(samples, pattern), pattern);
    expect(legs).toHaveLength(1);
    const byStop = Object.fromEntries(legs[0].map(p => [p.stopId, p.t]));
    expect(byStop.B - byStop.A).toBeCloseTo(100, 0);
    expect(byStop.C - byStop.B).toBeCloseTo(100, 0);
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
      { t: 120, lat: LAT + 0.003, lon: lonAt(1500) }, // ~330 m off the line
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

  it('only counts a window when nearly every scheduled pass was observed', () => {
    const sched = [0, 300, 600, 900, 1200, 1500, 1800, 2100, 2400, 2700];
    expect(headwayWindows(sched.slice(0, 6), sched)).toBeNull();
    const ok = headwayWindows([0, 60, 600, 900, 1200, 1500, 1800, 2100, 2400, 2700], sched)!;
    const stat = headwayBandStat([{ date: '2026-10-01', ...ok }])!;
    expect(stat.scheduledMedianGapSec).toBe(300);
    expect(stat.excessWaitSec).toBeGreaterThan(0);
    expect(stat.withinShare).toBeLessThan(1);
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
