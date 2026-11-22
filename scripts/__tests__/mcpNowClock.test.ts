import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { agencyNow, isNow, serviceDayOf } from '../mcp/nowClock';

const ttc = { slug: 'ttc', name: 'TTC' };
// Unix ms for a Toronto wall-clock time in November (UTC-5).
const toronto = (iso: string) => Date.parse(`${iso}-05:00`);

describe('"now" for the schedule tools (#1627)', () => {
  it('reads the agency clock, day type and Atlas period, and says what it used', () => {
    const n = agencyNow(ttc, 'America/Toronto', toronto('2026-11-17T13:40:00')); // Tue
    expect([n.day, n.period, n.minutes]).toEqual(['Weekday', 'midday', 13 * 60 + 40]);
    expect(n.used).toMatch(/Weekday, Midday .*1:40 PM Tue in America\/Toronto/);
    expect(n.next.period).toBe('pmPeak');
    expect(n.holidays).toMatch(/holiday/);
  });
  it("counts before 6 AM as the previous day's service, on the schedule's clock", () => {
    const sat = agencyNow(ttc, 'America/Toronto', toronto('2026-11-21T01:30:00')); // Sat 1:30 AM: Friday's late night
    expect([sat.day, sat.period, sat.minutes]).toEqual(['Weekday', 'late', 25 * 60 + 30]);
    const mon = agencyNow(ttc, 'America/Toronto', toronto('2026-11-23T03:00:00')); // Mon 3 AM: Sunday's overnight
    expect([mon.day, mon.period]).toEqual(['Sunday', 'overnight']);
    expect(mon.next).toMatchObject({ day: 'Weekday', period: 'amPeak' });
  });
  it('uses another time zone correctly, falls back to the Live table, and refuses without one', () => {
    const ms = Date.parse('2026-11-17T21:00:00Z'); // 1 PM in Vancouver, 4 PM in Toronto
    expect(agencyNow({ slug: 'translink', name: 'TransLink' }, 'America/Vancouver', ms).period).toBe('midday');
    expect(agencyNow(ttc, null, ms).period).toBe('pmPeak');
    expect(() => agencyNow({ slug: 'nowhere', name: 'Nowhere' }, null, ms)).toThrow(/no time zone/);
  });
  it('knows "now" when asked', () => {
    expect(['now', 'Now', ' right now ', 'currently'].every(isNow)).toBe(true);
    expect(['Midday', '10:00', undefined].some(isNow)).toBe(false);
  });

  it('gives route_now and the schedule tools one service day after midnight (#1690)', () => {
    expect(serviceDayOf(0, 0)).toEqual({ day: 'Saturday', afterMidnight: true }); // 12:37 AM Sunday is Saturday's late period
    expect(serviceDayOf(0, 6)).toEqual({ day: 'Sunday', afterMidnight: false });
    expect(serviceDayOf(1, 5)).toEqual({ day: 'Sunday', afterMidnight: true });
    expect(agencyNow(ttc, 'America/Toronto', toronto('2026-11-22T00:37:00')).day).toBe('Saturday');
    // route_now reads its day through serviceDayOf, not the calendar day.
    const src = readFileSync(new URL('../mcp/liveNowTools.ts', import.meta.url), 'utf8');
    expect(src).toContain('serviceDayOf(clock.dow, clock.hour)');
    expect(src).not.toContain('dayTypeOfDow');
  });
});
