import { describe, expect, it } from 'vitest';
import { normalizeRouteName, splitKey, splitRouteHistory, terminiOf, type IdentityPeriod } from '../historyRouteIdentity';

// CIV-422 prototype. Lines are [lon, lat]; Indianapolis-like coordinates.
const DOWNTOWN: [number, number] = [-86.158, 39.768];
const CASTLETON: [number, number] = [-86.05, 39.91];
const BROAD_RIPPLE: [number, number] = [-86.141, 39.867];
const p = (year: number, name: string | undefined, ends: [[number, number], [number, number]] | null): IdentityPeriod => ({
  periodKey: `${year}0901`, sortKey: `${year}0901`, year, name, termini: ends,
});

describe('route identity by long name and terminus (CIV-422 prototype)', () => {
  it('splits a reused number: new name and new terminus (IndyGo 19 Castleton -> Broad Ripple)', () => {
    const { segments, splits } = splitRouteHistory([
      p(2022, 'Castleton', [DOWNTOWN, CASTLETON]),
      p(2024, 'Castleton', [DOWNTOWN, CASTLETON]),
      p(2025, 'Broad Ripple', [DOWNTOWN, BROAD_RIPPLE]),
    ]);
    expect(segments.map(s => [s.firstYear, s.lastYear])).toEqual([[2022, 2024], [2025, 2025]]);
    expect(splits[0]).toMatchObject({ fromYear: 2024, toYear: 2025, before: 'Castleton', after: 'Broad Ripple' });
    expect(splitKey('19', segments[0])).toBe('19 (2022-2024)');
  });

  it('keeps a rename on the same line, a name with filler words, and a terminus change under one name', () => {
    expect(splitRouteHistory([p(2019, 'Red Line', [DOWNTOWN, CASTLETON]), p(2021, 'Red Line BRT', [DOWNTOWN, CASTLETON])]).splits).toEqual([]);
    expect(splitRouteHistory([p(2019, 'Meridian St', [DOWNTOWN, CASTLETON]), p(2021, 'North Meridian', [CASTLETON, DOWNTOWN])]).splits).toEqual([]);
    expect(splitRouteHistory([p(2019, 'Fort Harrison', [DOWNTOWN, CASTLETON]), p(2021, 'Fort Harrison', [DOWNTOWN, BROAD_RIPPLE])]).splits).toEqual([]);
    // Different words, same two ends (a pure rename): one route.
    expect(splitRouteHistory([p(2019, 'Nora', [DOWNTOWN, CASTLETON]), p(2021, 'Keystone', [CASTLETON, DOWNTOWN])]).splits).toEqual([]);
  });

  it('splits on a name change with no line to compare, and ignores a nameless period', () => {
    expect(splitRouteHistory([p(2019, 'Nora', null), p(2021, 'Broad Ripple', null)]).splits).toHaveLength(1);
    expect(splitRouteHistory([p(2019, 'Nora', [DOWNTOWN, CASTLETON]), p(2020, undefined, null), p(2021, 'Nora', [DOWNTOWN, CASTLETON])]).splits).toEqual([]);
  });

  it('reads names and ends as expected', () => {
    expect(normalizeRouteName('Red Line BRT')).toBe('red');
    expect(normalizeRouteName('Crosstown - 38th St.')).toBe('38th st');
    expect(terminiOf([[1, 2], [3, 4], [5, 6]])).toEqual([[1, 2], [5, 6]]);
    expect(terminiOf([[1, 2]])).toBeNull();
  });
});
