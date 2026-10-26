import { describe, expect, it } from 'vitest';
import { labelsThatFit } from '../chartLabels';

describe('labelsThatFit (#1037)', () => {
  it('two points in the same month: only one label, the latest wins', () => {
    const pts = [{ x: 20, y: 50 }, { x: 150, y: 30 }, { x: 198, y: 26 }, { x: 200, y: 20 }];
    expect([...labelsThatFit(pts, 28, 9)].sort()).toEqual([0, 1, 3]);
  });

  it('points far apart, or close in x but far apart in y, all keep their labels', () => {
    expect(labelsThatFit([{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 100, y: 0 }], 28, 9).size).toBe(3);
    expect(labelsThatFit([{ x: 0, y: 0 }, { x: 10, y: 30 }, { x: 100, y: 0 }], 28, 9).size).toBe(3);
  });

  it('x-axis labels (no height): first and last always, the rest need room', () => {
    const pts = [0, 20, 40, 60, 200].map(x => ({ x, y: 0 }));
    expect([...labelsThatFit(pts, 34)].sort((a, b) => a - b)).toEqual([0, 2, 4]);
  });
});
