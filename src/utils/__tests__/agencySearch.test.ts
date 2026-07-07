import { describe, it, expect } from 'vitest';
import { prepareAgencyGroupsForDisplay } from '../agencySearch';

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
    expect(prepared.groups).toHaveLength(5);
    expect(prepared.truncated).toBe(true);
  });
});
