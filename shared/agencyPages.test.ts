import { describe, expect, it } from 'vitest';
import {
  agencyIntroSentence, introName, agencySpansArea, namesList, agencySpanShort, agencyBreadcrumbs, agencyDatesText, agencyLeadSentence, agencyMapHref, agencyPageDescription, agencyPageH1, agencyPageJsonLd,
  agencyPageData, agencyPagePath, agencyPageTitle, agencySpanText, agencyStats, bandCounts, formatDataDate, nearbyAgencies, resolveAgencySeo, trimRedundantCity,
  type AgencyPageRoute, type AgencyPageSummary, bestRoute, modesText, weekendLabel,
} from './agencyPages';
import { agencyPageSummaries, getAgencyPageSummary } from './agencyPagesData';

const r = (name: string, mode: number, midday: number | null, am = midday, pm = midday): AgencyPageRoute => ({ name, longName: `${name} St`, mode, midday, am, pm, evening: null, overnight: null });

const TTC: AgencyPageSummary = {
  slug: 'ttc', name: 'Toronto Transit Commission', displayName: 'TTC (Toronto)', city: 'Toronto', region: 'Ontario', country: 'Canada',
  center: [43.7187, -79.4077], bbox: [43.25, -79.88, 44.05, -78.88], websiteUrl: 'https://www.ttc.ca',
  routeCount: 5, span: { first: 5, last: 25 }, lastRefreshedAt: '2026-08-27',
  routes: [r('1', 1, 4, 5, 6), r('2', 1, 20), r('5', 3, 12, 10, 20), r('6', 3, 30), r('7', 3, null)],
};

describe('agency page text', () => {
  it('uses the agreed title and H1', () => {
    expect(agencyPageTitle(TTC)).toBe('TTC frequency: how often routes run | Transit Atlas');
    expect(agencyPageH1(TTC)).toBe('Toronto Transit Commission');
    expect(agencyPageH1({ name: 'Hamilton Street Railway', city: 'Hamilton' })).toBe('Hamilton Street Railway');
    expect(agencyPageH1({ name: 'University of Michigan Transit Services (Ann Arbor)', city: 'Ann Arbor' })).toBe('University of Michigan Transit Services');
    expect(agencyPageH1({ name: 'GO Transit', city: 'Toronto' })).toBe('GO Transit');
  });

  it('writes a standalone lead sentence from the route numbers', () => {
    expect(agencyLeadSentence(TTC)).toBe('5 weekday routes.');
    expect(agencyPageDescription(TTC)).toContain('5 weekday routes');
    expect(agencyLeadSentence(TTC)).not.toMatch(/frequent|15 min/i);
  });

  it('counts routes and groups them by mode', () => {
    const s = agencyStats(TTC);
    expect(s.totalRoutes).toBe(5);
    expect(s.byMode.map(m => [m.label, m.routes.length])).toEqual([['Subway', 2], ['Bus', 3]]);
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
    const lead = "Based on the agency's published timetable, not live arrivals.";
    expect(agencyDatesText({ lastRefreshedAt: '2026-08-27', validThrough: '20261031' }, '2026-10-13T06:34:30.913Z'))
      .toBe(`${lead} This timetable was published Aug 27, 2026 and covers service until Oct 31, 2026. Atlas last updated this page Oct 13, 2026.`);
    expect(agencyDatesText({ lastRefreshedAt: null, validThrough: null }, null)).toBe(lead);
    expect(agencyDatesText({ lastRefreshedAt: '2026-08-27', validThrough: null }, '2026-10-13')).toBe(`${lead} This timetable was published Aug 27, 2026. Atlas last updated this page Oct 13, 2026.`);
    expect(agencyDatesText({ lastRefreshedAt: null, validThrough: '20261031' }, null)).toBe(`${lead} This timetable covers service until Oct 31, 2026.`);
  });

  it('says plainly when the timetable has ended', () => {
    expect(agencyDatesText({ lastRefreshedAt: '2026-01-05', validThrough: '20260901' }, '2026-10-13T00:00:00Z'))
      .toBe("Based on the agency's published timetable, not live arrivals. This timetable ended on Sep 1, 2026; the agency hasn't published a newer one yet. Atlas last updated this page Oct 13, 2026.");
  });

  it('drops a trailing city from the agency name only when the sentence names that place', () => {
    expect(introName('University of Michigan Transit Services (Ann Arbor)', 'Ann Arbor')).toBe('University of Michigan Transit Services');
    expect(introName('University of Michigan Transit Services (Ann Arbor)', 'the Greater Toronto and Hamilton Area')).toBe('University of Michigan Transit Services (Ann Arbor)');
    expect(introName('Alameda-Contra Costa Transit District (AC Transit)', 'Berkeley')).toBe('Alameda-Contra Costa Transit District (AC Transit)');
    expect(introName('ABQ RIDE (Albuquerque)', 'Albuquerque')).toBe('ABQ RIDE');
    expect(introName('Toronto Transit Commission', 'Toronto')).toBe('Toronto Transit Commission');
  });
});

describe('agencyIntroSentence', () => {
  const base = { name: 'Hamilton Street Railway', city: 'Hamilton', stops: 1980 };
  const rs = (...mids: Array<[number, number | null]>) => mids.map(([mode, h], i) => r(`R${i}`, mode, h));
  const conns = (...names: string[]) => names.map(name => ({ name }));

  it('names routes, place, stops and the first three connections', () => {
    expect(agencyIntroSentence({ ...base, routes: rs([3, 10], [3, 12]) }, 'Hamilton', conns('GO Transit', 'Burlington Transit')))
      .toBe('Hamilton Street Railway operates 2 routes in Hamilton with 1,980 stops and connects with GO Transit and Burlington Transit.');
    expect(agencyIntroSentence({ ...base, routes: rs([3, 10]) }, 'Hamilton', conns('A', 'B', 'C', 'D', 'E')))
      .toBe('Hamilton Street Railway operates 1 route in Hamilton with 1,980 stops and connects with A, B, C and 2 others.');
    expect(agencyIntroSentence({ ...base, routes: rs([3, 10]) }, 'Hamilton', conns('A', 'B', 'C', 'D'))).toContain('A, B, C and 1 other.');
  });

  it('adds the mode split only with more than one mode', () => {
    const modes = [{ label: 'Subway', routes: 3 }, { label: 'Light rail', routes: 2 }, { label: 'Bus', routes: 209 }];
    expect(agencyIntroSentence({ ...base, routes: rs([3, 10]) }, 'Toronto', [], modes)).toBe('Hamilton Street Railway operates 1 route (3 subway, 2 light rail, 209 bus) in Toronto with 1,980 stops.');
    expect(agencyIntroSentence({ ...base, routes: rs([3, 10]) }, 'Toronto', [], [{ label: 'Bus', routes: 1 }])).not.toContain('(');
  });

  it('drops the connects-with clause and the stops when there are none', () => {
    expect(agencyIntroSentence({ ...base, routes: rs([3, 10]) }, 'Hamilton')).toBe('Hamilton Street Railway operates 1 route in Hamilton with 1,980 stops.');
    expect(agencyIntroSentence({ ...base, stops: undefined, routes: rs([3, 10]) }, 'the Bay Area')).toBe('Hamilton Street Railway operates 1 route in the Bay Area.');
    expect(agencyIntroSentence({ ...base, routes: [] }, 'Hamilton')).toBe('Hamilton Street Railway has no weekday routes in the data.');
  });

  it('lists names', () => {
    expect(namesList(['A'])).toBe('A');
    expect(namesList(['A', 'B', 'C'])).toBe('A, B and C');
  });

  it('uses the area name when the agency covers most of the area', () => {
    const area: [number, number, number, number] = [43, -80, 44.5, -78.4];
    expect(agencySpansArea([43.1, -80.2, 44.4, -78.5], area)).toBe(true);
    expect(agencySpansArea([43.5, -79.6, 43.9, -79.1], area)).toBe(false);
    expect(agencySpansArea(undefined, area)).toBe(false);
  });
});

describe('agency summary pieces', () => {
  it('puts each route in one weekday-midday frequency band', () => {
    expect(bandCounts([{ midday: 10 }, { midday: 12 }, { midday: 15 }, { midday: 20 }, { midday: 30 }, { midday: 45 }, { midday: 90 }, { midday: null }])).toEqual([1, 2, 1, 1, 1, 1, 1]);
    expect(bandCounts([])).toEqual([0, 0, 0, 0, 0, 0, 0]);
  });
});

describe('beta-only agencies', () => {
  it('keeps a beta-only connection only on beta-capable builds', async () => {
    const { BETA_BUILD } = await import('./config');
    const a = { ...TTC, connections: [{ slug: 'metz', name: 'Le Met', routes: ['1'], betaOnly: true as const }, { slug: 'hsr', name: 'HSR', routes: ['2'] }] };
    const names = agencyPageData(a, [a], null).connections.map(c => c.slug);
    expect(names).toEqual(BETA_BUILD ? ['metz', 'hsr'] : ['hsr']);
  });
});
