import { describe, expect, it } from 'vitest';
import { periodSplit } from '../research1913.js';

// CIV-1913 research only (never merged): attempt 2's pass case and must-not case, from Atlas's published hour-by-hour.
const h = (H: number, M: number) => H * 60 + M;
const every = (from: number, to: number, step: number) => { const xs: number[] = []; for (let x = from; x < to; x += step) xs.push(x); return xs; };

describe('CIV-1913 attempt 2 period split', () => {
  it('splits Metro Transit METRO E Line weekday Late: every 15 to midnight, then one trip at 1:41', () => {
    const s = periodSplit([...every(h(23, 7), h(24, 0), 15), h(25, 41)], h(23, 0), h(26, 0));
    expect(s).toMatchObject({ at: h(23, 52), before: 15, after: null });
  });
  it('does not split MBTA 116 weekday Late: every 15 to 1 AM, every 19 to 2 AM', () => {
    expect(periodSplit([...every(h(23, 5), h(25, 0), 15), ...every(h(25, 0), h(26, 0), 19)], h(23, 0), h(26, 0))).toBeNull();
  });
  it('puts TTC 105 weekday evening\'s change at about 10 PM, not just after 8 PM', () => {
    const xs = every(h(19, 0), h(22, 0), 15);
    const s = periodSplit([...xs, ...every(xs[xs.length - 1] + 25, h(23, 0), 25)], h(19, 0), h(23, 0));
    expect(s).toMatchObject({ at: h(21, 45), before: 15, after: 30 });
  });
});
