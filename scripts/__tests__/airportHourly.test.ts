import { describe, expect, it } from 'vitest';
import { dayMask, landableWeek, summarizeDepartures, weekMinutes, type DeparturesByDay } from '../airportHourly';
import { AIRPORTS, landableAt, landableCount } from '../../src/data/airportHourly';

const dep = (minute: number, downtown = true, downtownWithChange = downtown) => ({ minute, downtown, downtownWithChange });

// CIV-1550 fixture: a weekday-only airport bus with a midday hole (Regina-like), one after-midnight trip, and a
// non-downtown bus at 10:30.
const FIXTURE: DeparturesByDay = {
    wk: [dep(5 * 60 + 55), dep(8 * 60 + 55), dep(10 * 60 + 30, false, true), dep(16 * 60 + 15), dep(24 * 60 + 20)],
    sat: [],
    sun: [dep(23 * 60 + 50)],
};

describe('airport landable hours (CIV-1550)', () => {
    it('flags an hour when a departure leaves within 60 minutes of its start', () => {
        const week = landableWeek(weekMinutes(FIXTURE, d => d.downtown));
        // Tuesday: 05:00 (05:55), 08:00 (08:55) and 16:00 yes; 15:00 no (16:15 is 75 min away), nor 09:00 to 14:00.
        const tue = (h: number) => week[24 + h];
        expect([5, 8, 16].map(tue)).toEqual([true, true, true]);
        expect([4, 9, 10, 15, 17].map(tue)).toEqual([false, false, false, false, false]);
        // 00:20 the next morning: Tuesday's 24:20 trip counts at Wednesday 00:00, and Monday's at Tuesday 00:00.
        expect([tue(0), week[48]]).toEqual([true, true]);
        // Sunday 23:00 finds 23:50; Monday 00:00 has nothing (no Sunday trip after midnight); Friday's 24:20 lands on Saturday.
        expect([week[144 + 23], week[0], week[120]]).toEqual([true, false, true]);
    });

    it('builds per-day masks and weekly totals for downtown, one change and any transit', () => {
        const s = summarizeDepartures(FIXTURE);
        expect(s.masks.wk[0]).toBe((1 << 0) | (1 << 5) | (1 << 8) | (1 << 16));
        expect(s.masks.wk[1]).toBe(s.masks.wk[0] | (1 << 10));
        expect(s.masks.sat[0]).toBe(1 << 0);
        // Downtown: 3 hours Monday, 4 on each of Tue-Fri, Saturday 00:00 and Sunday 23:00. The 10:30 bus adds one hour a weekday.
        expect(s.weekly).toEqual({ downtown: 21, withChange: 26, any: 26 });
        expect(dayMask(new Array(168).fill(true), 'sun')).toBe(2 ** 24 - 1);
    });

    it('reads the committed data file', () => {
        expect(AIRPORTS).toHaveLength(157);
        const yul = AIRPORTS.find(a => a.code === 'YUL')!;
        expect(yul.weekly.downtown).toBe(168);
        const yqr = AIRPORTS.find(a => a.code === 'YQR')!;
        expect([8, 9, 15, 16].map(h => landableAt(yqr, 'wk', h))).toEqual([true, false, false, true]);
        expect(landableCount(AIRPORTS, 'wk', 3, 'any')).toBeGreaterThanOrEqual(landableCount(AIRPORTS, 'wk', 3));
    });
});
