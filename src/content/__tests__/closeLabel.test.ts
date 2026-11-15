import { describe, expect, it } from 'vitest';
import { BACK_PLACES } from '../backLinks';
import { CLEAR_SEARCH_LABEL, CLOSE_PLACES, closeLabel } from '../noticeCopy';

// CIV-1569 part 3: every close X is PanelCloseButton, named by closeLabel(place); every search box's clear X is
// SearchClearButton.
// The check that nothing builds this by hand is in src/content/__tests__/styleGuard.test.ts (CIV-1578).
describe('close labels (CIV-1569)', () => {
  it('a close X says "Close " + what it closes; common things lower case, names keep their case', () => {
    expect(closeLabel(CLOSE_PLACES.filters)).toBe('Close filters');
    expect(closeLabel(CLOSE_PLACES.settings)).toBe('Close settings');
    expect(closeLabel(CLOSE_PLACES.chart)).toBe('Close chart');
    expect(closeLabel(CLOSE_PLACES.schedule)).toBe('Close schedule');
    expect(closeLabel(CLOSE_PLACES.reportForm)).toBe('Close report form');
    expect(closeLabel(CLOSE_PLACES.exportDialog)).toBe('Close export dialog');
    expect(closeLabel(CLOSE_PLACES.whatsNew)).toBe('Close what’s new');
    expect(closeLabel(CLOSE_PLACES.privacySettings)).toBe('Close privacy and analytics settings');
    expect(closeLabel(CLOSE_PLACES.aboutAtlas)).toBe('Close About Atlas');
    expect(CLOSE_PLACES.aboutAtlas).toBe(BACK_PLACES.aboutAtlas);
    expect(CLEAR_SEARCH_LABEL).toBe('Clear search');
  });
});
