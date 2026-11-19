import { describe, expect, it } from 'vitest';
import { edgeWaitFailMask } from '../edgeWaits';
import { PUBLIC_TIER_MAXES, edgeWaitBit } from '../../shared/rules/frequency';

// CIV-238 (Ryan, 2026-11-19: "1"): a period's first and last waits count like any gap between buses, under the
// near-miss allowance; a true start or end of service keeps its 10 minutes over the grade.
const AM = [360, 540] as const; // 6:00-9:00
const every = (from: number, to: number, step: number) => { const out: number[] = []; for (let t = from; t <= to; t += step) out.push(t); return out; };
const failed = (mask: number) => PUBLIC_TIER_MAXES.filter(n => mask & edgeWaitBit(n)!);

describe('edgeWaitFailMask', () => {
  it('a route whose first bus comes 53 min into the AM peak fails 10-30 and passes 60 (CTA 121 AM)', () => {
    expect(failed(edgeWaitFailMask(every(413, 600, 8), ...AM))).toEqual([10, 15, 20, 30]);
  });

  it('a 16-minute wait after a bus before 6:00 is a gap: it fails every 10, and every 15 takes it as a near miss', () => {
    expect(failed(edgeWaitFailMask([340, 350, ...every(376, 600, 10)], ...AM))).toEqual([10]);
  });

  it('a true start 18 minutes in keeps the approved 10 minutes at every 10', () => {
    expect(failed(edgeWaitFailMask(every(378, 600, 10), ...AM))).toEqual([]);
  });

  it('service every 10 through the whole period, with buses on both sides, fails nothing', () => {
    expect(edgeWaitFailMask(every(300, 600, 10), ...AM)).toBe(0);
  });

  it('a grade the gaps between buses already fail is not counted as an edge cut', () => {
    // Every 20 inside the period: grades 10 and 15 fail on their own, so only the edges' effect is recorded.
    expect(failed(edgeWaitFailMask(every(410, 600, 20), ...AM))).toEqual([20, 30]);
  });

  it('no departure in the period: nothing to record', () => {
    expect(edgeWaitFailMask([300, 600], ...AM)).toBe(0);
  });
});
