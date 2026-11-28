import { describe, expect, it } from 'vitest';
import { studioSeason } from '../studioBeforeAfter';

// CIV-2058: Studio names the two seasons when a city's comparison crosses one (Hamilton summer vs fall).
describe('studioSeason', () => {
  it('reads the season from a YYYYMMDD date', () => {
    expect(studioSeason('20260819')).toBe('summer'); // Hamilton and RTD Denver's older file
    expect(studioSeason('20261118')).toBe('fall');
    expect(studioSeason('20260422')).toBe('spring'); // Guelph's older file
    expect(studioSeason('20261221')).toBe('winter');
    expect(studioSeason('20260115')).toBe('winter');
  });
  it('gives null for a date it cannot read', () => {
    expect(studioSeason('2026-08-19')).toBeNull();
    expect(studioSeason('20261318')).toBeNull();
  });
});
