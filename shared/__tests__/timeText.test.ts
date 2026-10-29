import { describe, expect, it } from 'vitest';
import { clockTime, hourRange, hourTime, timeRange } from '../timeText';

// CIV-1095 (Ryan, 2026-10-28): "2–5 AM", "11 AM–3 PM", "6:30–9 AM".
describe('the app\'s one time format', () => {
  it('writes a time with uppercase AM/PM after a space and no ":00" on the hour', () => {
    expect([clockTime(420), clockTime(577), clockTime(720), clockTime(0), clockTime(1140), clockTime(150)])
      .toEqual(['7 AM', '9:37 AM', '12 PM', '12 AM', '7 PM', '2:30 AM']);
  });

  it('reads GTFS times past midnight as the next morning, and rounds fractional minutes', () => {
    expect([hourTime(26), hourTime(24), clockTime(465.5)]).toEqual(['2 AM', '12 AM', '7:46 AM']);
  });

  it('names AM/PM once when both ends share it, both when they differ', () => {
    expect(hourRange(2 + 24, 5 + 24)).toBe('2–5 AM');
    expect(hourRange(11, 15)).toBe('11 AM–3 PM');
    expect(timeRange(390, 540)).toBe('6:30–9 AM');
    expect(hourRange(12, 15)).toBe('12–3 PM');
    expect(hourRange(9, 12)).toBe('9 AM–12 PM');
  });

  it('never drops the AM/PM across midnight or a whole day', () => {
    expect(hourRange(23, 26)).toBe('11 PM–2 AM');
    expect(hourRange(19, 24)).toBe('7 PM–12 AM');
    expect(hourRange(24, 29)).toBe('12–5 AM');
    expect(hourRange(5, 26)).toBe('5 AM–2 AM');
    expect(hourRange(6, 30)).toBe('6 AM–6 AM');
  });
});
