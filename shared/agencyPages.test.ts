import { describe, expect, it } from 'vitest';
import {
  agencyBreadcrumbs, agencyLeadSentence, agencyMapHref, agencyPageDescription, agencyPageH1, agencyPageJsonLd,
  agencyPagePath, agencyPageTitle, agencySpanText, agencyStats, formatDataDate, nearbyAgencies, resolveAgencySeo, trimRedundantCity,
  type AgencyPageRoute, type AgencyPageSummary,
} from './agencyPages';
import { agencyPageSummaries, getAgencyPageSummary } from './agencyPagesData';

const r = (name: string, mode: number, midday: number | null, am = midday, pm = midday): AgencyPageRoute => ({ name, longName: `${name} St`, mode, midday, am, pm });

const TTC: AgencyPageSummary = {
  slug: 'ttc', name: 'Toronto Transit Commission', displayName: 'TTC (Toronto)', city: 'Toronto', region: 'Ontario', country: 'Canada',
  center: [43.7187, -79.4077], bbox: [43.25, -79.88, 44.05, -78.88], websiteUrl: 'https://www.ttc.ca',
  routeCount: 5, span: { first: 5, last: 25 }, lastRefreshedAt: '2026-08-27',
  routes: [r('1', 1, 4, 5, 6), r('2', 1, 20), r('5', 3, 12, 10, 20), r('6', 3, 30), r('7', 3, null)],
};

describe('agency page text', () => {
  it('uses the agreed title and H1', () => {
    expect(agencyPageTitle(TTC)).toBe('TTC (Toronto) frequency map: frequent routes and service levels | Transit Atlas');
    expect(agencyPageH1(TTC)).toBe('TTC (Toronto) frequent service map');
  });

  it('writes a standalone lead sentence from the route numbers', () => {
    expect(agencyLeadSentence(TTC)).toBe('2 of 5 routes run every 15 min or better on a weekday midday.');
    expect(agencyPageDescription(TTC)).toContain('2 of 5 routes');
  });

  it('counts stats from the published headways', () => {
    const s = agencyStats(TTC);
    expect([s.totalRoutes, s.frequentMidday, s.frequentAm, s.frequentPm, s.frequentShare]).toEqual([5, 2, 2, 1, 40]);
    expect(s.byMode.map(m => [m.label, m.routes.length])).toEqual([['Subway', 2], ['Bus', 3]]);
  });

  it('describes the service span in clock hours', () => {
    expect(agencySpanText(TTC)).toBe('5am to 2am');
    expect(agencySpanText({ span: null })).toBeNull();
  });

  it('links to the map with only this agency on and the agency area in view', () => {
    const href = agencyMapHref(TTC);
    const q = new URLSearchParams(href.slice(2));
    expect(href.startsWith('/?')).toBe(true);
    expect(q.get('agencies')).toBe('ttc');
    expect(q.get('lat')).toBe('43.7187');
    expect(Number(q.get('z'))).toBeGreaterThanOrEqual(7);
  });

  it('formats the data date', () => {
    expect(formatDataDate('2026-10-12')).toBe('Oct 12, 2026');
    expect(formatDataDate('20261012')).toBe('Oct 12, 2026');
    expect(formatDataDate(null)).toBeNull();
  });
});

describe('breadcrumbs and nearby agencies', () => {
  it('runs Atlas, country, region, primary city, agency', () => {
    expect(agencyBreadcrumbs(TTC).map(c => c.name)).toEqual(['Transit Atlas', 'Canada', 'Ontario', 'Toronto', 'TTC (Toronto)']);
    expect(agencyBreadcrumbs({ ...TTC, city: 'Ontario' }).map(c => c.name)).toEqual(['Transit Atlas', 'Canada', 'Ontario', 'TTC (Toronto)']);
  });

  it('lists same-region agencies nearest first, never itself or another region', () => {
    const mk = (slug: string, region: string, lat: number): AgencyPageSummary => ({ ...TTC, slug, displayName: slug, region, center: [lat, -79.4] });
    const all = [TTC, mk('near', 'Ontario', 43.8), mk('far', 'Ontario', 45), mk('other', 'Quebec', 43.72)];
    expect(nearbyAgencies(TTC, all).map(a => a.slug)).toEqual(['near', 'far']);
  });
});

describe('head and structured data', () => {
  it('has a self-referencing canonical and noindex outside public', () => {
    const beta = resolveAgencySeo(TTC, { mode: 'beta' });
    expect(beta.canonicalUrl).toBe('https://www.transitatlas.fyi/agency/ttc');
    expect(beta.noindex).toBe(true);
    expect(beta.title.startsWith('[Beta] ')).toBe(true);
    expect(resolveAgencySeo(TTC, { mode: 'public' }).noindex).toBe(false);
    expect(agencyPagePath('ttc')).toBe('/agency/ttc');
  });

  it('emits Organization, BreadcrumbList and Dataset, and no FAQ', () => {
    const ld = agencyPageJsonLd(TTC, 'https://www.transitatlas.fyi/agency/ttc', 'https://www.transitatlas.fyi') as { '@graph': Array<Record<string, unknown>> };
    expect(ld['@graph'].map(n => n['@type'])).toEqual(['Organization', 'BreadcrumbList', 'Dataset']);
    expect(ld['@graph'][0].sameAs).toEqual(['https://www.ttc.ca']);
    expect(ld['@graph'][0].areaServed).toEqual({ '@type': 'Place', name: 'Toronto, Ontario, Canada' });
    expect(ld['@graph'][2].dateModified).toBe('2026-08-27');
    expect(JSON.stringify(ld)).not.toContain('FAQ');
  });
});

describe('committed summary data', () => {
  it('has a page for each listed agency, each with every field the page needs', () => {
    const all = agencyPageSummaries();
    expect(all.length).toBeGreaterThan(0);
    for (const a of all) {
      expect(a.displayName, a.slug).toBeTruthy();
      expect(a.city, a.slug).toBeTruthy();
      expect(a.routes.length, a.slug).toBe(a.routeCount);
      expect(getAgencyPageSummary(a.slug)).toBe(a);
    }
  });
});

describe('trimRedundantCity', () => {
  it('drops a bracket the name already holds and keeps a useful one', () => {
    expect(trimRedundantCity('Halifax Transit (Halifax)')).toBe('Halifax Transit');
    expect(trimRedundantCity('ABQ RIDE (Albuquerque)')).toBe('ABQ RIDE (Albuquerque)');
    expect(trimRedundantCity('Barrie Transit')).toBe('Barrie Transit');
  });
});
