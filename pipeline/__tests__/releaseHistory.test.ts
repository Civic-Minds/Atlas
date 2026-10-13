import { describe, expect, it } from 'vitest';
import { appendReleaseHistory, parseReleaseHistory } from '../../shared/releaseHistory';

const a = { releaseId: 'release-a', generatedAt: '2026-10-01T00:00:00.000Z' };
const b = { releaseId: 'release-b', generatedAt: '2026-10-12T00:00:00.000Z' };

describe('release history', () => {
  it('creates the history when none exists', () => {
    expect(appendReleaseHistory(null, a)).toEqual([a]);
  });

  it('appends in date order and de-duplicates by releaseId', () => {
    expect(appendReleaseHistory([b], a)).toEqual([a, b]);
    expect(appendReleaseHistory([a, b], { ...b, generatedAt: '2030-01-01T00:00:00Z' })).toEqual([a, b]);
  });

  it('ignores malformed entries and non-array files', () => {
    expect(parseReleaseHistory({ nope: true })).toEqual([]);
    expect(parseReleaseHistory([a, { releaseId: '', generatedAt: a.generatedAt }, { releaseId: 'c' }, 7])).toEqual([a]);
    expect(appendReleaseHistory('garbage', { releaseId: 'x' })).toEqual([]);
  });
});
