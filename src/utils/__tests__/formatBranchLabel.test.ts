import { describe, expect, it } from 'vitest';
import { formatBranchLabel, resolveBranchLabel } from '../format';

describe('formatBranchLabel', () => {
  it('uses fallback when destination matches route long name', () => {
    expect(formatBranchLabel('Warden', '68', 'Warden', 'Southbound')).toBe('to Southbound');
  });

  it('shows distinct terminals', () => {
    expect(formatBranchLabel('Warden Station', '68', 'Warden', 'Southbound')).toBe('to Warden Station');
  });
});

describe('resolveBranchLabel', () => {
  it('falls back to bound label for headsign-less branches at stops', () => {
    expect(resolveBranchLabel({
      headsign: null,
      shortName: '68',
      longName: 'Warden',
      directionId: 0,
      boundLabel: 'Southbound',
      multipleDirections: true,
    })).toBe('to Southbound');
  });

  it('omits row label when it would repeat the section heading', () => {
    expect(resolveBranchLabel({
      headsign: null,
      shortName: '68',
      longName: 'Warden',
      directionId: 0,
      multipleDirections: true,
      sectionBoundLabel: 'Southbound',
    })).toBe('');
  });
});
