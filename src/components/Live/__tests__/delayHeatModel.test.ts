import { describe, expect, it } from 'vitest';
import type { LiveV3 } from '../../../../shared/liveDashboard';
import { delayHeatPoints } from '../delayHeatModel';

const stop = (stopId: string, directionId: number, order: number) => ({ stopId, name: `Stop ${stopId}`, lonLat: [-79.4, 43.65], directionId, order, n: 100 });
const stretch = (from: string, to: string, n: number, added: number, terminal = false) => ({ fromStopId: from, toStopId: to, n, medianAddedMin: added, ...(terminal ? { terminal } : {}) });
const v3 = (stops: ReturnType<typeof stop>[], buildup: Array<{ directionId: number; stretches: ReturnType<typeof stretch>[] }>) =>
  ({ bands: { all: { stops, buildup, adherence: {} } } } as unknown as LiveV3);

const routeA = v3(
  [stop('T', 0, 0), stop('A', 0, 1), stop('B', 0, 2), stop('C', 0, 3), stop('D', 0, 4)],
  [{ directionId: 0, stretches: [stretch('T', 'A', 500, 2, true), stretch('A', 'B', 500, 1.2), stretch('B', 'C', 10, 3), stretch('C', 'D', 400, -0.8)] }],
);

describe('delayHeatPoints', () => {
  it('leaves out terminal stretches and stretches with too few trips, and never goes below 0', () => {
    const p = delayHeatPoints(new Map([['1', routeA]]), 'all', { uncertain: () => [] });
    expect(p.map(x => [x.stopId, x.addedMin])).toEqual([['B', 1.2], ['D', 0]]);
  });
  it('combines routes that share a stop by trip-weighted mean, whatever their direction numbers', () => {
    const routeB = v3([stop('A', 1, 0), stop('B', 1, 1)], [{ directionId: 1, stretches: [stretch('A', 'B', 1500, 0.4)] }]);
    const p = delayHeatPoints(new Map([['1', routeA], ['2', routeB]]), 'all', { uncertain: () => [] });
    const b = p.find(x => x.stopId === 'B')!;
    expect(b.addedMin).toBe(0.6);
    expect(b.n).toBe(2000);
    expect(b.routes).toEqual(['1', '2']);
  });
  it('leaves out the less exact first stops', () => {
    const p = delayHeatPoints(new Map([['1', routeA]]), 'all', { uncertain: () => [{ directionId: 0, stops: 3 }] });
    expect(p.map(x => x.stopId)).toEqual(['D']);
  });
  it('limits to one route and direction when asked', () => {
    const p = delayHeatPoints(new Map([['1', routeA]]), 'all', { only: { route: '1', directionId: 1 }, uncertain: () => [] });
    expect(p).toEqual([]);
  });
});
