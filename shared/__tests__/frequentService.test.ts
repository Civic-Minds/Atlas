import { describe, expect, it } from 'vitest';
import { parseFrequentServiceDays } from '../frequentService';

describe('parseFrequentServiceDays', () => {
  it('keeps the canonical order and ignores invalid values', () => {
    expect(parseFrequentServiceDays('Sunday,garbage,Weekday')).toEqual(['Weekday', 'Sunday']);
  });

  it('returns no days for an empty value so the caller can apply its default', () => {
    expect(parseFrequentServiceDays(null)).toEqual([]);
  });
});
