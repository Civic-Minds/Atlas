import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { agencyPageData, agencyPagePath, agencyPlaces, resolveAgencySeo, type AgencyPageRoute } from './agencyPages';
import { agencyPageSummaries } from './agencyPagesData';
import { buildAgencyIndexData } from './agencyIndex';
import { AREA_INDEX } from './areaIndex';
import { areaMapHref, buildAreaPageData } from './areaPages';
import { buildRegionPageData, regionPages } from './regionPages';
import type { AreaConfig } from './areas';
import { parentAgencyPagePath } from './pagePaths';
import { PARENT_AGENCIES, parentAgency, parentAgencyPageData, parentMembers, parentRoutes } from './parentAgencies';
import { parseAgencyUrlRule } from '../src/utils/shareUrlState';

// CIV-1277: parent agencies, read from the committed summaries and configs the pages are built from.
const all = agencyPageSummaries();
const areas = readdirSync('config/areas').filter(f => f.endsWith('.json') && !f.startsWith('_'))
  .map(f => JSON.parse(readFileSync(`config/areas/${f}`, 'utf8')) as AreaConfig).filter(a => a.page);
const parentPage = (slug: string) => parentAgencyPageData(parentAgency(slug)!, all, null)!;
const r = (name: string, longName: string | null, mode = 3): AgencyPageRoute => ({ name, longName, mode, midday: 10, am: 10, pm: 10, evening: null, overnight: null });

describe('parent agencies (CIV-1277)', () => {
  it('counts a route in two members\' feeds once, but keeps different routes that share a number', () => {
    const routes = parentRoutes([{ routes: [r('M106', 'East Harlem - West Side'), r('1', 'Valleyfield')] }, { routes: [r('M106', 'East Harlem - West Side'), r('1', 'Terrebonne')] }]);
    expect(routes.map(x => `${x.name} ${x.longName}`)).toEqual(['M106 East Harlem - West Side', '1 Valleyfield', '1 Terrebonne']);
  });

  it('adds up MTA New York from its nine feeds', () => {
    const d = parentPage('mta-new-york');
    expect(parentMembers(parentAgency('mta-new-york')!, all).map(m => m.slug).sort()).toEqual(['lirr', 'mnr', 'mta-bus-company', 'nyct-bus-bronx', 'nyct-bus-brooklyn', 'nyct-bus-manhattan', 'nyct-bus-queens', 'nyct-bus-si', 'nyct-subway']);
    expect(d.path).toBe('/agency/mta-new-york');
    expect(d.title).toBe('MTA New York');
    expect(d.agency.routes.length).toBe(parentRoutes(parentMembers(parentAgency('mta-new-york')!, all)).length);
    expect(d.services.agencies).toHaveLength(9);
    expect(new URL(d.mapHref, 'http://x').searchParams.get('agencies')!.split(',').sort()).toEqual(parentMembers(parentAgency('mta-new-york')!, all).map(m => m.slug).sort());
    expect(d.intro).toMatch(/^MTA New York operates [\d,]+ routes \(.*\) in the New York metropolitan area and the Mid-Hudson region and connects with /);
    // No member is its own neighbour or connection.
    expect(d.connections.map(c => c.slug)).not.toContain('lirr');
    expect(d.nearby.map(n => n.slug)).not.toContain('nyct-subway');
  });

  it('gives each parent its clean slug and moves the member that had it (Ryan, 2026-11-02)', () => {
    expect(parentPage('exo').path).toBe('/agency/exo');
    expect(agencyPagePath('exo')).toBe('/agency/exo-trains');
    expect(agencyPagePath('bustang')).toBe('/agency/bustang-interregional');
    expect(agencyPagePath('mta-maryland')).toBe('/agency/mta-maryland-baltimore');
    expect(agencyPagePath('exo-lrrs')).toBe('/agency/exo-lrrs');
    expect(agencyPageData(all.find(a => a.slug === 'exo')!, all).path).toBe('/agency/exo-trains');
  });

  it('every page path is unique, and every moved member sits under a parent on its old slug', () => {
    const paths = [...all.map(a => agencyPagePath(a.slug)), ...PARENT_AGENCIES.map(p => parentAgencyPagePath(p.slug))];
    expect(new Set(paths).size).toBe(paths.length);
    for (const a of all.filter(x => x.pageSlug)) expect(a.parentAgency, a.slug).toBe(a.slug);
    const renames = JSON.parse(readFileSync('shared/data/agency-page-renames.json', 'utf8')) as Record<string, string>;
    expect(renames).toEqual(Object.fromEntries(all.filter(a => a.pageSlug).map(a => [a.slug, a.pageSlug])));
  });

  it('links each member up to its parent, and names a member like its parent by what it runs', () => {
    expect(agencyPageData(all.find(a => a.slug === 'lirr')!, all).parent).toEqual({ name: 'MTA New York', path: '/agency/mta-new-york' });
    expect(agencyPageData(all.find(a => a.slug === 'bustang')!, all).title).toBe('Bustang · Interregional');
    expect(agencyPageData(all.find(a => a.slug === 'mta-maryland')!, all).title).toBe('Maryland Transit Administration · Bus, Metro and Light Rail');
    expect(parentPage('bustang').services.agencies.map(m => m.title)).toContain('Bustang · Interregional');
    expect(agencyPageData(all.find(a => a.slug === 'guelph')!, all).parent).toBeUndefined();
  });

  it('lists a parent once on the all-agencies page, linking its own page', () => {
    const index = buildAgencyIndexData(all, areas, null);
    const rows = index.groups.flatMap(g => g.regions.flatMap(x => x.agencies));
    expect(rows.filter(x => x.name === 'MTA New York')).toEqual([expect.objectContaining({ slug: 'mta-new-york', parent: { href: '/agency/mta-new-york' } })]);
    expect(rows.map(x => x.slug)).not.toContain('nyct-subway');
    expect(rows.find(x => x.slug === 'exo')?.parent?.href).toBe('/agency/exo');
    expect(index.agencyCount).toBe(rows.length);
  });

  it('leaves map share links alone: ?agencies=exo still means the trains feed only', () => {
    expect(parseAgencyUrlRule('?agencies=exo')).toEqual({ kind: 'include', slugs: new Set(['exo']) });
  });
});


describe('parent agency search titles (CIV-1277)', () => {
  it('no member shares its parent\'s page title', () => {
    for (const p of PARENT_AGENCIES) {
      const parentTitle = resolveAgencySeo(parentPage(p.slug).agency, { mode: 'public', path: parentAgencyPagePath(p.slug) }).title;
      for (const m of parentMembers(p, all)) expect(resolveAgencySeo(m, { mode: 'public' }).title, m.slug).not.toBe(parentTitle);
    }
  });
});

describe('area and state pages show a parent once (Ryan, 2026-11-02)', () => {
  const bySlug = new Map(all.map(a => [a.slug, a]));
  const area = (slug: string) => buildAreaPageData(areas.find(a => a.slug === slug)!, bySlug, null);
  const state = (name: string) => buildRegionPageData(regionPages(all).find(r => r.name === name)!, all, null);

  it('lists MTA New York once on New York\'s page and in the New York area, linking its own page', () => {
    for (const d of [state('New York'), area('new-york')]) {
      const rows = d.agencies.filter(a => a.title === 'MTA New York');
      expect(rows).toHaveLength(1);
      expect(rows[0].href).toBe('/agency/mta-new-york');
      expect(d.agencies.map(a => a.slug)).not.toContain('nyct-subway');
    }
    expect(state('New York').agencies.find(a => a.slug === 'mta-new-york')!.slugs).toHaveLength(9);
  });

  it('counts the parent once and its routes once, with the same route total as before', () => {
    const d = state('New York');
    const members = parentMembers(parentAgency('mta-new-york')!, all);
    // Its routes that stop in New York (a Metro-North line wholly in Connecticut counts there instead), each once.
    const inNewYork = members.map(m => ({ routes: agencyPlaces(m).regions.find(r => r.name === 'New York')?.routes ?? [] }));
    expect(d.agencies.find(a => a.slug === 'mta-new-york')!.totalRoutes).toBe(parentRoutes(inNewYork).length);
    expect(d.totalRoutes).toBe(d.agencies.reduce((n, a) => n + a.totalRoutes, 0));
  });

  it('links exo\'s parent row to /agency/exo, not the trains page, and keeps every member on the map link', () => {
    const exo = area('montreal').agencies.find(a => a.title === 'exo')!;
    expect(exo.href).toBe('/agency/exo');
    // The map link opens the area's listed agencies plus every counted one: all of exo's counted services are on it.
    const params = new URL(areaMapHref(area('montreal')), 'http://x').searchParams;
    const onMap = new Set([...AREA_INDEX.montreal.agencies, ...(params.get('agencies')?.split(',') ?? [])]);
    expect(exo.slugs.filter(m => !onMap.has(m))).toEqual([]);
    expect(exo.slugs.length).toBeGreaterThan(1);
  });

  it('shows Maryland Transit Administration once on Maryland\'s page, with MARC under it', () => {
    const rows = state('Maryland').agencies.filter(a => a.slugs.includes('marc') || a.slugs.includes('mta-maryland'));
    expect(rows).toEqual([expect.objectContaining({ title: 'Maryland Transit Administration', href: '/agency/mta-maryland', slugs: expect.arrayContaining(['marc', 'mta-maryland']) })]);
  });
});
