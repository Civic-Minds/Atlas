import { describe, expect, it } from 'vitest';
import { pipelineRunDateYmd } from '../pipelineTimeZone';

// #1135: History's run date matches the map's (Toronto), not UTC.
describe('pipelineRunDateYmd', () => {
  it('9:30 pm EDT is still that day in Toronto, though UTC has moved on', () => {
    const evening = new Date('2026-10-27T01:30:00Z'); // 2026-10-26 21:30 EDT
    expect(evening.toISOString().slice(0, 10)).toBe('2026-10-27');
    expect(pipelineRunDateYmd(evening)).toBe('20261026');
  });

  it('a winter evening (EST) and a morning read the Toronto date too', () => {
    expect(pipelineRunDateYmd(new Date('2026-12-16T04:59:00Z'))).toBe('20261215'); // 23:59 EST
    expect(pipelineRunDateYmd(new Date('2026-12-16T05:00:00Z'))).toBe('20261216'); // 00:00 EST
    expect(pipelineRunDateYmd(new Date('2026-10-26T14:00:00Z'))).toBe('20261026');
  });
});
