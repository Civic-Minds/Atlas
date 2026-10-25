import { describe, expect, it } from 'vitest';
import { pooledHeadwayInWindow, pooledOverLongShareLimit } from '../stopPools';

// #813 / #1086: a merged list is refused only when its over-long gaps fill more of the window's
// time than the value's tier allows near misses, not for one long gap in a dense list.

const EVENING = [1140, 1380] as const;
const PM_PEAK = [900, 1140] as const;
const fromGaps = (first: number, gaps: readonly number[]) => gaps.reduce<number[]>((out, g) => [...out, out[out.length - 1] + g], [first]);
const every = (first: number, step: number, last: number) => Array.from({ length: Math.floor((last - first) / step) + 1 }, (_, i) => first + i * step);

describe('pooledOverLongShareLimit', () => {
  it('is the settled near-miss share of the value tier', () => {
    expect(pooledOverLongShareLimit(6)).toBe(0.1);
    expect(pooledOverLongShareLimit(15)).toBe(0.1);
    expect(pooledOverLongShareLimit(16)).toBe(0.05);
    expect(pooledOverLongShareLimit(60)).toBe(0.05);
    expect(pooledOverLongShareLimit(90)).toBe(0.05);
  });
});

describe('pooledHeadwayInWindow over-long share (#813)', () => {
  it('publishes a dense merged list with one long gap (ttc 52 westbound evening at Dufferin)', () => {
    // Four 52 patterns, about every 5-6; one 12-minute gap late in the evening (limit 11).
    const times = fromGaps(1141, [5, 5, 5, 5, 5, 10, 6, 4, 10, 9, 2, 7, 6, 9, 0, 9, 9, 2, 7, 9, 4, 5, 9, 5, 4, 9, 5, 4, 10, 5, 5, 10, 3, 8, 10, 1, 12, 5]);
    expect(pooledHeadwayInWindow(times, ...EVENING, 3)).toBe(7);
  });

  it('publishes every 8 with one 16-minute gap (hsr 05 pm peak)', () => {
    const times = [...every(900, 8, 1020), ...every(1036, 8, 1140)];
    expect(pooledHeadwayInWindow(times, ...PM_PEAK, 3)).toBe(8);
  });

  it('keeps refusing branches bunched a few minutes apart, at every phase and window cut', () => {
    for (const [step, offset] of [[30, 3], [30, 5], [30, 2], [20, 2], [20, 3], [24, 3], [60, 5]]) {
      for (let phase = 0; phase < step; phase++) {
        for (const cut of [0, 7, 14]) {
          const a = every(EVENING[0] + phase - 2 * step, step, 1440).filter(t => t <= EVENING[1] + cut);
          const b = a.map(t => t + offset);
          const v = pooledHeadwayInWindow([...a, ...b].sort((x, y) => x - y), ...EVENING, 3, false, a);
          if (v != null) expect(v, `every ${step}, ${offset} apart, phase ${phase}, cut ${cut}`).toBeGreaterThanOrEqual(step - offset - 1);
        }
      }
    }
  });

  it('two 30s three minutes apart are refused', () => {
    const a = every(1140, 30, 1380);
    expect(pooledHeadwayInWindow([...a, ...a.map(t => t + 3)].sort((x, y) => x - y), ...EVENING, 3, false, a)).toBeNull();
  });

  it('durham 900 westbound evening is not changed by this rule alone (#1086)', () => {
    // Every 12 until about 21:20, then every 24. At stop 33 the last gap (26) is over-long,
    // 11% of the window against 5% for a 16: refused, as before. At Chapman the last gap is 25,
    // under the limit 25.6, so the stop publishes 16, as before.
    const stop33 = fromGaps(1150, [8, 24, 18, 6, 16, 8, 16, 8, 16, 8, 16, 24, 24, 26]);
    const chapman = fromGaps(1151, [8, 24, 18, 6, 16, 8, 16, 8, 16, 8, 16, 24, 24, 25]);
    expect(pooledHeadwayInWindow(stop33, ...EVENING, 3)).toBeNull();
    expect(pooledHeadwayInWindow(chapman, ...EVENING, 3)).toBe(16);
  });
});
