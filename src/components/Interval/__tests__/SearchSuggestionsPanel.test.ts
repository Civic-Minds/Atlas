import { describe, expect, it } from 'vitest';
import { routeRowLabels } from '../SearchSuggestionsPanel';

describe('routeRowLabels', () => {
  it('uses the public name as the primary label for numeric rail IDs', () => {
    expect(routeRowLabels({ shortName: '30053', longName: 'Expo Line' })).toEqual({
      shortName: 'Expo Line',
      name: undefined,
    });
  });

  it('keeps real alphanumeric route names and their companion names', () => {
    expect(routeRowLabels({ shortName: 'R4', longName: '41st Avenue' })).toEqual({
      shortName: 'R4',
      name: '41st Avenue',
    });
  });

  it('puts the long name in the primary slot when the short name is blank', () => {
    const expected = { shortName: 'Free Annapolis Downtown Shuttle', name: undefined };
    expect(routeRowLabels({ shortName: '', longName: 'Free Annapolis Downtown Shuttle' })).toEqual(expected);
    expect(routeRowLabels({ shortName: '   ', longName: 'Free Annapolis Downtown Shuttle' })).toEqual(expected);
    expect(routeRowLabels({ shortName: null, longName: 'Free Annapolis Downtown Shuttle' })).toEqual(expected);
  });

  it('splits a line designator off the long name when the short name is hidden or blank', () => {
    expect(routeRowLabels({ shortName: '1', longName: 'Line 1 (Yonge-University)', routeType: 1 })).toEqual({
      shortName: 'Line 1',
      name: 'Yonge-University',
    });
    expect(routeRowLabels({ shortName: '2', longName: 'Line 2 (Bloor - Danforth)', routeType: 1 })).toEqual({
      shortName: 'Line 2',
      name: 'Bloor - Danforth',
    });
    expect(routeRowLabels({ shortName: '', longName: 'Line 1 (Yonge-University)' })).toEqual({
      shortName: 'Line 1',
      name: 'Yonge-University',
    });
  });

  it('keeps GO line codes bold with the regular line name', () => {
    expect(routeRowLabels({ shortName: 'LE', longName: 'Lakeshore East', routeType: 2 })).toEqual({
      shortName: 'LE',
      name: 'Lakeshore East',
    });
  });

  it('keeps a normal bus as bold number plus regular name', () => {
    expect(routeRowLabels({ shortName: '7', longName: 'Bathurst', routeType: 3 })).toEqual({ shortName: '7', name: 'Bathurst' });
  });
});
