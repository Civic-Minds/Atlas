import { describe, expect, it } from 'vitest';
import { searchAreas, searchFold } from './areaSearch';
import type { AreaIndex } from './areaIndex';

const bbox: [number, number, number, number] = [45, -74, 46, -73];
const INDEX: AreaIndex = {
  montreal: { name: 'Montréal', cities: ['Montréal'], page: true, agencies: ['stm', 'rem'], bbox },
  toronto: { name: 'Toronto', cities: ['Toronto', 'Hamilton', 'Oshawa'], page: true, agencies: ['ttc', 'go'], bbox },
  boston: { name: 'Boston', cities: ['Boston', 'Cambridge', 'Newton'], page: true, agencies: ['mbta'], bbox },
  cambridge: { name: 'Cambridge', cities: ['Cambridge'], page: true, agencies: ['cat'], bbox },
  akron: { name: 'Akron', cities: ['Akron'], page: false, agencies: ['akron'], bbox },
  nopage: { name: 'Nopage', cities: ['Nopage'], page: true, agencies: ['ghost'], bbox },
};
const PAGES = new Set(['cat', 'stm', 'rem', 'ttc', 'go', 'mbta', 'akron']);
const ALL = new Set(['cat', 'stm', 'rem', 'ttc', 'go', 'mbta', 'akron', 'ghost']);
const find = (q: string, catalog = ALL) => searchAreas(q, catalog, 3, INDEX, PAGES).map(r => r.slug);

describe('searchAreas', () => {
  it('folds accents and case', () => {
    expect(searchFold('  MONTRÉAL ')).toBe('montreal');
    expect(find('montreal')).toEqual(['montreal']);
    expect(find('MONTRÉAL')).toEqual(['montreal']);
  });

  it('matches the region name and cities as aliases', () => {
    expect(find('greater montreal')).toEqual(['montreal']);
    expect(find('hamilton')).toEqual(['toronto']);
    expect(find('newton')).toEqual(['boston']);
  });

  it('lists only areas with a page and an agency page, like /agencies', () => {
    expect(find('akron')).toEqual([]);
    expect(find('nopage')).toEqual([]);
  });

  it('drops areas with no agency in the catalog (beta-only on public)', () => {
    expect(find('toronto', new Set(['stm']))).toEqual([]);
  });

  it('ignores one-letter queries and ranks name matches before city matches', () => {
    expect(find('m')).toEqual([]);
    expect(find('cambridge')).toEqual(['cambridge', 'boston']);
  });

  it('reports the agencies in the catalog and the bounds', () => {
    const [a] = searchAreas('toronto', new Set(['ttc']), 3, INDEX, PAGES);
    expect(a).toMatchObject({ slug: 'toronto', name: 'Toronto', agencyCount: 1, bbox });
  });
});
