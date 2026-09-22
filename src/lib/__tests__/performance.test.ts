import { describe, expect, it, beforeEach } from 'vitest';
import { markAtlasLatest } from '../performance';

describe('markAtlasLatest', () => {
  beforeEach(() => performance.clearMarks('atlas:network-data-ready'));

  it('records the readiness milestone and its detail', () => {
    markAtlasLatest('network-data-ready', { source: 'pmtiles' });

    const entries = performance.getEntriesByName('atlas:network-data-ready', 'mark');
    expect(entries).toHaveLength(1);
    expect((entries[0] as PerformanceMark).detail).toEqual({ source: 'pmtiles' });
  });

  it('keeps only the latest readiness mark', () => {
    markAtlasLatest('network-data-ready', { attempt: 1 });
    markAtlasLatest('network-data-ready', { attempt: 2 });

    const entries = performance.getEntriesByName('atlas:network-data-ready', 'mark');
    expect(entries).toHaveLength(1);
    expect((entries[0] as PerformanceMark).detail).toEqual({ attempt: 2 });
  });
});
