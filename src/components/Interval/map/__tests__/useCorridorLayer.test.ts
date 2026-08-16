import { describe, expect, it } from 'vitest';
import { buildCorridorFilter } from '../useCorridorLayer';

describe('buildCorridorFilter', () => {
  const family = { agencySlug: 'ttc', routeIds: ['501', '504'] };

  it('hides static corridors when the setting is off, even with a selected family', () => {
    expect(buildCorridorFilter(false, family)).toEqual(['==', ['get', 'agencySlug'], '']);
  });

  it('shows only the selected family when the corridor band is active', () => {
    expect(buildCorridorFilter(true, family)).toEqual([
      'all', ['==', ['get', 'agencySlug'], 'ttc'],
      ['any', ['in', '501', ['get', 'routeIds']], ['in', '504', ['get', 'routeIds']]],
    ]);
  });
});
