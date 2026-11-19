import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CUTOFFS, bunchedShareAt, cutoffsFrom, earlyShareAt, figuresAtCutoffs, gapCounter, gapRatioCounter, gapRatioStep, gapStep,
  gappedShareAt, latenessCounter, latenessStep, lateShareAt, type CutoffCounts,
} from './liveCutoffs';
import { delayStatus } from './liveDelayStatus';
import { RELIABILITY_DEFINITION_TEXT } from './liveReliability';
import { BUNCHED_GAP_SEC, GAPPED_FACTOR } from './rules/live';

function counts(delaysSec: number[], gaps: Array<[number, number | null]>): CutoffCounts {
  const l = latenessCounter(), g = gapCounter(), r = gapRatioCounter();
  for (const d of delaysSec) l.add(latenessStep(d));
  for (const [gap, sched] of gaps) { g.add(gapStep(gap)); if (sched) r.add(gapRatioStep(gap, sched)); }
  return { lateness: l.steps(), gaps: g.steps(), gapRatio: r.steps() };
}

describe('planners’ own cut-offs (CIV-1869)', () => {
  // Every whole second from 20 minutes early to 40 late, so each edge is hit exactly.
  const delays = Array.from({ length: 3601 }, (_, i) => i - 1200);
  const gaps: Array<[number, number | null]> = Array.from({ length: 1500 }, (_, i) => [i + 1, i % 7 ? 300 : null]);
  const c = counts(delays, gaps);

  it('gives the same late and early shares as the shared rule at the defaults', () => {
    const late = delays.filter(d => delayStatus(d / 60) === 'late').length / delays.length;
    const early = delays.filter(d => delayStatus(d / 60) === 'early').length / delays.length;
    expect(lateShareAt(c, DEFAULT_CUTOFFS.lateAfterMin)!.share).toBeCloseTo(late, 12);
    expect(earlyShareAt(c, DEFAULT_CUTOFFS.earlyBeforeMin)!.share).toBeCloseTo(early, 12);
  });

  it('counts exactly at any allowed cut-off, edges included', () => {
    for (const m of [0, 0.5, 3, 7.5, 30]) expect(lateShareAt(c, m)!.share).toBeCloseTo(delays.filter(d => d > m * 60).length / delays.length, 12);
    for (const m of [0, 1, 2.5, 10]) expect(earlyShareAt(c, m)!.share).toBeCloseTo(delays.filter(d => d <= -m * 60).length / delays.length, 12);
    for (const m of [0.5, 2, 4.5, 10]) expect(bunchedShareAt(c, m)!.share).toBeCloseTo(gaps.filter(([g]) => g < m * 60).length / gaps.length, 12);
    for (const f of [1, 1.25, 2, 6]) expect(gappedShareAt(c, f)!.share).toBeCloseTo(gaps.filter(([g, s]) => s && g > f * s).length / gaps.length, 12);
  });

  it('matches the bunching rule at the defaults', () => {
    expect(bunchedShareAt(c, DEFAULT_CUTOFFS.bunchedWithinMin)!.share).toBeCloseTo(gaps.filter(([g]) => g < BUNCHED_GAP_SEC).length / gaps.length, 12);
    expect(gappedShareAt(c, DEFAULT_CUTOFFS.gappedFactor)!.share).toBeCloseTo(gaps.filter(([g, s]) => s && g >= BUNCHED_GAP_SEC && g > GAPPED_FACTOR * s).length / gaps.length, 12);
  });

  it('refuses a cut-off off the steps or out of range, never rounding it', () => {
    expect(() => cutoffsFrom({ late_after_min: 5.4 })).toThrow(/steps of 0.5/);
    expect(() => cutoffsFrom({ late_after_min: 31 })).toThrow(/between 0 and 30/);
    expect(() => cutoffsFrom({ gapped_factor: 1.1 })).toThrow(/steps of 0.25/);
    expect(() => cutoffsFrom({ bunched_within_min: 'two' })).toThrow();
    expect(cutoffsFrom({})).toEqual({ cutoffs: DEFAULT_CUTOFFS, custom: [] });
    expect(cutoffsFrom({ late_after_min: 3 }).custom).toEqual(['lateAfterMin']);
  });

  it('labels each figure with its own cut-off, worded as the standard one is', () => {
    const { cutoffs, custom } = cutoffsFrom({ late_after_min: 3, gapped_factor: 1.5 });
    const f = figuresAtCutoffs(c, cutoffs, custom);
    expect(f.late!.definition).toBe('More than 3 minutes after the scheduled time.');
    expect(f.gapped!.definition).toBe('A gap more than 1.5 times the scheduled gap.');
    expect(Object.keys(f)).toEqual(['late', 'gapped']);
    const std = figuresAtCutoffs(c, DEFAULT_CUTOFFS, ['lateAfterMin', 'earlyBeforeMin', 'bunchedWithinMin', 'gappedFactor']);
    expect([std.late!.definition, std.early!.definition, std.bunched!.definition, std.gapped!.definition]).toEqual(Object.values(RELIABILITY_DEFINITION_TEXT));
  });

  it('says plainly when a route file has no counts yet', () => {
    const f = figuresAtCutoffs(undefined, DEFAULT_CUTOFFS, ['lateAfterMin']);
    expect(f.late).toMatchObject({ share: null, count: null });
    expect(f.late!.note).toMatch(/no figure at this cut-off/);
  });
});
