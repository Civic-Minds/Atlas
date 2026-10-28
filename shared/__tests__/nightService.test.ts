import { describe, expect, it } from 'vitest';
import { routeNightGrade } from '../nightService';

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
