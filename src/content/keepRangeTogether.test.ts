import { describe, expect, it } from 'vitest';
import { keepRangeTogether, periodServiceNotice, selectedRouteFilterNotice } from './noticeCopy';

// #1133: a time range in a notice never breaks at its dash or before its AM/PM.
describe('keepRangeTogether', () => {
  it('joins the dash to its numbers and the AM/PM to its number, invisibly', () => {
    const kept = keepRangeTogether('7–11 PM');
    expect(kept).toBe('7⁠–⁠11 PM');
    expect(kept.replace(/⁠/g, '').replace(/ /g, ' ')).toBe('7–11 PM');
  });

  it('is used by the notices that name a range', () => {
    expect(selectedRouteFilterNotice({ headway: 60, activeRange: '7–11 PM', periodRange: '7–10 PM' })).not.toMatch(/ PM/);
    expect(periodServiceNotice('6–9 AM', false)).toContain('6⁠–⁠9 AM');
  });
});
