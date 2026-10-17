import { describe, expect, it } from 'vitest';
import type { LiveV3 } from '../../shared/liveDashboard';
import { withNiceNames } from '../LiveRoutePage';

describe('withNiceNames', () => {
  it('puts every stop name in normal case, wherever it sits in the file', () => {
    const upper = 'RONCESVALLES AVE AT HOWARD PARK AVE SOUTH SIDE';
    const v3 = {
      stops: [{ stopId: 'a', name: upper }],
      extraWait: { all: [{ directionId: 0, stopId: 'a', name: upper, order: 1, scheduledGapMin: 5, extraWaitMin: 1, gaps: 50 }] },
      patterns: { 0: [{ main: true, trips: 10, stops: [{ stopId: 'a', name: upper }] }] },
      runningTime: { stretch: { 0: { fromStopId: 'a', toStopId: 'b', fromName: upper, toName: 'KING ST W AT BAY ST' } }, branches: {}, bands: {}, byHour: {} },
      bands: { all: { stops: [{ stopId: 'a', name: upper }], buildup: [], adherence: {} } },
      bunching: [{ directionId: 0, bands: { all: { stops: [{ stopId: 'a', name: upper }], branchStops: [{ stopId: 'c', name: 'QUEEN ST E AT MCNAB RD' }], forms: null, biggestRise: null } } }],
      directionLabels: { 0: 'Eastbound' },
      method: 'Delay at a stop = the time the car left it.',
    } as unknown as LiveV3;
    const nice = withNiceNames(v3) as unknown as Record<string, any>;
    const want = 'Roncesvalles Ave at Howard Park Ave South Side';
    expect(nice.stops[0].name).toBe(want);
    expect(nice.extraWait.all[0].name).toBe(want);
    expect(nice.patterns[0][0].stops[0].name).toBe(want);
    expect(nice.runningTime.stretch[0]).toMatchObject({ fromName: want, toName: 'King St W at Bay St' });
    expect(nice.bands.all.stops[0].name).toBe(want);
    expect(nice.bunching[0].bands.all.branchStops[0].name).toBe('Queen St E at McNab Rd');
    expect(nice.directionLabels[0]).toBe('Eastbound');
    expect(nice.method).toBe('Delay at a stop = the time the car left it.');
  });
});
