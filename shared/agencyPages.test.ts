import { describe, expect, it } from 'vitest';
import {
  agencyAboutParagraph, agencySpanShort, agencyBreadcrumbs, agencyDatesText, agencyLeadSentence, agencyMapHref, agencyPageDescription, agencyPageH1, agencyPageJsonLd,
  agencyPagePath, agencyPageTitle, agencySpanText, agencyStats, formatDataDate, nearbyAgencies, resolveAgencySeo, trimRedundantCity,
  type AgencyPageRoute, type AgencyPageSummary, bestRoute, modesText, routesWithin, typicalWait, weekendLabel,
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
    expect(agencyPageH1(TTC)).toBe('TTC · Toronto');
    expect(agencyPageH1({ displayName: 'Halifax Transit' })).toBe('Halifax Transit');
  });

  it('writes a standalone lead sentence from the route numbers', () => {
    expect(agencyLeadSentence(TTC)).toBe('2 of 5 routes run every 15 min or better on a weekday midday.');
    expect(agencyPageDescription(TTC)).toContain('2 of 5 routes');
    expect(agencyLeadSentence(TTC)).not.toMatch(/frequent/i);
  });

  it('counts routes within each standard on the toggle', () => {
    const s = agencyStats(TTC);
    expect([s.totalRoutes, s.within]).toEqual([5, 2]);
    expect(agencyStats(TTC, 10).within).toBe(1);
    expect(agencyStats(TTC, 30).within).toBe(4);
    expect(agencyStats(TTC, 3).within).toBe(0);
    expect(routesWithin([], 15)).toBe(0);
    expect(s.byMode.map(m => [m.label, m.routes.length])).toEqual([['Subway', 2], ['Bus', 3]]);
  });

  it('derives the typical wait as the median midday headway', () => {
    expect(typicalWait(TTC.routes)).toBe(16); // 4, 12, 20, 30: the middle two average to 16
    expect(typicalWait([r('a', 3, 10), r('b', 3, 20), r('c', 3, 40)])).toBe(20);
    expect(typicalWait([r('a', 3, 10), r('b', 3, 15)])).toBe(13); // 12.5 rounds to 13
    expect(typicalWait([r('a', 3, null)])).toBeNull();
    expect(typicalWait([])).toBeNull();
  });

  it('picks the route with the shortest midday headway, ignoring missing values', () => {
    expect(bestRoute(TTC.routes)?.route.name).toBe('1');
    expect(bestRoute(TTC.routes)?.headway).toBe(4);
    expect(bestRoute([r('x', 3, null)])).toBeNull();
    expect(bestRoute([r('x', 3, 8), r('y', 3, 8)])?.route.name).toBe('x');
  });

  it('writes the modes line and the weekend label', () => {
    expect(modesText([{ label: 'Subway', routes: 3 }, { label: 'Light rail', routes: 2 }, { label: 'Bus', routes: 209 }])).toBe('3 subway · 2 light rail · 209 bus');
    expect(modesText([])).toBe('');
    expect(weekendLabel(true, true)).toBe('Runs Sat & Sun');
    expect(weekendLabel(true, false)).toBe('Runs Saturdays');
    expect(weekendLabel(false, true)).toBe('Runs Sundays');
    expect(weekendLabel(false, false)).toBe('Weekdays only');
    expect(weekendLabel(undefined, undefined)).toBeNull();
  });

  it('describes the service span in clock hours', () => {
    expect(agencySpanText({ span: { first: 5, last: 25 } })).toBe('5am to 2am');
    expect(agencySpanText({ span: { first: 5, last: 28 } })).toBe('Runs 24 hours');
    expect(agencySpanText({ span: null })).toBeNull();
    expect(agencySpanShort({ span: { first: 5, last: 28 } })).toBe('24 h');
    expect(agencySpanShort({ span: { first: 5, last: 25 } })).toBe('5am–2am');
    expect(agencySpanShort({ span: null })).toBeNull();
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

describe('dates', () => {
  it('names each date for what it is', () => {
    expect(agencyDatesText({ lastRefreshedAt: '2026-08-27', validThrough: '20261031' }, '2026-10-13T06:34:30.913Z'))
      .toBe('Schedule refreshed Aug 27, 2026, valid through Oct 31, 2026. Atlas data release Oct 13, 2026.');
    expect(agencyDatesText({ lastRefreshedAt: null, validThrough: null }, null)).toBe('.');
  });
});

describe('agencyAboutParagraph', () => {
  const base = { displayName: 'TTC (Toronto)', city: 'Toronto', span: { first: 5, last: 25 } };
  const rs = (...mids: Array<[number, number | null]>) => mids.map(([mode, h], i) => r(`R${i}`, mode, h));

  it('uses one template: routes, midday count, the mode most of them are, the span', () => {
    expect(agencyAboutParagraph({ ...base, routes: rs([3, 10], [3, 12], [1, 5], [3, 40], [3, null]) })).toBe(
      'TTC runs 5 routes in Toronto. At weekday midday, 3 run every 15 min or better. Most of those are bus routes. Across all routes, weekday service runs from 5am to 2am.');
  });

  it('only names a mode when it is more than half of the frequent routes', () => {
    expect(agencyAboutParagraph({ ...base, routes: rs([3, 10], [1, 12], [3, 40]) })).not.toContain('Most of those');
  });

  it('handles all, none, one and zero', () => {
    expect(agencyAboutParagraph({ ...base, routes: rs([3, 10], [3, 12]) })).toContain('At weekday midday, all run every 15 min or better.');
    expect(agencyAboutParagraph({ ...base, routes: rs([3, 30], [3, null]) })).toContain('At weekday midday, none run every 15 min or better.');
    expect(agencyAboutParagraph({ ...base, routes: rs([3, 10], [3, 30]) })).toContain('At weekday midday, 1 runs every 15 min or better.');
    expect(agencyAboutParagraph({ ...base, routes: rs([3, 10]) })).toContain('runs 1 route in Toronto. At weekday midday, it runs every 15 min or better.');
    expect(agencyAboutParagraph({ ...base, routes: rs([3, 30]) })).toContain('it does not run every 15 min or better');
    expect(agencyAboutParagraph({ ...base, routes: [], span: null })).toBe('TTC has no weekday routes in the data.');
  });

  it('says 24 hours when the span wraps the day, and drops the span when unknown', () => {
    expect(agencyAboutParagraph({ ...base, span: { first: 5, last: 28 }, routes: rs([3, 30]) })).toContain('covers all 24 hours of the day.');
    expect(agencyAboutParagraph({ ...base, span: null, routes: rs([3, 30]) })).not.toContain('Across all routes');
  });
});
