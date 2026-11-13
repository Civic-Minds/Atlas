import { describe, expect, it } from 'vitest';
import { lateStopSpots } from '../lateStopsMapModel';
import { lateStopDotPaint, stopDotPaint } from '../../Interval/map/stopStyle';

const row = (key: string, lonLat: [number, number] | null, line = key) => ({ key, lonLat, name: key, line });

describe('late stops map (CIV-1405)', () => {
  it('draws one stop per spot, its card listing every row at it worst first, and leaves out rows with no position', () => {
    const spots = lateStopSpots([row('a', [-79.38, 43.656], '504 westbound: 24% late'), row('b', [-79.40, 43.65]), row('c', [-79.3801, 43.6561], '510 northbound: 18% late'), row('d', null)]);
    expect(spots.map(s => [s.key, s.lines])).toEqual([['a', ['504 westbound: 24% late', '510 northbound: 18% late']], ['b', ['b']]]);
  });
  it('draws its stops with the regular map\'s stop dot, a little bigger, growing with the zoom', () => {
    for (const light of [true, false]) expect({ ...lateStopDotPaint(light), 'circle-radius': null }).toEqual({ ...stopDotPaint(light), 'circle-radius': null });
    expect(lateStopDotPaint(true)['circle-radius']).toEqual(['interpolate', ['linear'], ['zoom'], 10, 2.5, 12, 3, 16, 6]);
  });
});
