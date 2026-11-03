import { describe, expect, it } from 'vitest';
import { areaPagePath } from './pagePaths';
import { agencyPageSummaries } from './agencyPagesData';
import { agencyBreadcrumbs, agencyPageData, regionPageHref, type AgencyPageRoute, type AgencyPageSummary } from './agencyPages';
import { buildAgencyIndexData } from './agencyIndex';
import {
  buildRegionPageData, regionAreasSentence, regionAreasSentenceParts, regionBarNote, regionIntroParts, regionKind, regionMapHref, regionPageDescription, regionPageH1, regionPages, regionPageTitle, resolveRegionSeo,
} from './regionPages';

const r = (name: string, mode: number, midday: number | null): AgencyPageRoute => ({ name, longName: null, mode, midday, am: midday, pm: midday, evening: null, overnight: null });
const ag = (slug: string, region: string, routes: AgencyPageRoute[], extra: Partial<AgencyPageSummary> = {}): AgencyPageSummary => ({
  slug, name: slug.toUpperCase(), displayName: slug.toUpperCase(), city: 'X', country: 'United States', region, routeCount: routes.length, routes, span: { first: 6, last: 24 }, lastRefreshedAt: '2026-09-01', ...extra,
});
const RTD = ag('rtd', 'Colorado', [r('A', 2, 15), r('15', 3, 10), r('16', 3, 20)], { bbox: [39, -105.5, 40, -104.5] });
const RFTA = ag('rfta', 'Colorado', [r('BRT', 3, 15)], { bbox: [39.2, -107.3, 39.6, -106.8] });
const NIGHT = ag('night', 'Colorado', [r('N', 3, null)]);
const ONLY_NIGHT = ag('owl', 'Wyoming', [r('O', 3, null)]);
const TTC = ag('ttc', 'Ontario', [r('1', 1, 4)], { country: 'Canada' });
const ALL = [RTD, RFTA, NIGHT, ONLY_NIGHT, TTC];

describe('state and province pages (CIV-976)', () => {
  it('builds one page per place with an agency that has midday service', () => {
    expect(regionPages(ALL).map(p => p.slug)).toEqual(['ontario', 'colorado']);
  });

  it('counts the place\'s agencies with the area pages\' rule, whole', () => {
    const d = buildRegionPageData({ slug: 'colorado', name: 'Colorado', country: 'United States' }, ALL, null);
    expect(d.agencies.map(a => a.slug)).toEqual(['rtd', 'rfta']);
    expect(d.totalRoutes).toBe(4);
    expect(d.region.kind).toBe('state');
    expect(d.bbox).toEqual([39, -107.3, 40, -104.5]);
    expect(regionPageH1(d)).toBe('Colorado');
    expect(regionPageTitle(d)).toBe('Colorado: how often transit runs across 2 agencies');
    expect(regionPageDescription(d)).toBe('Compare 2 transit agencies in Colorado side by side: routes and weekday waits by time of day, from published schedules.');
    expect(regionIntroParts(d).lead).toBe('Colorado has 2 transit agencies operating 4 routes (1 commuter rail, 3 bus)');
    expect(regionBarNote(d)).toBe("The bar splits this state's routes by how often they run on a weekday midday. Each route is judged by its slower direction.");
    expect(regionMapHref(d)).toMatch(/^\/\?agencies=rtd%2Crfta&lat=39\.5000&lon=-105\.9000&z=\d+$/);
    expect(resolveRegionSeo(d, { mode: 'public' })).toMatchObject({ canonicalUrl: 'https://www.transitatlas.fyi/region/colorado', noindex: false, matchedPath: '/region/colorado' });
  });

  it('names provinces, territories and the district', () => {
    expect(regionKind('Canada', 'Ontario')).toBe('province');
    expect(regionKind('Canada', 'Yukon')).toBe('territory');
    expect(regionKind('United States', 'Washington DC')).toBe('district');
    expect(regionKind('United States', 'Colorado')).toBe('state');
  });

  it('links an agency\'s place to its state page, or to the all-agencies heading when the state has none', () => {
    expect(regionPageHref(NIGHT, ALL)).toBe('/region/colorado');
    expect(regionPageHref(ONLY_NIGHT, ALL)).toBeUndefined();
    expect(agencyPageData(RFTA, ALL).regionPage).toBe('/region/colorado');
    expect(agencyPageData(ONLY_NIGHT, ALL).regionPage).toBeUndefined();
    expect(agencyBreadcrumbs(RFTA, undefined, '/region/colorado').find(c => c.name === 'Colorado')?.href).toBe('/region/colorado');
  });

  it('links each state heading on the all-agencies list that has a page', () => {
    const us = buildAgencyIndexData(ALL, [], null).groups.find(g => g.country === 'United States')!;
    expect(us.regions.map(x => [x.region, x.href])).toEqual([['Colorado', '/region/colorado'], ['Wyoming', undefined]]);
  });

  it('lists an agency on every state its routes stop in, with only the routes counted there (#1283)', () => {
    const cross = ag('cross', 'Colorado', [{ ...r('1', 3, 10), regions: ['Colorado'] }, { ...r('2', 3, 15), regions: ['Colorado', 'Wyoming'] }, r('3', 3, 20)]);
    const all = [cross, ONLY_NIGHT];
    expect(regionPages(all).map(p => p.slug)).toEqual(['colorado', 'wyoming']);
    const wy = buildRegionPageData({ slug: 'wyoming', name: 'Wyoming', country: 'United States' }, all, null);
    expect(wy.agencies.map(a => [a.slug, a.totalRoutes])).toEqual([['cross', 1]]);
    // A route with no state tag counts in the agency's home state.
    const co = buildRegionPageData({ slug: 'colorado', name: 'Colorado', country: 'United States' }, all, null);
    expect(co.agencies.map(a => [a.slug, a.totalRoutes])).toEqual([['cross', 3]]);
    // The breadcrumb keeps the home state.
    expect(agencyPageData(cross, all).regionPage).toBe('/region/colorado');
  });
});

describe('areas named after a state intro (CIV-1298)', { timeout: 30_000 }, () => {
  const all = agencyPageSummaries();
  const page = (name: string) => buildRegionPageData(regionPages(all).find(x => x.name === name)!, all, null);

  it('names up to three, most routes first, each linking its area page', () => {
    const on = regionAreasSentenceParts(page('Ontario'))!;
    expect(on.named.map(a => a.slug)).toEqual(['toronto', 'ottawa', 'kitchener']);
    expect(on.named.map(a => areaPagePath(a.slug))).toEqual(['/area/toronto', '/area/ottawa', '/area/kitchener']);
    expect(regionAreasSentence(page('Ontario'))).toBe('Regions include the Greater Toronto and Hamilton Area, the Ottawa area and Waterloo Region.');
    expect(page('California').areas.length).toBeGreaterThan(3);
    expect(regionAreasSentenceParts(page('California'))!.named).toHaveLength(3);
  });

  it('reads right with one or two areas, and says nothing with none', () => {
    expect(regionAreasSentence(page('Colorado'))).toBe('Regions include the Denver area.');
    expect(regionAreasSentence(page('Texas'))).toBe('Regions include the Dallas–Fort Worth area and the Houston area.');
    expect(regionAreasSentenceParts(page('Nebraska'))).toBeNull();
    expect(regionAreasSentence(page('Nebraska'))).toBe('');
  });

  it('names an area on each state with at least a fifth of its routes, not where a route or two cross the line', () => {
    for (const s of ['Washington DC', 'Maryland', 'Virginia']) expect(page(s).areas.map(a => a.slug), s).toContain('washington');
    expect(page('Quebec').areas.map(a => a.slug)).toContain('ottawa');
    expect(page('New Jersey').areas.map(a => a.slug)).toContain('new-york');
    expect(page('Maine').areas).toEqual([]);
    expect(page('Connecticut').areas.map(a => a.slug)).not.toContain('new-york');
    for (const r of regionPages(all)) for (const a of page(r.name).areas) expect(a.routes, `${r.name} ${a.slug}`).toBeGreaterThan(0);
  });
});
