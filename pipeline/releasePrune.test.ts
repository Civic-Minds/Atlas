import { describe, expect, it } from 'vitest';
import { assertDeletableKeys, planReleasePrune, releaseIdOfKey } from './releasePrune.js';

const h = (releaseId: string, generatedAt: string) => ({ releaseId, generatedAt });
const history = [
  h('release-a1', '2026-10-01T00:00:00Z'),
  h('release-a2', '2026-10-02T00:00:00Z'),
  h('release-a3', '2026-10-03T00:00:00Z'),
  h('release-a4', '2026-10-04T00:00:00Z'),
];

describe('planReleasePrune', () => {
  it('keeps live plus the 2 before it and deletes the rest, orphans included', () => {
    const plan = planReleasePrune({
      existingIds: ['release-a1', 'release-a2', 'release-a0', 'release-a3', 'release-a4'],
      liveId: 'release-a4',
      history,
    });
    expect(plan.keep).toEqual(['release-a2', 'release-a3', 'release-a4']);
    expect(plan.delete).toEqual(['release-a0', 'release-a1']);
  });

  it('never deletes releases newer than live', () => {
    const plan = planReleasePrune({
      existingIds: ['release-a1', 'release-a2', 'release-a3', 'release-a4', 'release-a5'],
      liveId: 'release-a3',
      history,
    });
    expect(plan.keep).toEqual(['release-a1', 'release-a2', 'release-a3']);
    expect(plan.skippedNewer).toEqual(['release-a4', 'release-a5']);
    expect(plan.delete).toEqual([]);
  });

  it('skips history entries whose prefix is gone when picking the previous releases', () => {
    const plan = planReleasePrune({ existingIds: ['release-a1', 'release-a3', 'release-a4'], liveId: 'release-a4', history });
    expect(plan.keep).toEqual(['release-a1', 'release-a3', 'release-a4']);
  });

  it('refuses when the live release is missing or history is too short', () => {
    expect(() => planReleasePrune({ existingIds: ['release-a1'], liveId: 'release-a4', history })).toThrow(/no objects/);
    expect(() => planReleasePrune({ existingIds: ['release-a3', 'release-a4'], liveId: 'release-a4', history: history.slice(2) })).toThrow(/only 1/);
    expect(() => planReleasePrune({ existingIds: ['x'], liveId: 'x', history })).toThrow(/not a release id/);
  });
});

describe('assertDeletableKeys', () => {
  const plan = { keep: ['release-a3'], delete: ['release-a1'], skippedNewer: [] };
  it('accepts keys inside a planned release prefix only', () => {
    expect(releaseIdOfKey('atlas/releases/release-a1/agencies/x.json')).toBe('release-a1');
    expect(() => assertDeletableKeys(['atlas/releases/release-a1/atlas.pmtiles'], plan)).not.toThrow();
    expect(() => assertDeletableKeys(['atlas/releases/release-a3/atlas.pmtiles'], plan)).toThrow();
    expect(() => assertDeletableKeys(['atlas/release.json'], plan)).toThrow();
    expect(() => assertDeletableKeys(['atlas/release-history.json'], plan)).toThrow();
  });
});
