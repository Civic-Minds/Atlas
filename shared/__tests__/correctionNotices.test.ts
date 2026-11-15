import { describe, expect, it } from 'vitest';
import { correctionNoteForRoute, correctionNoticeApplies, correctionNoticeText } from '../correctionNotices';

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

  it('returns Ryan’s approved words for each template (CIV-1639)', () => {
    expect(correctionNoticeText('excludedNonRevenueTrips')).toBe('We removed trips marked “Not in Service” because they don’t take passengers.');
    expect(correctionNoticeText('removedPlaceholderDestination')).toBe('We removed a placeholder destination because it isn’t a real stop.');
  });

  it('finds the note for a route by short name or any of its route ids, and none for other routes', () => {
    const brampton = [{ type: 'excludedNonRevenueTrips' as const, routeShortNames: ['1', '14'] }];
    const brownsville = [{ type: 'removedPlaceholderDestination' as const, routeIds: ['TL-58'] }];
    expect(correctionNoteForRoute(brampton, '14', ['x'])).toBe(correctionNoticeText('excludedNonRevenueTrips'));
    expect(correctionNoteForRoute(brampton, '2', ['x'])).toBeUndefined();
    expect(correctionNoteForRoute(brownsville, 'Silver', ['a', 'TL-58'])).toBe(correctionNoticeText('removedPlaceholderDestination'));
    expect(correctionNoteForRoute(undefined, '14', [])).toBeUndefined();
  });
});
