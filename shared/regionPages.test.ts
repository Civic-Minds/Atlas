import { describe, expect, it } from 'vitest';
import { agencyBreadcrumbs, agencyPageData, regionPageHref, type AgencyPageRoute, type AgencyPageSummary } from './agencyPages';
import { buildAgencyIndexData } from './agencyIndex';
import {
  buildRegionPageData, regionBarNote, regionIntroParts, regionKind, regionMapHref, regionPageDescription, regionPageH1, regionPages, regionPageTitle, resolveRegionSeo,
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
    expect(regionIntroParts(d).lead).toBe('Colorado has 2 transit agencies running 4 routes (1 commuter rail, 3 bus)');
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

  it('refuses two places with the same slug', () => {
    expect(() => regionPages([RTD, ag('co2', 'Colorado', [r('X', 3, 10)], { country: 'Canada' })])).toThrow(/share the region slug/);
  });
});
