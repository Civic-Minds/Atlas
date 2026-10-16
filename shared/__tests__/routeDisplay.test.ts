import { describe, expect, it } from 'vitest';
import { getRouteLabel } from '../cleanHeadsign';
import { routeDisplay, shouldHideNumericRouteShortName, splitDesignator } from '../routeDisplay';

const d = (shortName: string | null, longName: string | null, routeType?: number, agencyName?: string) => routeDisplay({ shortName, longName, routeType, agencyName });

describe('splitDesignator', () => {
  it('splits "Line 1 (Yonge-University)", "Route 4: Sheppard" and "Ligne 5 - Bleue"', () => {
    expect(splitDesignator('Line 1 (Yonge-University)')).toEqual({ designator: 'Line 1', rest: 'Yonge-University' });
    expect(splitDesignator('Route 4: Sheppard')).toEqual({ designator: 'Route 4', rest: 'Sheppard' });
    expect(splitDesignator('Ligne 5 - Bleue')).toEqual({ designator: 'Ligne 5', rest: 'Bleue' });
    expect(splitDesignator('Line 2 (Bloor - Danforth)')).toEqual({ designator: 'Line 2', rest: 'Bloor - Danforth' });
  });
  it('never splits on a hyphen between two digits, so a number range stays whole', () => {
    expect(splitDesignator('Route 10-12')).toBeNull();
    expect(splitDesignator('Line 1-2')).toBeNull();
  });
  it('does not split a name that is not a designator', () => {
    expect(splitDesignator('Line 5 Eglinton')).toBeNull();
    expect(splitDesignator('Bathurst')).toBeNull();
  });
});

describe('shouldHideNumericRouteShortName', () => {
  it('hides numeric ids on rail, subway and ferry, but not on trams or buses', () => {
    expect(shouldHideNumericRouteShortName('30053', 'Expo Line', 1)).toBe(true);
    expect(shouldHideNumericRouteShortName('1', 'Line 1 (Yonge-University)', 1)).toBe(true);
    expect(shouldHideNumericRouteShortName('501', 'Queen', 0)).toBe(false);
    expect(shouldHideNumericRouteShortName('108', 'Metro Local Line', 3)).toBe(false);
    expect(shouldHideNumericRouteShortName('099', 'Broadway B-Line', 3)).toBe(false);
  });
  it('with no route type, only a long internal id on a "... Line" name is hidden', () => {
    expect(shouldHideNumericRouteShortName('30053', 'Expo Line')).toBe(true);
    expect(shouldHideNumericRouteShortName('7', 'Bathurst')).toBe(false);
    expect(shouldHideNumericRouteShortName('108', 'Metro Local Line')).toBe(false);
  });
});

describe('routeDisplay', () => {
  it('keeps the card title exactly as getRouteLabel writes it', () => {
    for (const [s, l, a] of [['495', '4FUN: Shakopee-Savage', undefined], ['1', 'Line 1 (Yonge-University)', undefined], ['961', '757X - NORFOLK TO NNTC', undefined], ['MI', 'Milton', undefined], ['5', 'Ligne 5 - Bleue', 'STM (Montréal)']] as const) {
      expect(d(s, l, 1, a ?? undefined).full).toBe(getRouteLabel(s, l, a));
    }
  });
  it('shows a list row as a bold part and a lighter name, from the cleaned names', () => {
    expect(d('7', 'Bathurst', 3)).toMatchObject({ primary: '7', secondary: 'Bathurst', text: '7 — Bathurst' });
    expect(d('23', 'Ashmont Station - Ruggles Station via Washington Street', 3)).toMatchObject({ primary: '23', secondary: 'Ashmont Station - Ruggles Station' });
    expect(d('012', 'Main', 3).primary).toBe('12');
    expect(d('1', 'Line 1 (Yonge-University)', 1)).toMatchObject({ primary: 'Line 1', secondary: 'Yonge-University', full: '1' });
    expect(d('2', 'Ligne 2 - Orange', 1, 'STM (Montréal)')).toMatchObject({ primary: 'Ligne 2', secondary: 'Orange' });
    expect(d('5', 'Line 5 Eglinton', 100)).toMatchObject({ primary: 'Line 5 Eglinton', secondary: undefined });
    expect(d('', 'Free Annapolis Downtown Shuttle')).toMatchObject({ primary: 'Free Annapolis Downtown Shuttle', secondary: undefined });
  });
  it('keeps a letter code as the bold part (GO: LE, Milton) and a streetcar number', () => {
    expect(d('LE', 'Lakeshore East', 2)).toMatchObject({ primary: 'LE', secondary: 'Lakeshore East', full: 'Lakeshore East' });
    expect(d('501', 'Queen', 0)).toMatchObject({ primary: '501', secondary: 'Queen' });
  });
  it('keeps the words after a repeated number, and tells apart routes that share a public brand', () => {
    expect(d('10', '10 Bathurst', 3)).toMatchObject({ primary: '10', secondary: 'Bathurst', full: '10' });
    expect(d('961', '757X - NORFOLK TO NNTC', 3)).toMatchObject({ primary: '757X', secondary: 'NORFOLK TO NNTC', full: '757X' });
    expect(d('112', '757X - JEFFERSON AVE', 3).secondary).toBe('JEFFERSON AVE');
  });
  it('reads a number range as one name', () => {
    expect(d('', 'Route 10-12', 3).primary).toBe('Route 10-12');
  });
});
