import { describe, expect, it } from 'vitest';
import { correctionNoticeApplies, correctionNoticeText } from '../correctionNotices';

describe('correction notices', () => {
  it('matches either a route short name or stable route ID', () => {
    const notice = {
      type: 'removedPlaceholderDestination' as const,
      routeShortNames: ['12'],
      routeIds: ['TL-58'],
    };

    expect(correctionNoticeApplies(notice, '12', 'other')).toBe(true);
    expect(correctionNoticeApplies(notice, null, 'TL-58')).toBe(true);
    expect(correctionNoticeApplies(notice, '13', 'other')).toBe(false);
  });

  it('returns the shared rider-facing copy for each template', () => {
    expect(correctionNoticeText('excludedNonRevenueTrips')).toContain('not available to passengers');
    expect(correctionNoticeText('removedPlaceholderDestination')).toContain('not a real stop');
  });
});
