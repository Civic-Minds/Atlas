import { describe, expect, it } from 'vitest';
import { assessRefDate, holidayDropFor, refDateQuality, tripsByDate, type QualityRows } from '../historyRefQuality.js';

const ymd = (d: Date) => `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`;
const dates = (from: string, to: string): string[] => {
  const out: string[] = [];
  for (let t = Date.UTC(+from.slice(0, 4), +from.slice(4, 6) - 1, +from.slice(6)); t <= Date.UTC(+to.slice(0, 4), +to.slice(4, 6) - 1, +to.slice(6)); t += 86400000) out.push(ymd(new Date(t)));
  return out;
};
const dow = (d: string) => new Date(Date.UTC(+d.slice(0, 4), +d.slice(4, 6) - 1, +d.slice(6))).getUTCDay();
const nTrips = (service: string, n: number) => Array.from({ length: n }, () => ({ service_id: service }));

/** A calendar_dates-only feed (STM style): every date adds the WK / SA / SU service; `override` swaps a date's service. */
function datesOnlyFeed(from: string, to: string, override: Record<string, 'WK' | 'SA' | 'SU' | 'NONE'> = {}, counts = { WK: 100, SA: 70, SU: 60 }): QualityRows {
  const calendarDates = dates(from, to).flatMap(d => {
    const svc = override[d] ?? (dow(d) === 0 ? 'SU' : dow(d) === 6 ? 'SA' : 'WK');
    return svc === 'NONE' ? [] : [{ service_id: svc, date: d, exception_type: '1' }];
  });
  return { calendar: [], calendarDates: calendarDates as any, trips: [...nTrips('WK', counts.WK), ...nTrips('SA', counts.SA), ...nTrips('SU', counts.SU)] };
}

describe('holiday-week reference dates', () => {
  it('flags a Sunday Jan 5 reference at the end of a feed whose holiday weekdays run Sunday service (STM shape)', () => {
    // Dec 25 and Jan 1 (weekdays) run the Sunday timetable; the reference Sunday itself looks normal.
    const rows = datesOnlyFeed('20241028', '20250105', { '20241225': 'SU', '20250101': 'SU', '20241226': 'SA', '20250102': 'SA' });
    const a = assessRefDate(rows, '20250105');
    expect(a.tripsOnRef).toBe(60);
    expect(a.ratio).toBe(1);
    expect(a.isLastDate).toBe(true);
    expect(a.holiday).toBe(true);
    expect(a.reason).toMatch(/window/);
    expect(a.nearbyWeekdayLow?.date).toBe('20250102'); // Jan 1 is 4 days away, outside the 3-day read
  });

  it('keeps a normal mid-year reference date', () => {
    const q = refDateQuality(datesOnlyFeed('20240826', '20241130'), '20241016');
    expect(q.holiday).toBe(false);
    expect(q.tripsOnRef).toBe(100);
    expect(q.medianTrips).toBe(100);
  });

  it('keeps a reference date inside Dec 20 - Jan 6 when the whole feed has normal service', () => {
    const rows = datesOnlyFeed('20241028', '20250105');
    const a = assessRefDate(rows, '20250105');
    expect(a.inWindow).toBe(true);
    expect(a.holiday).toBe(false);
    expect(a.reason).toMatch(/holiday window, normal service/);
  });

  it('flags a window reference date whose own trips are below 90% of the median', () => {
    const rows = datesOnlyFeed('20241028', '20250104', { '20241230': 'SA' }, { WK: 100, SA: 70, SU: 60 });
    // Monday Dec 30 runs Saturday service (70 trips): 70% of the weekday median.
    expect(assessRefDate(rows, '20241230').holiday).toBe(true);
  });

  it('flags a low-service reference day outside the window only below 60% of its day type', () => {
    const wed = (sunTrips: number) => assessRefDate(datesOnlyFeed('20240826', '20241030', { '20241016': 'SU' }, { WK: 100, SA: 70, SU: sunTrips }), '20241016');
    expect(wed(50).holiday).toBe(true); // 50% of the median weekday
    expect(wed(60).holiday).toBe(false); // exactly 60%: not below the threshold
  });

  it('does not flag a holiday Monday outside the window at 70% (STM Thanksgiving Mondays were clean)', () => {
    const rows = datesOnlyFeed('20230817', '20231120', { '20231009': 'SA' }, { WK: 100, SA: 70, SU: 60 });
    expect(assessRefDate(rows, '20231009').holiday).toBe(false);
  });

  it('flags nothing without trips evidence (reference date outside the calendar, too few comparison days)', () => {
    expect(refDateQuality(datesOnlyFeed('20241028', '20241030'), '20241029').holiday).toBe(false);
    expect(refDateQuality(datesOnlyFeed('20241028', '20250105'), '20250301').reason).toBe('no trips evidence');
  });

  it('applies calendar.txt rows with calendar_dates removals', () => {
    const rows: QualityRows = {
      calendar: [{ service_id: 'WK', monday: '1', tuesday: '1', wednesday: '1', thursday: '1', friday: '1', saturday: '0', sunday: '0', start_date: '20241001', end_date: '20250131' }] as any,
      calendarDates: [{ service_id: 'WK', date: '20241225', exception_type: '2' }, { service_id: 'WK', date: '20250101', exception_type: '2' }] as any,
      trips: nTrips('WK', 50),
    };
    const m = tripsByDate(rows);
    expect(m.get('20241225')).toBe(0);
    expect(m.get('20241224')).toBe(50);
    expect(m.get('20241228')).toBe(0); // Saturday
  });

  it('holidayDropFor reports only sidecars flagged holiday', () => {
    const sc = { refDate: '20250105', routes: { a: { rep: {} }, b: { rep: {} } } };
    expect(holidayDropFor('stm', '20241028', sc)).toBeNull();
    expect(holidayDropFor('stm', '20241028', { ...sc, refDateQuality: { holiday: false, reason: 'ok', tripsOnRef: 1, medianTrips: 1 } })).toBeNull();
    expect(holidayDropFor('stm', '20241028', { ...sc, refDateQuality: { holiday: true, reason: 'why', tripsOnRef: 1, medianTrips: 2 } }))
      .toEqual({ slug: 'stm', periodKey: '20241028', refDate: '20250105', reason: 'why', routesAffected: 2 });
  });
});
