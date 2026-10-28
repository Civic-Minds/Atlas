import { describe, expect, it } from 'vitest';
import { riderWait, stretchMedians, stretchRuns } from '../stretchMedian.js';

describe('stretch median (CIV-845 prototype)', () => {
  it('reads the rider wait as sum(gap^2) / sum(gap)', () => {
    expect(riderWait([600, 610, 620, 630], 540, 900)).toBe(10);
    expect(riderWait([600, 602, 616, 618, 632], 540, 900, 3)).toBe(12.5);
  });

  it('splits stops into runs of the same pattern set', () => {
    expect(stretchRuns(['', '', 'b', 'b', ''])).toEqual([[0, 2], [2, 4], [4, 5]]);
  });

  it('gives each stretch the median of its waits, but never more than 1 min better than a stop’s own wait', () => {
    const waits: Record<string, number> = { a: 14, b: 15, c: 16, d: 17.5, e: 10 };
    const out = stretchMedians(['a', 'b', 'c', 'd', 'e'], ['', '', '', '', 'x'], id => waits[id]);
    expect(Object.fromEntries(out)).toEqual({ a: 16, b: 16, c: 16, d: 18, e: 10 });
  });
});
