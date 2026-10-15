import { describe, expect, it } from 'vitest';
import { agencyIndexDescription, buildAgencyIndexData, resolveAgencyIndexSeo } from './agencyIndex';
import type { AgencyPageSummary } from './agencyPages';

const ag = (slug: string, name: string, country: string | undefined, region: string | undefined, routeCount: number, midday: number | null = 10): AgencyPageSummary => ({
  slug, name, displayName: name, city: 'X', country, region, routeCount, span: null, lastRefreshedAt: null,
  routes: [{ name: '1', longName: null, mode: 3, midday, am: midday, pm: midday, evening: null, overnight: null }],
});
const AREA = (slug: string, name: string, agencies: string[], page = true) => ({ slug, name, agencies, page });

describe('buildAgencyIndexData', () => {
  const agencies = [
    ag('ttc', 'Toronto Transit Commission', 'Canada', 'Ontario', 231),
    ag('hsr', 'Hamilton Street Railway', 'Canada', 'Ontario', 31),
    ag('bc', 'BC Transit', 'Canada', 'British Columbia', 4),
    ag('mta', 'MTA', 'United States', 'New York', 9),
    ag('odd', 'Odd Agency', undefined, undefined, 1),
  ];
  const d = buildAgencyIndexData(agencies, [AREA('toronto', 'Toronto', ['ttc', 'hsr']), AREA('empty', 'Nowhere', ['gone']), AREA('hidden', 'Hidden', ['mta'], false)], '2026-10-13');

  it('lists areas that have a page and an agency page, by region name', () => {
    expect(d.areas).toEqual([{ slug: 'toronto', title: 'Greater Toronto and Hamilton Area', shortName: 'Greater Toronto and Hamilton Area' }]);
  });

  it('groups agencies by country then region, A to Z, with unknown places last', () => {
    expect(d.groups.map(g => g.country)).toEqual(['Canada', 'United States', 'Other']);
    expect(d.groups[0].regions.map(r => r.region)).toEqual(['British Columbia', 'Ontario']);
    expect(d.groups[0].regions[1].agencies.map(a => [a.slug, a.routes])).toEqual([['hsr', 31], ['ttc', 231]]);
    expect(d.agencyCount).toBe(5);
  });

  it('writes a description and a canonical, noindex outside public', () => {
    expect(agencyIndexDescription(d)).toBe('5 transit agencies and 1 region. Each agency's page shows how often every route runs, from its published schedule.');
    const seo = resolveAgencyIndexSeo(d, { mode: 'beta' });
    expect(seo.canonicalUrl).toBe('https://www.transitatlas.fyi/agencies');
    expect(seo.noindex).toBe(true);
    expect(resolveAgencyIndexSeo(d, { mode: 'public' }).noindex).toBe(false);
  });
});

