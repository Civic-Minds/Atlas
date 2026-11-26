import { describe, expect, it } from 'vitest';
import { weekScopeText } from '../liveWording';
import { PERIOD_LABELS } from '../config';

// #1831 (CIV-3001): the week table names the time of day its figures are for, from the period labels.
describe('weekScopeText (#1831)', () => {
  it('adds the picked time of day, and nothing for the whole day', () => {
    expect(weekScopeText('both directions', PERIOD_LABELS.evening)).toBe(`both directions · ${PERIOD_LABELS.evening}`);
    expect(weekScopeText('both directions', null)).toBe('both directions');
  });
});
