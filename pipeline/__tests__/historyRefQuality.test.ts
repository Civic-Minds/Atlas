import { describe, expect, it } from 'vitest';
import { holidayDropFor, pickedWeekQuality, refDayTrips, repickedFor, tripsByDate, type QualityRows } from '../historyRefQuality.js';
import { DAY_NAMES, pickRiderWeek } from '../serviceDays.js';

/**
 * CIV-1101 Part B: the old holiday rule (fixed Dec 20 - Jan 6 window and trip ratios) is retired for
 * new snapshots. Its fixtures are rewritten as the week the one service-day model reads, and the
 * build still reads the flags stored on sidecars already published.
 */
const withRoutes = (rows: QualityRows) => ({ ...rows, trips: rows.trips.map(t => ({ ...t, route_id: `R-${t.service_id}` })) });
const read = (rows: QualityRows, anchor: string) => pickRiderWeek({ ...withRoutes(rows), anchor });
const datesRead = (w: ReturnType<typeof read>) => DAY_NAMES.map(d => w.week.dates[d]).filter((d): d is string => !!d);

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

describe('week read for the old holiday-rule fixtures', () => {
  it('STM Jan 5 2025 end of feed, holiday weekdays on Sunday/Saturday service: reads a regular week before the holidays', () => {
    const rows = datesOnlyFeed('20241028', '20250105', { '20241225': 'SU', '20250101': 'SU', '20241226': 'SA', '20250102': 'SA' });
    const w = read(rows, '20250105');
    expect(datesRead(w).every(d => d < '20241223')).toBe(true);
    expect(w.week.services.Wednesday).toEqual(['WK']);
  });

  it('a holiday Monday on Saturday service loses the vote (STM Thanksgiving Mondays): the next clean week is read', () => {
    const rows = datesOnlyFeed('20230817', '20231120', { '20231009': 'SA' });
    const w = read(rows, '20231009');
    expect(w.week.weekStart).toBe('20231016');
    expect(w.week.services.Monday).toEqual(['WK']);
    expect(w.week.dates.Monday).not.toBe('20231009');
  });

  it('a normal mid-year week is read as is', () => {
    const w = read(datesOnlyFeed('20240826', '20241130'), '20241016');
    expect(w.week.weekStart).toBe('20241014');
    expect(w.referenceDate).toBe('20241016');
  });

  it('a Monday Dec 30 on Saturday service inside the holiday fortnight is not read', () => {
    const w = read(datesOnlyFeed('20241028', '20250104', { '20241230': 'SA' }), '20241230');
    expect(w.week.services.Monday).toEqual(['WK']);
    expect(w.week.dates.Monday).not.toBe('20241230');
  });
});

describe('the trips stamp on new sidecars', () => {
  it('ignores stub days (a feed carrying months of leftover boat/rail service) when finding the median (MBTA Aug 2016)', () => {
    const wk = (from: string, to: string, svc: string) => dates(from, to).filter(d => dow(d) >= 1 && dow(d) <= 5).map(d => ({ service_id: svc, date: d, exception_type: '1' }));
    const rows: QualityRows = {
      calendar: [],
      calendarDates: [...wk('20160104', '20160930', 'STUB'), ...wk('20161003', '20161223', 'WK'), { service_id: 'HOL', date: '20161226', exception_type: '1' }] as any,
      trips: [...nTrips('STUB', 5), ...nTrips('WK', 100), ...nTrips('HOL', 40)],
    };
    expect(refDayTrips(rows, '20161012')).toEqual({ tripsOnRef: 100, medianTrips: 100 });
  });

  it('keeps every day when all are similar, and gives no median with too few comparison days', () => {
    expect(refDayTrips(datesOnlyFeed('20240826', '20241130', {}, { WK: 8, SA: 5, SU: 4 }), '20241016').medianTrips).toBe(8);
    expect(refDayTrips(datesOnlyFeed('20241028', '20241030'), '20241029').medianTrips).toBe(0);
  });

  it('is never a holiday flag', () => {
    const rows = datesOnlyFeed('20241028', '20250105', { '20241225': 'SU' });
    expect(pickedWeekQuality(rows, '20241225', '20241223')).toMatchObject({ holiday: false, pickedBy: 'vote', weekStart: '20241223', tripsOnRef: 60 });
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
});

describe('published sidecars keep their stored flags', () => {
  it('holidayDropFor reports only sidecars flagged holiday', () => {
    const sc = { refDate: '20250105', routes: { a: { rep: {} }, b: { rep: {} } } };
    expect(holidayDropFor('stm', '20241028', sc)).toBeNull();
    expect(holidayDropFor('stm', '20241028', { ...sc, refDateQuality: { holiday: false, reason: 'ok', tripsOnRef: 1, medianTrips: 1 } })).toBeNull();
    expect(holidayDropFor('stm', '20241028', { ...sc, refDateQuality: { holiday: true, reason: 'why', tripsOnRef: 1, medianTrips: 2 } }))
      .toEqual({ slug: 'stm', periodKey: '20241028', refDate: '20250105', reason: 'why', routesAffected: 2 });
    expect(holidayDropFor('stm', '20241028', { ...sc, refDateQuality: { holiday: false, reason: 'week of 20241014 picked by vote', tripsOnRef: 1, medianTrips: 1, pickedBy: 'vote', weekStart: '20241014' } })).toBeNull();
  });

  it('repickedFor still reads an old re-pick record', () => {
    const repicked = { from: '20181123', to: '20181129', reason: 'Thanksgiving', fromYear: 2018, toYear: 2018, tripsOnFrom: 1, tripsOnTo: 2 };
    expect(repickedFor('mbta', '20190118', { routes: { a: { rep: {} } } as any, refDateQuality: { holiday: false, reason: '', tripsOnRef: 2, medianTrips: 2, repicked } }))
      .toEqual({ slug: 'mbta', periodKey: '20190118', ...repicked, routes: 1 });
  });
});
