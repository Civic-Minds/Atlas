import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { AgencyPageRoute, AgencyPageSummary } from './agencyPages';
import {
  areaAboutParagraph, areaDatesText, areaMapHref, areaPageDescription, areaPageH1, areaPageJsonLd, areaPageTitle,
  areaSpanShort, areaSubtitle, buildAreaPageData, resolveAreaSeo, type AreaPageData,
} from './areaPages';
import { MERGED_AREAS, isLargeMetro, areaSlug, mainCities, type AreaConfig } from './areas';

const r = (name: string, mode: number, midday: number | null, am = midday, pm = midday): AgencyPageRoute => ({ name, longName: null, mode, midday, am, pm });
const ag = (slug: string, displayName: string, routes: AgencyPageRoute[], span = { first: 6, last: 24 }): AgencyPageSummary => ({
  slug, name: displayName, displayName, city: 'X', routeCount: routes.length, routes, span, lastRefreshedAt: '2026-09-01',
});
const AREA: AreaConfig = {
  slug: 'toronto', name: 'Toronto', type: 'CMA', officialName: 'Toronto + Hamilton', country: 'Canada', cities: ['Toronto', 'Hamilton'],
  bbox: [43, -80, 44.6, -78.4], center: [43.8, -79.2], largeMetro: true, page: true, agencies: ['ttc', 'hsr', 'gone'], note: 'Merged.',
};
const ALL = new Map([
  ag('ttc', 'TTC (Toronto)', [r('1', 1, 4), r('2', 1, 20), r('5', 3, 10), r('6', 3, null)]),
  ag('hsr', 'HSR', [r('A', 3, 12), r('B', 3, 30)], { first: 5, last: 28 }),
].map(a => [a.slug, a] as const));

describe('buildAreaPageData', () => {
  const d = buildAreaPageData(AREA, ALL, '2026-10-13T00:00:00Z');

  it('adds up the per-agency numbers and skips agencies with no page', () => {
    expect(d.agencies.map(a => a.slug)).toEqual(['ttc', 'hsr']);
    expect([d.totalRoutes, d.frequentMidday, d.frequentAm, d.frequentPm]).toEqual([6, 3, 3, 3]);
    expect(d.byMode).toEqual([{ label: 'Subway', routes: 2 }, { label: 'Bus', routes: 4 }]);
    expect(d.span).toEqual({ first: 5, last: 28 });
    expect(d.newestRefresh).toBe('2026-09-01');
  });

  it('writes the title, heading, subtitle and lead from the numbers', () => {
    expect(areaPageTitle(d)).toBe('Toronto area frequency map: 2 transit agencies compared | Transit Atlas');
    expect(areaPageH1(d)).toBe('Toronto area');
    expect(areaSubtitle(d)).toBe('Toronto, Hamilton');
    expect(areaPageDescription(d)).toContain('3 of 6 routes across 2 transit agencies in the Toronto area run every 15 min or better');
    expect(areaSpanShort(d)).toBe('24 h');
  });

  it('opens the map framed on the area with only its agencies on', () => {
    const q = new URLSearchParams(areaMapHref(d).slice(2));
    expect(q.get('agencies')).toBe('ttc.hsr');
    expect(q.get('lat')).toBe('43.8000');
    expect(Number(q.get('z'))).toBeGreaterThanOrEqual(7);
  });

  it('has a canonical, noindex outside public, and BreadcrumbList plus Dataset JSON-LD', () => {
    const seo = resolveAreaSeo(d, { mode: 'beta' });
    expect(seo.canonicalUrl).toBe('https://www.transitatlas.fyi/area/toronto');
    expect(seo.noindex).toBe(true);
    const ld = areaPageJsonLd(d, seo.canonicalUrl, 'https://www.transitatlas.fyi') as { '@graph': Array<Record<string, unknown>> };
    expect(ld['@graph'].map(n => n['@type'])).toEqual(['BreadcrumbList', 'Dataset']);
    expect(ld['@graph'][1].dateModified).toBe('2026-09-01');
  });

  it('names the dates', () => {
    expect(areaDatesText(d)).toBe('Newest schedule refresh Sep 1, 2026. Atlas data release Oct 13, 2026.');
  });
});

describe('areaAboutParagraph', () => {
  const base = (over: Partial<AreaPageData>): AreaPageData => ({
    ...buildAreaPageData(AREA, ALL, null), ...over,
  });

  it('uses one template with the busiest agency', () => {
    expect(areaAboutParagraph(base({}))).toBe('The Toronto area has 2 transit agencies running 6 routes. At weekday midday, 3 run every 15 min or better. TTC (Toronto) has the most, with 2.');
  });

  it('handles singular, none and all', () => {
    const one = base({ agencies: [{ slug: 'a', displayName: 'A', totalRoutes: 1, frequentMidday: 1 }], totalRoutes: 1, frequentMidday: 1 });
    expect(areaAboutParagraph(one)).toBe('The Toronto area has 1 transit agency running 1 route. At weekday midday, 1 runs every 15 min or better.');
    expect(areaAboutParagraph(base({ frequentMidday: 0 }))).toContain('none run every 15 min or better.');
    expect(areaAboutParagraph(base({ frequentMidday: 6 }))).toContain('all run every 15 min or better.');
  });
});

describe('naming', () => {
  it('tells a large metro from a same-named small one', () => {
    expect(isLargeMetro('Columbus', 'Columbus, OH')).toBe(true);
    expect(isLargeMetro('Columbus', 'Columbus, GA-AL')).toBe(false);
    expect(isLargeMetro('Portland', 'Portland-South Portland, ME')).toBe(false);
    expect(isLargeMetro('Portland', 'Portland-Vancouver-Hillsboro, OR-WA')).toBe(true);
  });

  it('reads main cities from official names and makes slugs', () => {
    expect(mainCities('Boston-Cambridge-Newton, MA-NH')).toEqual(['Boston', 'Cambridge', 'Newton']);
    expect(mainCities("Ottawa - Gatineau (Ontario part / partie de l'Ontario)")).toEqual(['Ottawa', 'Gatineau']);
    expect(areaSlug('Montréal')).toBe('montreal');
    expect(areaSlug('St. Louis')).toBe('st-louis');
  });
});

describe('committed areas (config/areas)', () => {
  const files = readdirSync('config/areas').filter(f => f.endsWith('.json') && !f.startsWith('_'));
  const areas = files.map(f => JSON.parse(readFileSync(`config/areas/${f}`, 'utf8')) as AreaConfig);
  const catalog = new Set((JSON.parse(readFileSync('public/data/catalog-public.json', 'utf8')).agencies as Array<{ slug: string }>).map(a => a.slug));
  const unassigned = (JSON.parse(readFileSync('config/areas/_unassigned.json', 'utf8')) as Array<{ slug: string }>).map(a => a.slug);

  it('names each file by its slug and gives every area bounds and agencies', () => {
    expect(areas.length).toBeGreaterThan(100);
    files.forEach((f, i) => expect(f).toBe(`${areas[i].slug}.json`));
    for (const a of areas) {
      expect(a.agencies.length, a.slug).toBeGreaterThan(0);
      expect(a.bbox[0], a.slug).toBeLessThan(a.bbox[2]);
      expect(a.bbox[1], a.slug).toBeLessThan(a.bbox[3]);
    }
  });

  it('places an agency in at most one area, only public ones, and never both placed and unassigned', () => {
    const seen = new Map<string, string>();
    for (const a of areas) for (const s of a.agencies) {
      expect(catalog.has(s), `${s} is not a public agency`).toBe(true);
      expect(seen.has(s), `${s} is in ${seen.get(s)} and ${a.slug}`).toBe(false);
      seen.set(s, a.slug);
    }
    // Agencies added after the last `npx tsx scripts/build-areas.ts` are simply not placed yet.
    for (const s of unassigned) expect(seen.has(s), s).toBe(false);
  });

  it('pages only for metros with 2+ agencies, or one agency in a large metro', () => {
    for (const a of areas) {
      if (a.type === 'MicroSA' || a.type === 'CA') expect(a.page, a.slug).toBe(false);
      if (a.page && a.agencies.length < 2) expect(isLargeMetro(a.name, a.officialName), a.slug).toBe(true);
    }
  });

  it('merges Hamilton into Toronto, with a note', () => {
    const toronto = areas.find(a => a.slug === 'toronto')!;
    expect(MERGED_AREAS[0].members).toContain('Hamilton');
    expect(toronto.agencies).toEqual(expect.arrayContaining(['ttc', 'hamilton', 'go']));
    expect(toronto.note).toContain('GTHA');
    expect(areas.find(a => a.slug === 'hamilton')).toBeUndefined();
  });
});
