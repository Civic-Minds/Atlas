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
    expect(splitDesignator('Line 5 Eglinton')).toEqual({ designator: 'Line 5', rest: 'Eglinton' });
    expect(splitDesignator('Bathurst')).toBeNull();
  });
});

describe('shouldHideNumericRouteShortName', () => {
  it('hides internal (3+ digit) ids on rail, subway and ferry, keeps short public numbers, never on trams or buses', () => {
    expect(shouldHideNumericRouteShortName('30053', 'Expo Line', 1)).toBe(true);
    expect(shouldHideNumericRouteShortName('090', 'Elizabeth River Ferry', 4)).toBe(true);
    // NYC subway 2 and 3 share "7 Avenue Express"; O-Train 1: the number is the public name.
    expect(shouldHideNumericRouteShortName('2', '7 Avenue Express', 1)).toBe(false);
    expect(shouldHideNumericRouteShortName('1', "Blair <> Tunney's Pasture", 12)).toBe(false);
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
  it('keeps every cleaning rule of the old card title (arrows, via, zeros, brands, SMART), and now also the long name the old card dropped', () => {
    expect(d('495', '4FUN: Shakopee-Savage-Burnsville-MOA-MSP', 3).text).toBe('495 — 4FUN');
    expect(d('02', 'Main via Park', 3).text).toBe('2 — Main');
    expect(d('3', 'North <> South <> East <> West', 3).text).toBe('3 — North ↔ West');
    expect(d('', 'Main Line', 2, 'SMART (Sonoma-Marin)').text).toBe('SMART Train');
    // The old card title was "1" and "E" here (the long name repeated the short one); it now matches the list.
    expect(getRouteLabel('1', 'Line 1 (Yonge-University)')).toBe('1');
    expect(d('1', 'Line 1 (Yonge-University)').text).toBe('Line 1 — Yonge-University');
    expect(d('E', 'Green Line E', 0).text).toBe('Green Line E'); // the long name already holds the letter: shown once
  });
  it('names a line from its long name even with no route type (cards have none)', () => {
    expect(d('1', 'Line 1 (Yonge-University)')).toMatchObject({ primary: 'Line 1', secondary: 'Yonge-University' });
    expect(d('5', 'Ligne 5 - Bleue', undefined, 'STM (Montréal)')).toMatchObject({ primary: 'Ligne 5', secondary: 'Bleue' });
    expect(d('7', 'Route 7: Bathurst', 3)).toMatchObject({ primary: '7', secondary: 'Bathurst' });
    expect(d('G', 'G-Line Rapid Ride', 3)).toMatchObject({ primary: 'G', secondary: 'G-Line Rapid Ride' });
  });
  it('shows a list row as a bold part and a lighter name, from the cleaned names', () => {
    expect(d('7', 'Bathurst', 3)).toMatchObject({ primary: '7', secondary: 'Bathurst', text: '7 — Bathurst' });
    expect(d('23', 'Ashmont Station - Ruggles Station via Washington Street', 3)).toMatchObject({ primary: '23', secondary: 'Ashmont Station - Ruggles Station' });
    expect(d('012', 'Main', 3).primary).toBe('12');
    expect(d('1', 'Line 1 (Yonge-University)', 1)).toMatchObject({ primary: 'Line 1', secondary: 'Yonge-University' });
    expect(d('2', 'Ligne 2 - Orange', 1, 'STM (Montréal)')).toMatchObject({ primary: 'Ligne 2', secondary: 'Orange' });
    expect(d('5', 'Line 5 Eglinton', 0, 'ttc')).toMatchObject({ primary: 'Line 5', secondary: 'Eglinton' });
    expect(d('', 'Free Annapolis Downtown Shuttle')).toMatchObject({ primary: 'Free Annapolis Downtown Shuttle', secondary: undefined });
  });
  it('keeps a letter code as the bold part (GO: LE, Milton) and a streetcar number', () => {
    expect(d('LE', 'Lakeshore East', 2)).toMatchObject({ primary: 'LE', secondary: 'Lakeshore East' });
    expect(d('501', 'Queen', 0)).toMatchObject({ primary: '501', secondary: 'Queen' });
  });
  it('keeps the words after a repeated number, and tells apart routes that share a public brand', () => {
    expect(d('10', '10 Bathurst', 3)).toMatchObject({ primary: '10', secondary: 'Bathurst' });
    expect(d('961', '757X - NORFOLK TO NNTC', 3)).toMatchObject({ primary: '757X', secondary: 'NORFOLK TO NNTC' });
    expect(d('112', '757X - JEFFERSON AVE', 3).secondary).toBe('JEFFERSON AVE');
  });
  it('reads a number range as one name', () => {
    expect(d('', 'Route 10-12', 3).primary).toBe('Route 10-12');
  });
  it('names a route the same with only the agency slug as with its name (agency card, single-agency stop rows)', () => {
    const byName = routeDisplay({ shortName: 'SMART', longName: 'Main Line', routeType: 2, agencySlug: 'smart-ca', agencyName: 'Sonoma-Marin Area Rail Transit (SMART)' });
    const bySlug = routeDisplay({ shortName: 'SMART', longName: 'Main Line', routeType: 2, agencySlug: 'smart-ca' });
    expect(bySlug.text).toBe(byName.text);
  });
  it('hides numeric ids on light rail and ferry from the raw route_type and slug (UTA 701, Calgary 201, HRT 800/090)', () => {
    expect(routeDisplay({ shortName: '701', longName: 'Blue Line', routeType: 0, agencySlug: 'uta' }).text).toBe('Blue Line');
    expect(routeDisplay({ shortName: '201', longName: 'Red Line - Somerset - Bridlewood/Tuscany CTrain', routeType: 0, agencySlug: 'calgary' }).primary).not.toBe('201');
    expect(routeDisplay({ shortName: '090', longName: 'ELIZABETH RIVER FERRY', routeType: 4, agencySlug: 'hrt' }).text).toBe('ELIZABETH RIVER FERRY');
    expect(routeDisplay({ shortName: '501', longName: 'Queen', routeType: 0, agencySlug: 'ttc' }).text).toBe('501 — Queen');
    expect(routeDisplay({ shortName: '303', longName: 'Saint-Jérôme (Saint-Camille) (sur réservation)', routeType: 1501, agencySlug: 'exo-laurentides' }).primary).toBe('303');
  });
  it('treats a zero-padded number as a repeat, and never title-cases the route\'s own capital code', () => {
    expect(routeDisplay({ shortName: '1', longName: '01 - Midway', routeType: 3 }).text).toBe('1 — Midway');
    expect(routeDisplay({ shortName: '3', longName: 'Route 03 - Green', routeType: 3 }).text).toBe('3 — Green');
    expect(routeDisplay({ shortName: '1', longName: 'Route 01', routeType: 3 }).text).toBe('1');
    expect(routeDisplay({ shortName: '2', longName: 'Line 2', routeType: 3 }).text).toBe('Line 2');
    expect(routeDisplay({ shortName: 'A', longName: '8 Avenue Express', routeType: 1, agencySlug: 'nyct-subway' }).text).toBe('A — 8 Avenue Express');
  });
});
