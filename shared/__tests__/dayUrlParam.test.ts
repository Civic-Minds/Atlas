import { afterEach, describe, expect, it, vi } from 'vitest';
import { dayUrlParam, getNowDay } from '../dayTypes';

describe('dayUrlParam (#909)', () => {
  afterEach(() => vi.useRealTimers());
  const at = (iso: string) => { vi.useFakeTimers(); vi.setSystemTime(new Date(iso)); };

  it('omits the day only when it is today\'s default', () => {
    at('2026-10-14T12:00:00'); // Wednesday
    expect([getNowDay(), dayUrlParam('Weekday'), dayUrlParam('Saturday'), dayUrlParam('Sunday')]).toEqual(['Weekday', null, 'Saturday', 'Sunday']);
  });

  it('keeps Weekday in the address on a Saturday, and omits Saturday', () => {
    at('2026-10-17T12:00:00'); // Saturday
    expect([getNowDay(), dayUrlParam('Weekday'), dayUrlParam('Saturday'), dayUrlParam('Sunday')]).toEqual(['Saturday', 'Weekday', null, 'Sunday']);
  });

  it('keeps Weekday in the address on a Sunday, and omits Sunday', () => {
    at('2026-10-18T12:00:00'); // Sunday
    expect([getNowDay(), dayUrlParam('Weekday'), dayUrlParam('Saturday'), dayUrlParam('Sunday')]).toEqual(['Sunday', 'Weekday', 'Saturday', null]);
  });
});
