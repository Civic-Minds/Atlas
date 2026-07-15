import { describe, it, expect } from 'vitest';
import { prepareAgencyGroupsForDisplay, searchAgencyGroups } from '../agencySearch';

describe('agencySearch', () => {
  it('caps agency lists for display', () => {
    const groups = Array.from({ length: 12 }, (_, i) => ({
      key: `Agency ${i}::Ontario`,
      name: `Agency ${i}`,
      region: 'Ontario',
      slug: `agency-${i}`,
      inView: true,
      distanceM: i,
    }));
    const prepared = prepareAgencyGroupsForDisplay(groups);
    expect(prepared.totalMatches).toBe(12);
    expect(prepared.groups).toHaveLength(10);
    expect(prepared.truncated).toBe(true);
  });

  it('matches city aliases for agencies whose names omit the city', () => {
    const groups = searchAgencyGroups([
      {
        slug: 'octranspo',
        name: 'OC Transpo',
        region: 'Ontario',
        center: [45.32, -75.69],
        url: '',
        searchAliases: ['Ottawa'],
      },
    ], 'ottawa', null);
    expect(groups.map(g => g.slug)).toEqual(['octranspo']);
  });
});
