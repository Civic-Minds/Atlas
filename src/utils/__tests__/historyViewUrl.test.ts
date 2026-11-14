import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { encodeHistoryView, historyDefaultPeriod, historyDefaultView, parseHistoryView } from '../historyViewUrl';
import { DAY_PREF_KEY, openingDay, saveDayPref } from '../openingDay';

const at = (hour: number) => new Date(2026, 9, 28, hour, 30);

describe('History view in the link (map params h, p)', () => {
  it('reads the map format: h minutes or all, p a period key', () => {
    expect(parseHistoryView('?h=15&p=amPeak')).toEqual({ maxHeadway: 15, period: 'amPeak', day: 'Weekday' });
    expect(parseHistoryView('?h=all&p=midday')).toEqual({ maxHeadway: Infinity, period: 'midday', day: 'Weekday' });
  });

  it('an older History link without p, or with the retired all-day p, opens on the default period (CIV-1097)', () => {
    expect(parseHistoryView('?agency=marta&hroute=6', at(12))).toEqual({ maxHeadway: Infinity, period: 'midday', day: 'Weekday' });
    expect(parseHistoryView('?h=all&p=all', at(8))).toEqual({ maxHeadway: Infinity, period: 'amPeak', day: 'Weekday' });
    expect(parseHistoryView('?h=-3&p=brunch', at(17))).toEqual({ maxHeadway: Infinity, period: 'pmPeak', day: 'Weekday' });
  });

  it('writes h and p always, so the map reads neither as its own default', () => {
    expect(encodeHistoryView({ maxHeadway: Infinity, period: 'midday', day: 'Weekday' })).toEqual({ h: 'all', p: 'midday' });
    expect(encodeHistoryView({ maxHeadway: 60, period: 'pmPeak', day: 'Weekday' })).toEqual({ h: '60', p: 'pmPeak' });
  });

  it('round-trips', () => {
    const view = { maxHeadway: 20, period: 'evening' as const, day: 'Weekday' as const };
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

  it('is Late or Overnight at night too, with no special rule', () => {
    expect(historyDefaultPeriod(at(23))).toBe('late');
    expect(historyDefaultPeriod(at(1))).toBe('late');
    expect(historyDefaultPeriod(at(4))).toBe('overnight');
  });

  it('starts Frequency at All', () => {
    expect(historyDefaultView(at(13))).toEqual({ period: 'midday', maxHeadway: Infinity, day: 'Weekday' });
  });
});

describe("History's day in the link (CIV-1425)", () => {
  it('with the day picker on, round-trips hday and always writes it, like the map writes day (CIV-1433)', () => {
    const sat = { maxHeadway: 15, period: 'midday' as const, day: 'Saturday' as const };
    const encoded = encodeHistoryView(sat, true);
    expect(encoded).toEqual({ h: '15', p: 'midday', hday: 'Saturday' });
    expect(parseHistoryView(`?h=15&p=midday&hday=${encoded.hday}`, undefined, true)).toEqual(sat);
    expect(encodeHistoryView({ ...sat, day: 'Weekday' }, true)).toEqual({ h: '15', p: 'midday', hday: 'Weekday' });
    expect(parseHistoryView('?h=15&p=midday&hday=Weekday', undefined, true).day).toBe('Weekday');
  });

  it('with the day picker off, ignores hday and writes only h and p', () => {
    expect(parseHistoryView('?h=15&p=midday&hday=Sunday', undefined, false).day).toBe('Weekday');
    expect(encodeHistoryView({ maxHeadway: 15, period: 'midday', day: 'Sunday' }, false)).toEqual({ h: '15', p: 'midday' });
    expect(historyDefaultView(at(13), false).day).toBe('Weekday');
  });
});

describe('the day History opens on (CIV-1433: the map\'s own logic, openingDay)', () => {
  const store = new Map<string, string>();
  beforeEach(() => {
    store.clear();
    vi.stubGlobal('localStorage', { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => { store.set(k, v); } });
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 10, 14, 12)); // a Saturday
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("a link's hday wins", () => {
    store.set(DAY_PREF_KEY, 'Sunday');
    expect(parseHistoryView('?h=15&p=midday&hday=Weekday', undefined, true).day).toBe('Weekday');
  });

  it("without hday, the viewer's saved day (the map's own), never the map's day param", () => {
    store.set(DAY_PREF_KEY, 'Sunday');
    expect(parseHistoryView('?h=15&p=midday&day=Weekday', undefined, true).day).toBe('Sunday');
    expect(historyDefaultView(undefined, true).day).toBe('Sunday');
  });

  it("with no link day and nothing saved, today's day type, as on the map", () => {
    expect(parseHistoryView('?h=15&p=midday', undefined, true).day).toBe('Saturday');
    expect(parseHistoryView('?h=15&p=midday&hday=Funday', undefined, true).day).toBe('Saturday');
    expect(historyDefaultView(undefined, true).day).toBe('Saturday');
    expect(openingDay(undefined)).toBe('Saturday');
  });

  it('saveDayPref stores the day the map reads', () => {
    saveDayPref('Sunday');
    expect(openingDay(null)).toBe('Sunday');
  });
});
