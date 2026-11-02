import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { agencyPageData, agencyPageJsonLd, agencyPlaces, type AgencyPageSummary } from './agencyPages';
import { agencyPageSummaries } from './agencyPagesData';
import type { AreaConfig } from './areas';
import { AREA_INDEX } from './areaIndex';
import type { AreaBoundaries } from './areaBoundaries';
import { areaRegionName } from './areaRegions';
import { buildRegionPageData, regionPages } from './regionPages';
import { countryForRegion } from './regionCountry';

// #1283: the places each agency serves, read from the committed summaries the pages are built from.
const all = agencyPageSummaries();
const areas = readdirSync('config/areas').filter(f => f.endsWith('.json') && !f.startsWith('_'))
  .map(f => JSON.parse(readFileSync(`config/areas/${f}`, 'utf8')) as AreaConfig).filter(a => a.page);
const homeArea = new Map(areas.flatMap(a => a.agencies.map(s => [s, { slug: a.slug, name: a.name, bbox: a.bbox }] as const)));
const agency = (slug: string): AgencyPageSummary => all.find(a => a.slug === slug)!;
const pageOf = (slug: string) => agencyPageData(agency(slug), all, null, homeArea.get(slug));
const stateMembers = (name: string) => buildRegionPageData(regionPages(all).find(r => r.name === name)!, all, null).agencies.map(a => a.slug);

describe('the places an agency serves (#1283)', () => {
  it('names both areas BART stops in, each linked to its own page', () => {
    const d = pageOf('bart');
    expect(d.place).toBe('the Bay Area and the San Jose area');
    expect(d.places.named.map(p => p.href)).toEqual(['/area/san-francisco', '/area/san-jose']);
    expect(d.description).toContain('in the Bay Area and the San Jose area');
  });

  it('names AC Transit\'s areas, never "Berkeley" linked to the Bay Area page', () => {
    const d = pageOf('actransit');
    expect(d.place).toBe('the Bay Area and the San Jose area');
    expect(d.places.named.map(p => [p.name, p.href])).toEqual([['the Bay Area', '/area/san-francisco'], ['the San Jose area', '/area/san-jose']]);
  });

  it('names WMATA\'s area, since it crosses into Maryland and Virginia, and lists it on all three state pages', () => {
    expect(pageOf('wmata').place).toBe('the Washington, D.C. area');
    for (const state of ['Washington DC', 'Maryland', 'Virginia']) expect(stateMembers(state), state).toContain('wmata');
  });

  it('names PATH\'s area and lists it in New Jersey and New York', () => {
    expect(pageOf('path').place).toBe('the New York metropolitan area');
    expect(stateMembers('New Jersey')).toContain('path');
    expect(stateMembers('New York')).toContain('path');
  });

  it('names the New York area for Staten Island buses, whose S89 stops in Bayonne, and lists them in New Jersey with that route only', () => {
    expect(pageOf('nyct-bus-si').place).toBe('the New York metropolitan area');
    const nj = buildRegionPageData(regionPages(all).find(r => r.name === 'New Jersey')!, all, null).agencies.find(a => a.slug === 'nyct-bus-si');
    expect(nj?.totalRoutes).toBe(1);
    expect(agencyPlaces(agency('nyct-bus-si')).regions.find(r => r.name === 'New Jersey')?.routes.map(r => r.name)).toEqual(['S89']);
  });

  it('keeps a one-city agency\'s city, unlinked, and its one state', () => {
    const d = pageOf('guelph');
    expect(d.intro).toMatch(/^Guelph Transit operates \d+ routes in Guelph with/);
    expect(d.places.named).toEqual([{ name: 'Guelph' }]);
    expect(agencyPlaces(agency('guelph')).regions.map(r => r.name)).toEqual(['Ontario']);
  });

  it('never names an agency by a neighbouring area one of its routes reaches', () => {
    // Jefferson Transit's one route into Kitsap County does not make it a Kitsap County agency.
    expect(pageOf('jeffersontransit').places.named).toEqual([{ name: agency('jeffersontransit').city }]);
  });

  it('every linked place names the page it opens, and a city never links', () => {
    let linked = 0;
    for (const a of all) {
      const d = agencyPageData(a, all, null, homeArea.get(a.slug));
      for (const p of d.places.named) {
        if (!p.href) {
          expect(p.name, a.slug).toBe(a.city);
          continue;
        }
        const slug = p.href.replace(/^\/area\//, '');
        expect(AREA_INDEX[slug]?.page, `${a.slug} ${p.href}`).toBe(true);
        expect(p.name, `${a.slug} ${p.href}`).toBe(areaRegionName({ slug, name: AREA_INDEX[slug].name ?? slug }));
        linked++;
      }
    }
    expect(linked).toBeGreaterThan(50);
  });

  it('names the same areas in the structured data as in the intro', () => {
    const ld = agencyPageJsonLd(agency('bart'), 'https://x/agency/bart', 'https://x', homeArea.get('bart')) as { '@graph': Array<{ areaServed?: unknown }> };
    expect(ld['@graph'][0].areaServed).toEqual([{ '@type': 'Place', name: 'Bay Area' }, { '@type': 'Place', name: 'San Jose area' }]);
  });
});

describe('state and province boundaries (#1283)', () => {
  const boundaries = JSON.parse(readFileSync('shared/data/region-boundaries.json', 'utf8')) as AreaBoundaries;

  it('are keyed by the region names agency configs use, and cover every US and Canadian agency\'s home', () => {
    for (const key of Object.keys(boundaries)) expect(['United States', 'Canada'], key).toContain(countryForRegion(key));
    for (const a of all) if (a.country === 'United States' || a.country === 'Canada') expect(boundaries[a.region!], `${a.slug} ${a.region}`).toBeTruthy();
  });

  it('tag every route with the states it stops in, every one counting somewhere', () => {
    for (const a of all) {
      if (a.country !== 'United States' && a.country !== 'Canada') continue;
      const counted = new Set(agencyPlaces(a).regions.flatMap(r => r.routes));
      expect(counted.size, a.slug).toBe(a.routes.length);
    }
  });
});
