import { describe, expect, it } from 'vitest';
import { encodeHistoryView, parseHistoryView } from '../historyViewUrl';

describe('History view in the link (map params h, p)', () => {
  it('reads the map format: h minutes or all, p a period key', () => {
    expect(parseHistoryView('?h=15&p=amPeak')).toEqual({ maxHeadway: 15, period: 'amPeak' });
    expect(parseHistoryView('?h=all')).toEqual({ maxHeadway: Infinity, period: 'all' });
  });

  it('an older History link without them opens on All / All day; junk is ignored', () => {
    expect(parseHistoryView('?agency=marta&hroute=6')).toEqual({ maxHeadway: Infinity, period: 'all' });
    expect(parseHistoryView('?h=-3&p=brunch')).toEqual({ maxHeadway: Infinity, period: 'all' });
  });

  it('writes h always (so the map does not read its 60 default) and p only when not all day', () => {
    expect(encodeHistoryView({ maxHeadway: Infinity, period: 'all' })).toEqual({ h: 'all', p: null });
    expect(encodeHistoryView({ maxHeadway: 60, period: 'pmPeak' })).toEqual({ h: '60', p: 'pmPeak' });
  });

  it('round-trips', () => {
    const view = { maxHeadway: 20, period: 'evening' as const };
    const { h, p } = encodeHistoryView(view);
    expect(parseHistoryView(`?h=${h}&p=${p}`)).toEqual(view);
  });
});
