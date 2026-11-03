import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { agencyIndexDescription, buildAgencyIndexData, resolveAgencyIndexSeo } from './agencyIndex';
import { hasMiddayService, type AgencyPageSummary } from './agencyPages';
import { agencyPageSummaries } from './agencyPagesData';
import { buildRegionPageData, regionPages } from './regionPages';
import type { AreaConfig } from './areas';
import summaries from './data/agency-pages.json';
import indexJson from '../public/data/index.json';

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
    expect(agencyIndexDescription(d)).toBe("5 transit agencies and 1 region. Each agency's page shows how often every route runs.");
    const seo = resolveAgencyIndexSeo(d, { mode: 'beta' });
    expect(seo.canonicalUrl).toBe('https://www.transitatlas.fyi/agencies');
    expect(seo.noindex).toBe(true);
    expect(resolveAgencyIndexSeo(d, { mode: 'public' }).noindex).toBe(false);
  });
});


/** Slugs deliberately left without a region or country (so they list under "Other"). Keep empty unless a real reason exists. */
const EXPLICITLY_UNASSIGNED: readonly string[] = [];

describe('every agency has a place', () => {
  it('no agency page lands under "Other" unless explicitly marked unassigned', () => {
    const list = (summaries as unknown as { agencies: AgencyPageSummary[] }).agencies;
    const d = buildAgencyIndexData(list, [], null);
    const other = d.groups.flatMap(g => g.regions.filter(r => g.country === 'Other' || r.region === 'Other').flatMap(r => r.agencies.map(a => a.slug)));
    expect(other.filter(s => !EXPLICITLY_UNASSIGNED.includes(s))).toEqual([]);
  });

  it('every agency in the registry config has a region', () => {
    const missing = (indexJson as { agencies: Array<{ slug: string; region?: string | null }> }).agencies.filter(a => !a.region).map(a => a.slug);
    expect(missing.filter(s => !EXPLICITLY_UNASSIGNED.includes(s))).toEqual([]);
  });
});

describe('agencyIndexRegionHref (CIV-966)', () => {
  it('links to the state or province heading, and nowhere without a place', async () => {
    const { agencyIndexRegionHref, agencyIndexRegionId } = await import('./agencyIndex');
    expect(agencyIndexRegionHref({ country: 'United States', region: 'Colorado' })).toBe('/agencies#index-united-states-colorado');
    expect(agencyIndexRegionId('Canada', 'Québec')).toBe('index-canada-quebec');
    expect(agencyIndexRegionHref({ country: 'Canada' })).toBeNull();
  });
});

describe('agency index short names (CIV-967)', () => {
  it('carries each agency\'s name without its bracketed city, for rows too tight for the full name', () => {
    const cdta = { ...ag('cdta', 'Capital District Transportation Authority', 'United States', 'New York', 50), displayName: 'CDTA (Albany)' };
    const row = buildAgencyIndexData([cdta], [], null).groups[0].regions[0].agencies[0];
    expect(row).toMatchObject({ name: 'Capital District Transportation Authority', shortName: 'CDTA' });
  });
});

describe('agency index names (#1245)', () => {
  it('shows the official name without its bracket, and keeps the place where agencies share a name', () => {
    const rows = buildAgencyIndexData([
      ag('montgomery', 'Montgomery Transit (The M)', 'United States', 'Alabama', 10),
      ag('bc-kelowna', 'BC Transit (Kelowna)', 'Canada', 'British Columbia', 30),
      ag('bc-victoria', 'BC Transit (Victoria)', 'Canada', 'British Columbia', 69),
      ag('miway', 'MiWay (Mississauga)', 'Canada', 'Ontario', 80),
    ], [], null).groups.flatMap(g => g.regions.flatMap(r => r.agencies)).map(a => a.name);
    expect(rows).toEqual(['BC Transit · Kelowna', 'BC Transit · Victoria', 'MiWay', 'Montgomery Transit']);
  });
});

describe('states in the agency list match the state pages (#1306)', () => {
  const all = agencyPageSummaries();
  const areas = readdirSync('config/areas').filter(f => f.endsWith('.json') && !f.startsWith('_'))
    .map(f => JSON.parse(readFileSync(`config/areas/${f}`, 'utf8')) as AreaConfig).filter(a => a.page);
  const index = buildAgencyIndexData(all, areas, null);
  const listed = (country: string, region: string) => index.groups.find(g => g.country === country)?.regions.find(r => r.region === region)?.agencies ?? [];
  const bySlug = new Map(all.map(a => [a.slug, a]));
  // State pages leave out agencies with no weekday midday service; the list keeps them, as it lists every agency page.
  const noMidday = (slug: string) => { const a = bySlug.get(slug); return !!a && !hasMiddayService(a); };

  it('lists every state page\'s agencies under that state, and no other agency with midday service', () => {
    for (const r of regionPages(all)) {
      const page = buildRegionPageData(r, all, null).agencies.map(a => a.slug).sort();
      expect(listed(r.country, r.name).map(a => a.slug).filter(s => !noMidday(s)).sort(), r.name).toEqual(page);
    }
  });

  it('lists a cross-border agency under each state it serves, with one link and one count', () => {
    expect(listed('United States', 'Nebraska').map(a => a.slug).sort()).toEqual(['lincoln', 'omahametro', 'sioux-city']);
    expect(listed('United States', 'Iowa').map(a => a.slug)).toContain('sioux-city');
    const ny = listed('United States', 'Connecticut').find(a => a.slug === 'mta-new-york');
    expect(ny?.parent?.href).toBe('/agency/mta-new-york');
    const slugs = index.groups.flatMap(g => g.regions.flatMap(r => r.agencies.map(a => a.slug)));
    expect(index.agencyCount).toBe(new Set(slugs).size);
    expect(index.agencyCount).toBeLessThan(slugs.length);
  });
});
