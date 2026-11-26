import { describe, expect, it } from 'vitest';
import { minuteTicks, runTimeAxis } from '../chartAxis';

describe('chart axis (CIV-2976 D13)', () => {
  it('pads by 2 minutes onto whole 5s, never below 0; empty is 0 to 10', () => {
    expect(runTimeAxis([])).toEqual({ min: 0, max: 10 });
    expect(runTimeAxis([23, 41])).toEqual({ min: 20, max: 45 });
    expect(runTimeAxis([1, 3])).toEqual({ min: 0, max: 5 });
  });
  it('ticks every 5, or every 10 over a 30-minute range', () => {
    expect(minuteTicks({ min: 20, max: 45 })).toEqual([20, 25, 30, 35, 40, 45]);
    expect(minuteTicks({ min: 0, max: 40 })).toEqual([0, 10, 20, 30, 40]);
    expect(minuteTicks({ min: 0, max: 30 })).toEqual([0, 5, 10, 15, 20, 25, 30]);
  });
});
