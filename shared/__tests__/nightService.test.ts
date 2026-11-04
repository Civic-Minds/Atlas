import { describe, expect, it } from 'vitest';
import { routeNightGrade, routeRunsThroughNight, rowNightGrade, rowPassesNightGrade, rowRunsThroughNight, tileNightServiceExpr } from '../nightService';

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

describe('the 90 grade (CIV-1329): the Night Service page only', () => {
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
  it('Ryan, 2026-11-04: "i only meant to include 90 mins in" the Night Service page: a 90-only row is not Overnight service, and the tile twin agrees', () => {
    expect(rowRunsThroughNight({ nightService90: true })).toBe(false);
    expect(rowPassesNightGrade({ nightService90: true }, 90)).toBe(true);
    expect(rowRunsThroughNight({ nightService60: true, nightService90: true })).toBe(true);
    expect(rowRunsThroughNight({ nightService: true })).toBe(true);
    expect(rowRunsThroughNight({ nightService30: false, nightService60: false, nightService90: false })).toBe(false);
    expect(JSON.stringify(tileNightServiceExpr())).not.toContain('nightService90');
  });
});

describe('routeRunsThroughNight (CIV-1331): every direction must run through the night', () => {
  it('one passing direction is not enough', () => {
    expect(routeRunsThroughNight([{ directionId: 0, nightService60: true }, { directionId: 1, nightService60: false }])).toBe(false);
    expect(routeRunsThroughNight([{ directionId: 0, nightService60: true }, { directionId: 1, nightService60: true }, { directionId: 1 }])).toBe(true);
    // CIV-1329: a direction at 90 only does not count for the Overnight view.
    expect(routeRunsThroughNight([{ directionId: 0, nightService60: true }, { directionId: 1, nightService90: true }])).toBe(false);
    expect(routeRunsThroughNight([{ nightService30: true }])).toBe(true);
    expect(routeRunsThroughNight([])).toBe(false);
  });
});
