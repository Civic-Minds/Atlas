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

// CIV-422 redesign: the path, not just the ends. Lines run through these points.
const line = (...pts: Array<[number, number]>) => pts;
const MID_NORTH: [number, number] = [-86.15, 39.82];
const EAST: [number, number] = [-86.0, 39.79];
const pl = (year: number, name: string, l: number[][]): IdentityPeriod => ({ periodKey: `${year}0901`, sortKey: `${year}0901`, year, name, termini: terminiOf(l), line: l });

describe('route identity by the path in common (CIV-422 redesign)', () => {
  it('splits a reuse that keeps an end stop: new name, new streets after downtown', () => {
    const { splits } = splitRouteHistory([pl(2024, 'Castleton', line(DOWNTOWN, EAST, CASTLETON)), pl(2025, 'Broad Ripple', line(DOWNTOWN, MID_NORTH, BROAD_RIPPLE))], '19');
    expect(splits).toHaveLength(1);
  });

  it('keeps a cut-back or an extension under a new name (the shorter line runs on the longer)', () => {
    const long = line(DOWNTOWN, MID_NORTH, BROAD_RIPPLE);
    expect(splitRouteHistory([pl(2019, 'Downtown Boston', long), pl(2020, 'Newton Corner', line(DOWNTOWN, MID_NORTH))], '558').splits).toEqual([]);
    expect(splitRouteHistory([pl(2019, 'Newton Corner', line(DOWNTOWN, MID_NORTH)), pl(2020, 'Downtown Boston', long)], '558').splits).toEqual([]);
  });

  it('keeps a route whose old name was only its number (MBTA "21" -> "Ashmont - Forest Hills")', () => {
    expect(splitRouteHistory([pl(2017, '21', line(DOWNTOWN, EAST)), pl(2018, 'Ashmont - Forest Hills', line(DOWNTOWN, MID_NORTH))], '21').splits).toEqual([]);
  });

  it('keeps a moved line under the same name, and compares with every earlier line of the route', () => {
    expect(splitRouteHistory([pl(2018, 'East 16th St', line(DOWNTOWN, EAST)), pl(2019, 'East 16th St', line(DOWNTOWN, MID_NORTH))], '11').splits).toEqual([]);
    // 2019's stored line is another pattern; 2020 runs on 2018's streets: one route.
    expect(splitRouteHistory([
      pl(2018, 'Charles River Loop', line(DOWNTOWN, EAST)), pl(2019, 'Charles River Loop', line(DOWNTOWN, MID_NORTH)), pl(2020, 'VA Hospital', line(DOWNTOWN, EAST)),
    ], '36').splits).toEqual([]);
  });
});
