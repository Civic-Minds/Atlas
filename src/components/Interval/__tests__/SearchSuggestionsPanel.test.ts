import { describe, expect, it } from 'vitest';
import { routeRowLabels } from '../SearchSuggestionsPanel';

describe('routeRowLabels', () => {
  it('uses the public name as the primary label for numeric rail IDs', () => {
    expect(routeRowLabels('30053', 'Expo Line')).toEqual({
      shortName: 'Expo Line',
      name: undefined,
    });
  });

  it('keeps real alphanumeric route names and their companion names', () => {
    expect(routeRowLabels('R4', '41st Avenue')).toEqual({
      shortName: 'R4',
      name: '41st Avenue',
    });
  });

  it('puts the long name in the primary slot when the short name is blank', () => {
    const expected = { shortName: 'Free Annapolis Downtown Shuttle', name: undefined };
    expect(routeRowLabels('', 'Free Annapolis Downtown Shuttle')).toEqual(expected);
    expect(routeRowLabels('   ', 'Free Annapolis Downtown Shuttle')).toEqual(expected);
    expect(routeRowLabels(null, 'Free Annapolis Downtown Shuttle')).toEqual(expected);
  });
});
