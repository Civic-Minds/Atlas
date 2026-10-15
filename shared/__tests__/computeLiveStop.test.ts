import { describe, expect, it } from 'vitest';
import { computeLiveStop } from '../computeLiveStop.js';

const NOW = 1_700_000_000;

function tu(tripId: string, routeId: string, stops: [string, number][]) {
  return {
    id: tripId,
    tripUpdate: {
      trip: { tripId, routeId },
      stopTimeUpdate: stops.map(([stopId, time]) => ({ stopId, arrival: { time } })),
    },
  };
}

describe('computeLiveStop', () => {
  it('returns sorted future arrivals at the stop within the horizon', () => {
    const feed = {
      entity: [
        tu('t2', '504', [['14994', NOW + 600], ['15000', NOW + 700]]),
        tu('t1', '504', [['14994', NOW + 120]]),
        tu('t3', '504', [['14994', NOW - 30]]),          // past
        tu('t4', '504', [['14994', NOW + 61 * 60]]),     // beyond 60 min
        tu('t5', '510', [['99999', NOW + 300]]),         // other stop
      ],
    };
    const r = computeLiveStop(feed, '14994', NOW);
    expect(r.now).toBe(NOW);
    expect(r.arrivals).toEqual([
      { route: '504', epoch: NOW + 120 },
      { route: '504', epoch: NOW + 600 },
    ]);
    expect(r.observedGapMin).toBe(8);
  });

  it('maps route ids to display names and falls back to the raw id', () => {
    const feed = { entity: [tu('a', '6641', [['1', NOW + 60]]), tu('b', '77', [['1', NOW + 240]])] };
    const r = computeLiveStop(feed, '1', NOW, { routeNames: new Map([['6641', '099']]) });
    expect(r.arrivals.map(a => a.route)).toEqual(['099', '77']);
  });

  it('averages gaps across several arrivals and uses departure when arrival is missing', () => {
    const feed = {
      entity: [
        tu('a', '504', [['1', NOW + 60]]),
        { id: 'b', tripUpdate: { trip: { tripId: 'b', routeId: '504' }, stopTimeUpdate: [{ stopId: '1', departure: { time: NOW + 360 } }] } },
        tu('c', '504', [['1', NOW + 900]]),
      ],
    };
    // gaps 5 and 9 → mean 7
    expect(computeLiveStop(feed, '1', NOW).observedGapMin).toBe(7);
  });

  it('returns null gap with fewer than two arrivals, and handles empty feeds', () => {
    expect(computeLiveStop({ entity: [tu('a', '504', [['1', NOW + 60]])] }, '1', NOW).observedGapMin).toBeNull();
    expect(computeLiveStop(null, '1', NOW)).toEqual({ now: NOW, arrivals: [], observedGapMin: null });
  });

  it('skips SKIPPED stop updates and duplicate trip/time pairs', () => {
    const feed = {
      entity: [
        { id: 'a', tripUpdate: { trip: { tripId: 'a', routeId: '504' }, stopTimeUpdate: [
          { stopId: '1', arrival: { time: NOW + 60 }, scheduleRelationship: 'SKIPPED' },
        ] } },
        tu('b', '504', [['1', NOW + 120], ['1', NOW + 120]]),
      ],
    };
    expect(computeLiveStop(feed, '1', NOW).arrivals).toEqual([{ route: '504', epoch: NOW + 120 }]);
  });
});
