import { describe, expect, it } from 'vitest';
import { encodeHistoryView, historyDefaultPeriod, historyDefaultView, parseHistoryView } from '../historyViewUrl';

const at = (hour: number) => new Date(2026, 9, 28, hour, 30);

describe('History view in the link (map params h, p)', () => {
  it('reads the map format: h minutes or all, p a period key', () => {
    expect(parseHistoryView('?h=15&p=amPeak')).toEqual({ maxHeadway: 15, period: 'amPeak' });
    expect(parseHistoryView('?h=all&p=midday')).toEqual({ maxHeadway: Infinity, period: 'midday' });
  });

  it('an older History link without p, or with the retired all-day p, opens on the default period (CIV-1097)', () => {
    expect(parseHistoryView('?agency=marta&hroute=6', at(12))).toEqual({ maxHeadway: Infinity, period: 'midday' });
    expect(parseHistoryView('?h=all&p=all', at(8))).toEqual({ maxHeadway: Infinity, period: 'amPeak' });
    expect(parseHistoryView('?h=-3&p=brunch', at(17))).toEqual({ maxHeadway: Infinity, period: 'pmPeak' });
  });

  it('writes h and p always, so the map reads neither as its own default', () => {
    expect(encodeHistoryView({ maxHeadway: Infinity, period: 'midday' })).toEqual({ h: 'all', p: 'midday' });
    expect(encodeHistoryView({ maxHeadway: 60, period: 'pmPeak' })).toEqual({ h: '60', p: 'pmPeak' });
  });

  it('round-trips', () => {
    const view = { maxHeadway: 20, period: 'evening' as const };
    const { h, p } = encodeHistoryView(view);
    expect(parseHistoryView(`?h=${h}&p=${p}`)).toEqual(view);
  });
});

describe('the period History opens on (CIV-1097)', () => {
  it('is the current period, as on the map', () => {
    expect(historyDefaultPeriod(at(7))).toBe('amPeak');
    expect(historyDefaultPeriod(at(13))).toBe('midday');
    expect(historyDefaultPeriod(at(16))).toBe('pmPeak');
    expect(historyDefaultPeriod(at(20))).toBe('evening');
  });

  it('is Evening late at night, where few snapshots have values', () => {
    expect(historyDefaultPeriod(at(23))).toBe('evening');
    expect(historyDefaultPeriod(at(1))).toBe('evening');
    expect(historyDefaultPeriod(at(4))).toBe('evening');
  });

  it('starts Frequency at All', () => {
    expect(historyDefaultView(at(13))).toEqual({ period: 'midday', maxHeadway: Infinity });
  });
});
