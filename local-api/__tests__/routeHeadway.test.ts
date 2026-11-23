import { describe, expect, it } from 'vitest';
import { addTripArrivals, routeHeadway, type RouteArrivals } from '../live-vehicles.js';

// #1753: a trip update lists each stop once, so headways come from successive trips at one stop.
describe('route headway from trip updates (#1753)', () => {
  const at = (stopId: string, time: number) => ({ stopId, arrival: { time } });

  it('takes the median gap between trips at the same stop', () => {
    const arrivals: RouteArrivals = new Map();
    addTripArrivals(arrivals, 't1', [at('A', 1000), at('B', 1300)]);
    addTripArrivals(arrivals, 't2', [at('A', 1420), at('B', 1720)]);
    addTripArrivals(arrivals, 't3', [at('A', 1900)]);
    // Gaps: A 7 and 8 min, B 7 min.
    expect(routeHeadway(arrivals, 900)).toEqual({ gapMin: 7, samples: 3 });
  });

  it('finds none from one trip alone, however many stops it lists', () => {
    const arrivals: RouteArrivals = new Map();
    addTripArrivals(arrivals, 't1', [at('A', 1000), at('B', 1300), at('C', 1600)]);
    expect(routeHeadway(arrivals, 900)).toBeNull();
  });

  it('leaves out stops already passed and a trip listed twice', () => {
    const arrivals: RouteArrivals = new Map();
    addTripArrivals(arrivals, 't1', [at('A', 800)]);
    addTripArrivals(arrivals, 't2', [at('A', 1000)]);
    addTripArrivals(arrivals, 't3', [at('A', 1600)]);
    addTripArrivals(arrivals, 't3', [at('A', 1600)]);
    // Only t2 and t3 are still ahead at 900: one 10-minute gap.
    expect(routeHeadway(arrivals, 900)).toEqual({ gapMin: 10, samples: 1 });
  });

  it('uses the departure where a stop has no arrival', () => {
    const arrivals: RouteArrivals = new Map();
    addTripArrivals(arrivals, 't1', [{ stopId: 'A', departure: { time: 1000 } }]);
    addTripArrivals(arrivals, 't2', [{ stopId: 'A', departure: { time: 1300 } }]);
    expect(routeHeadway(arrivals, 900)).toEqual({ gapMin: 5, samples: 1 });
  });
});
