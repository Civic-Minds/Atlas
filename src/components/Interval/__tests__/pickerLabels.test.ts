import { describe, expect, it } from 'vitest';
import { HEADWAY_TIERS } from '../../../utils/colors';
import { frequencyOptionLabel } from '../pickers';

const maxes = HEADWAY_TIERS.map(t => t.max);

describe('frequency picker labels', () => {
  it('reads as short tier labels by default (phone panel, Settings chips)', () => {
    expect(maxes.map(m => frequencyOptionLabel(m))).toEqual(['≤10 min', '≤15 min', '≤20 min', '≤30 min', '≤60 min', 'All routes']);
  });

  it('the desktop Frequency dropdown says "All" for no limit', () => {
    expect(maxes.map(m => frequencyOptionLabel(m, 'tier', 'All'))).toEqual(['≤10 min', '≤15 min', '≤20 min', '≤30 min', '≤60 min', 'All']);
  });

  it('the Compare side picker keeps the sentence wording', () => {
    expect(frequencyOptionLabel(10, 'plain')).toBe('Every 10 min or better');
    expect(frequencyOptionLabel(Infinity, 'plain')).toBe('All routes');
  });
});
