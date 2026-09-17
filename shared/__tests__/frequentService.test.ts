import { describe, expect, it } from 'vitest';
import { frequentServiceBand, parseFrequentServiceDays } from '../frequentService';

describe('parseFrequentServiceDays', () => {
  it('keeps the canonical order and ignores invalid values', () => {
    expect(parseFrequentServiceDays('Sunday,garbage,Weekday')).toEqual(['Weekday', 'Sunday']);
  });

  it('returns no days for an empty value so the caller can apply its default', () => {
    expect(parseFrequentServiceDays(null)).toEqual([]);
  });
});

describe('frequentServiceBand', () => {
  it('keeps all routes in the 15-minute view in the strongest band', () => {
    expect(frequentServiceBand({ researchFrequentService: { daytime15: true } }, 'daytime', 15)).toBe('15');
  });

  it('separates 15-minute routes from the wider 30-minute group', () => {
    expect(frequentServiceBand({ researchFrequentService: { daytime15: true, daytime30: true } }, 'daytime', 30)).toBe('15');
    expect(frequentServiceBand({ researchFrequentService: { daytime15: false, daytime30: true } }, 'daytime', 30)).toBe('30');
  });
});
