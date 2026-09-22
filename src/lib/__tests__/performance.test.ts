import { beforeEach, describe, expect, it } from 'vitest';
import { getAtlasMark, markAtlasOnce } from '../performance';

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
});
