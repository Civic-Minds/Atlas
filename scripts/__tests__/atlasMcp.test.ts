import { describe, expect, it } from 'vitest';
import { frequencyChanges, parseDay, parsePeriod, publicAgencies } from '../mcp/atlasData';
import type { StudioBeforeAfterFile } from '../../shared/studioBeforeAfter';

describe('Atlas MCP server data (CIV-1650)', () => {
  it('reads days and periods by the shared names', () => {
    expect([parseDay('saturday'), parseDay(undefined), parseDay('nonsense')]).toEqual(['Saturday', 'Weekday', 'Weekday']);
    expect([parsePeriod('Midday'), parsePeriod('AM peak'), parsePeriod('pm_peak'), parsePeriod('lunch')]).toEqual(['midday', 'amPeak', 'pmPeak', null]);
  });

  it('answers only for public agencies', () => {
    expect(publicAgencies().length).toBeGreaterThan(100);
    expect(publicAgencies().some(a => a.betaOnly)).toBe(false);
  });

  it('lists schedule changes by the shared rule: a move inside a grade is none (Hamilton 44, 30 → 29)', () => {
    const day = (midday: number | null) => ({ headway: { midday }, trips: 0, first: null, last: null, runMinutes: [] });
    const file = { changes: [
      { route: '44', name: null, before: day(30), after: day(29), size: 'small' },
      { route: '1', name: null, before: day(30), after: day(15), size: 'frequency' },
      { route: '2', name: null, before: null, after: day(20), size: 'frequency' },
    ] } as unknown as StudioBeforeAfterFile;
    expect(frequencyChanges(file).map(c => [c.route, c.steps])).toEqual([['2', 8], ['1', 2]]);
  });
});
