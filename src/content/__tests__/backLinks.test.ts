import { describe, expect, it } from 'vitest';
import { BACK_PLACES, backLinkLabel, backLinkText, NIGHT_LIST_PLACE } from '../backLinks';
import { BACK_TO_MAP_LABEL, HISTORY_BACK_TO_AGENCIES, HISTORY_BUTTON_ACTIVE_LABEL, MAP_KEY_NIGHT } from '../noticeCopy';

// CIV-1462 (Ryan: History's link reads "Back to agencies"): every back control says "Back to " + where it goes.
describe('back links (CIV-1462)', () => {
  it('a text link is "← Back to " + the place; common places in lower case, names keep their case', () => {
    expect(backLinkText(BACK_PLACES.map)).toBe('← Back to map');
    expect(backLinkText(BACK_PLACES.agencies)).toBe('← Back to agencies');
    expect(backLinkText('TTC')).toBe('← Back to TTC');
    expect(backLinkText('Route 504')).toBe('← Back to Route 504');
    expect(backLinkText(NIGHT_LIST_PLACE)).toBe('← Back to overnight service');
  });

  it('an arrow-only control says the same words to screen readers', () => {
    expect(backLinkLabel(BACK_PLACES.agencies)).toBe('Back to agencies');
    expect(backLinkLabel(BACK_PLACES.frequencyMap)).toBe('Back to frequency map');
    expect(backLinkLabel(BACK_PLACES.settings)).toBe('Back to settings');
    expect(backLinkLabel(BACK_PLACES.aboutAtlas)).toBe('Back to About Atlas');
  });

  it('History and the map use the same words for the same place', () => {
    expect(HISTORY_BACK_TO_AGENCIES).toBe(BACK_PLACES.agencies);
    expect(BACK_TO_MAP_LABEL).toBe(BACK_PLACES.map);
    expect(HISTORY_BUTTON_ACTIVE_LABEL).toBe(backLinkLabel(BACK_PLACES.frequencyMap));
    expect(NIGHT_LIST_PLACE).toBe(MAP_KEY_NIGHT);
  });
});
