import { describe, expect, it } from 'vitest';
import { assertDeletableRunKeys, planRunsPrune, RUN_SOURCE_WINDOW_MS, runIdOfKey } from '../runsPrune';

const H = 60 * 60 * 1000;
const runs = [
  { id: '100', newest: 10 * H },
  { id: '200', newest: 50 * H },
  { id: '300', newest: 90 * H }, // built the live release
  { id: '400', newest: 95 * H }, // after live: unpublished
];

describe('planRunsPrune (CIV-2995)', () => {
  it('keeps the runs kept releases came from, runs after the live release, and the newest run', () => {
    const plan = planRunsPrune({
      runs,
      kept: [
        { releaseId: 'release-a', generatedAt: 51 * H }, // inferred: run 200 an hour before
        { releaseId: 'release-live', generatedAt: 92 * H, sourcePrefix: 'atlas/runs/300', live: true },
      ],
    });
    expect(plan.keep.map(k => k.id)).toEqual(['200', '300', '400']);
    expect(plan.delete).toEqual(['100']);
    expect(plan.keep.find(k => k.id === '300')!.why).toContain('release-live was built from it');
    expect(plan.keep.find(k => k.id === '400')!.why).toContain('written after the live release');
  });

  it('does not tie a release to a run written longer than the window before it', () => {
    const plan = planRunsPrune({ runs: [{ id: '1', newest: 0 }, { id: '2', newest: 1 }], kept: [{ releaseId: 'r', generatedAt: 1 + RUN_SOURCE_WINDOW_MS + 1, live: true }] });
    expect(plan.delete).toEqual(['1']); // run 2 is kept only as the newest run
  });

  it('refuses to plan without a live release', () => {
    expect(() => planRunsPrune({ runs, kept: [{ releaseId: 'r', generatedAt: 0 }] })).toThrow(/No live release/);
  });

  it('only ever deletes keys inside a run folder it plans to delete', () => {
    const plan = { keep: [{ id: '2', why: '' }], delete: ['1'] };
    expect(() => assertDeletableRunKeys(['atlas/runs/1/ttc.json'], plan)).not.toThrow();
    expect(() => assertDeletableRunKeys(['atlas/runs/2/ttc.json'], plan)).toThrow(/Refusing/);
    expect(() => assertDeletableRunKeys(['atlas/ttc.json'], plan)).toThrow(/Refusing/);
    expect(runIdOfKey('atlas/runs/123/')).toBeNull();
  });
});
