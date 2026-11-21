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

describe('a parent agency is one search result (CIV-1963)', () => {
  const feed = (slug: string, name: string, extra: Record<string, unknown> = {}) => ({ slug, name, region: 'New York', center: [40.7, -74] as [number, number], url: '', parentAgency: 'mta-new-york', ...extra });
  const agencies = [feed('nyct-subway', 'MTA New York City Transit'), feed('nyct-bus-queens', 'MTA NYCT Bus (Queens)', { cities: ['Queens Village, New York'], nameQualifier: 'Queens' }), feed('lirr', 'Long Island Rail Road')] as any;

  it('finds the parent by its own name or any feed, as one row', () => {
    expect(searchAgencyGroups(agencies, 'mta new york', null).map(g => g.name)).toEqual(['MTA New York']);
    expect(searchAgencyGroups(agencies, 'queens', null).map(g => g.name)).toEqual(['MTA New York']);
    expect(searchAgencyGroups(agencies, 'long island', null).map(g => g.name)).toEqual(['MTA New York']);
  });
});
