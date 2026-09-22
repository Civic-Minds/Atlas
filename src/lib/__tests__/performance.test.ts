import { beforeEach, describe, expect, it } from 'vitest';
import { getAtlasMark, markAtlasLatest, markAtlasOnce } from '../performance';

describe('performance marks', () => {
  beforeEach(() => {
    performance.clearMarks();
  });

  it('records each Atlas milestone once', () => {
    markAtlasOnce('app-ready');
    markAtlasOnce('app-ready');

    expect(performance.getEntriesByName('atlas:app-ready')).toHaveLength(1);
    expect(getAtlasMark('app-ready')).not.toBeNull();
  });

  it('replaces repeatable milestones with the latest completion', () => {
    markAtlasLatest('network-data-ready');
    const first = getAtlasMark('network-data-ready');
    markAtlasLatest('network-data-ready');
    const second = getAtlasMark('network-data-ready');

    expect(performance.getEntriesByName('atlas:network-data-ready')).toHaveLength(1);
    expect(second).not.toBeNull();
    expect(second).toBeGreaterThanOrEqual(first ?? 0);
  });
});
