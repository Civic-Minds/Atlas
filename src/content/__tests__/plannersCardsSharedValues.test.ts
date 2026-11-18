import { describe, expect, it } from 'vitest';
import { PLANNERS_COPY } from '../noticeCopy';
import { joinList } from '../../../shared/overflowText';

// CIV-1814 item 61: the Planners cards build the grade list and the days from the shared sources; the words stay as Ryan has them.
describe('Planners cards read the shared grades and days', () => {
  it('frequency card: unchanged words', () => {
    expect(PLANNERS_COPY.cards.frequency.text).toBe('Every route is coloured by its headway: every 10, 15, 20, 30 or 60 min, or less often. Pick a frequency and only the routes that meet it stay on the map — so you can check your network against your own standard.');
  });

  it('day and time card: unchanged words', () => {
    expect(PLANNERS_COPY.cards.dayTime.text).toBe('Switch between weekday, Saturday and Sunday, then pick a time of day from AM peak to overnight, so peak, off-peak and owl service each get their own map. Compare puts two of them side by side on desktop, and any route opens an hourly chart of its headways and span of service.');
  });

  it('joinList joins with "or" when asked, and "and" by default', () => {
    expect(joinList(['a', 'b', 'c'], { conjunction: 'or' })).toBe('a, b or c');
    expect(joinList(['a', 'b'], { conjunction: 'or' })).toBe('a or b');
    expect(joinList(['a', 'b', 'c'])).toBe('a, b and c');
    expect(joinList(['a', 'b', 'c'], { oxford: true, conjunction: 'or' })).toBe('a, b, or c');
  });
});
