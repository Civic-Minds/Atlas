import { describe, expect, it } from 'vitest';
import { routeNightGrade, rowNightGrade, rowPassesNightGrade, rowRunsThroughNight, tileNightServiceExpr } from '../nightService';

describe('routeNightGrade (CIV-931)', () => {
  it('is 30 only when every lit row has the 30 grade', () => {
    expect(routeNightGrade([{ nightService30: true }, { nightService30: true }])).toBe(30);
  });

  it('one direction at 60 makes the route 60', () => {
    expect(routeNightGrade([{ nightService30: true }, { nightService30: false }])).toBe(60);
    expect(routeNightGrade([{ nightService30: true }, {}])).toBe(60);
  });

  it('no rows is 60, never 30', () => {
    expect(routeNightGrade([])).toBe(60);
  });
});

describe('the 90 grade (CIV-1329, #1322: "Use 90 minutes as the cutoff everywhere")', () => {
  it('one row at 90 makes the route 90', () => {
    expect(routeNightGrade([{ nightService30: true }, { nightService90: true }])).toBe(90);
    expect(routeNightGrade([{ nightService60: true }, { nightService60: true, nightService90: true }])).toBe(60);
  });
  it("a row's grade is the strictest check it passes; each grade includes the stricter ones", () => {
    expect(rowNightGrade({ nightService30: true, nightService60: true, nightService90: true })).toBe(30);
    expect(rowNightGrade({ nightService60: true, nightService90: true })).toBe(60);
    expect(rowNightGrade({ nightService: true })).toBe(60);
    expect(rowNightGrade({ nightService90: true })).toBe(90);
    expect(rowNightGrade({})).toBeNull();
    expect([30, 60, 90].map(f => rowPassesNightGrade({ nightService60: true, nightService90: true }, f as 30 | 60 | 90))).toEqual([false, true, true]);
    expect([30, 60, 90].map(f => rowPassesNightGrade({ nightService90: true }, f as 30 | 60 | 90))).toEqual([false, false, true]);
  });
  it('a row runs through the night at 90 (an owl every 75 minutes), and the tile twin agrees', () => {
    expect(rowRunsThroughNight({ nightService90: true })).toBe(true);
    expect(rowRunsThroughNight({ nightService30: false, nightService60: false, nightService90: false })).toBe(false);
    expect(JSON.stringify(tileNightServiceExpr())).toContain('nightService90');
  });
});
