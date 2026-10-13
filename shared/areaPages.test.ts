import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { AgencyPageRoute, AgencyPageSummary } from './agencyPages';
import {
  areaAboutParagraph, areaDatesText, areaHoursLabel, areaMapHref, areaPageDescription, areaPageH1, areaPageJsonLd, areaPageTitle,
  areaSpanShort, areaSubtitle, buildAreaPageData, resolveAreaSeo, type AreaPageData,
} from './areaPages';
import { rankLargeMetros, parseCsv } from './largeMetros';
import { areaLinkFor } from './agencyArea';
import { MERGED_AREAS, isLargeMetro, areaSlug, mainCities, type AreaConfig } from './areas';

const r = (name: string, mode: number, midday: number | null, am = midday, pm = midday): AgencyPageRoute => ({ name, longName: null, mode, midday, am, pm, evening: null, overnight: null });
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
    expect(d.totalRoutes).toBe(6);
    expect(d.bands).toEqual([2, 1, 1, 1, 0, 0, 1]); // 4 and 10, 12, 20, 30, none
    expect(d.agencies[0]).toMatchObject({ slug: 'ttc', totalRoutes: 4, modes: { Subway: 2, Bus: 2 } });
    expect(d.byMode).toEqual([{ label: 'Subway', routes: 2 }, { label: 'Bus', routes: 4 }]);
    expect(d.modeColumns).toEqual(['Subway', 'Bus']);
    expect(d.span).toEqual({ first: 5, last: 28 });
    expect(d.newestRefresh).toBe('2026-09-01');
  });

  it('takes the quickest route across the whole area', () => {
    expect(d.best).toEqual({ name: '1', headway: 4, agency: 'TTC (Toronto)' });
    const none = buildAreaPageData({ ...AREA, agencies: ['hsr'] }, new Map([['hsr', ag('hsr', 'HSR', [r('A', 3, null), r('B', 3, 20)])]]), null);
    expect(none.best?.headway).toBe(20);
  });

  it('flags a wide span and mixed weekend service', () => {
    expect(d.spanVaries).toBe(true); // ends at 24 and 28: four hours apart
    const tight = new Map(ALL); tight.set('hsr', ag('hsr', 'HSR', [r('A', 3, 12)], { first: 5, last: 25 }));
    const t = buildAreaPageData(AREA, tight, null);
    expect(t.spanVaries).toBe(false); // starts 6 and 5, ends 24 and 25
    expect(areaHoursLabel(t)).toBe('weekday service');
    const wide = new Map(ALL); wide.set('hsr', ag('hsr', 'HSR', [r('A', 3, 12)], { first: 9, last: 20 }));
    const w = buildAreaPageData(AREA, wide, null);
    expect(w.spanVaries).toBe(true);
    expect(areaHoursLabel(w)).toContain('varies by agency');
    const mixed = new Map(ALL); mixed.set('ttc', { ...ALL.get('ttc')!, sat: true, sun: true }); mixed.set('hsr', { ...ALL.get('hsr')!, sat: true, sun: false });
    expect(buildAreaPageData(AREA, mixed, null).weekend).toBe('varies');
    const both = new Map(ALL); both.set('ttc', { ...ALL.get('ttc')!, sat: true, sun: true }); both.set('hsr', { ...ALL.get('hsr')!, sat: true, sun: true });
    const b2 = buildAreaPageData(AREA, both, null);
    expect(b2.weekend).toBe('both');
    expect(areaHoursLabel(b2)).toBe('weekday service · varies by agency · Runs Sat & Sun');
    expect(d.weekend).toBeNull();
  });

  it('writes the title, heading, subtitle and lead from the numbers', () => {
    expect(areaPageTitle(d)).toBe('Greater Toronto and Hamilton Area frequency map: 2 transit agencies compared | Transit Atlas');
    expect(areaPageH1(d)).toBe('Greater Toronto and Hamilton Area');
    expect(areaSubtitle(d)).toBe('Toronto, Hamilton');
    expect(areaPageDescription(d)).toContain('6 weekday routes across 2 transit agencies in the Greater Toronto and Hamilton Area');
    expect(areaPageDescription(d)).not.toMatch(/frequent\b|15 min/i);
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

  it('is one sentence with the agency and route counts', () => {
    expect(areaAboutParagraph(base({}))).toBe('The Greater Toronto and Hamilton Area has 2 transit agencies running 6 routes (2 subway, 4 bus).');
    const one = base({ agencies: [{ slug: 'a', displayName: 'A', totalRoutes: 1, modes: { Bus: 1 } }], totalRoutes: 1, byMode: [{ label: 'Bus', routes: 1 }] });
    expect(areaAboutParagraph(one)).toBe('The Greater Toronto and Hamilton Area has 1 transit agency running 1 route.');
  });
});

describe('naming', () => {
  it('tells a large metro from a same-named small one, by official name', () => {
    expect(isLargeMetro({ country: 'United States', officialName: 'Columbus, OH' })).toBe(true);
    expect(isLargeMetro({ country: 'United States', officialName: 'Columbus, GA-AL' })).toBe(false);
    expect(isLargeMetro({ country: 'United States', officialName: 'Portland-South Portland, ME' })).toBe(false);
    expect(isLargeMetro({ country: 'United States', officialName: 'Portland-Vancouver-Hillsboro, OR-WA' })).toBe(true);
    expect(isLargeMetro({ country: 'Canada', officialName: "Ottawa - Gatineau (Ontario part / partie de l'Ontario)" })).toBe(true);
    expect(isLargeMetro({ country: 'Canada', officialName: 'Toronto + Hamilton + Oshawa' })).toBe(true);
    expect(isLargeMetro({ country: 'Canada', officialName: 'London' })).toBe(false);
  });

  it('ranks the committed population files: 50 US MSAs and 10 CMAs, largest first', () => {
    const list = rankLargeMetros(readFileSync('shared/data/metro-population/us-cbsa-population-2024.csv', 'utf8'), readFileSync('shared/data/metro-population/ca-cma-population-2021.csv', 'utf8'));
    expect(list.filter(m => m.country === 'United States')).toHaveLength(50);
    expect(list.filter(m => m.country === 'Canada').map(m => m.name).slice(0, 3)).toEqual(['Toronto', 'Montréal', 'Vancouver']);
    expect(JSON.parse(readFileSync('shared/data/large-metros.json', 'utf8'))).toEqual(list);
    expect(parseCsv('a,b\n"x,y",2\n')).toEqual([{ a: 'x,y', b: '2' }]);
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

  it('places an agency in at most one area, only real ones, and never both placed and unassigned', () => {
    const seen = new Map<string, string>();
    for (const a of areas) for (const s of a.agencies) {
      expect(existsSync(`config/agencies/${s}.json`), `${s} has no agency config`).toBe(true);
      expect(seen.has(s), `${s} is in ${seen.get(s)} and ${a.slug}`).toBe(false);
      seen.set(s, a.slug);
    }
    // Agencies added, hidden or removed after the last `npx tsx scripts/build-areas.ts` are simply not placed yet.
    for (const s of unassigned) expect(seen.has(s), s).toBe(false);
  });

  it('pages only for metros with 2+ agencies, or one agency in a large metro', () => {
    for (const a of areas) {
      if (a.type === 'MicroSA' || a.type === 'CA') expect(a.page, a.slug).toBe(false);
      if (a.page && a.agencies.length < 2) expect(isLargeMetro(a), a.slug).toBe(true);
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

describe('areaLinkFor', () => {
  const map: Record<string, [string, string]> = { ttc: ['toronto', 'Toronto'] };
  it('links only agencies in a paged area, and only with the flag on', () => {
    expect(areaLinkFor('ttc', true, map)).toEqual({ href: '/area/toronto', label: 'Greater Toronto and Hamilton Area →' });
    expect(areaLinkFor('ttc', false, map)).toBeNull();
    expect(areaLinkFor('nowhere', true, map)).toBeNull();
  });

  it('is built from paged areas only', () => {
    const committed = JSON.parse(readFileSync('shared/data/agency-area-slugs.json', 'utf8')) as Record<string, [string, string]>;
    const paged = new Map(areasOnDisk().filter(a => a.page).flatMap(a => a.agencies.map(s => [s, a.slug] as const)));
    for (const [agency, [slug]] of Object.entries(committed)) expect(paged.get(agency), agency).toBe(slug);
    expect(Object.keys(committed).length).toBe(paged.size);
  });
});

function areasOnDisk(): AreaConfig[] {
  return readdirSync('config/areas').filter(f => f.endsWith('.json') && !f.startsWith('_'))
    .map(f => JSON.parse(readFileSync(`config/areas/${f}`, 'utf8')) as AreaConfig);
}

describe('areaRegionName', () => {
  it('uses the common region name where there is one, else "the [City] area"', async () => {
    const { areaRegionName, areaRegionTitle, areaRegionSentenceStart } = await import('./areaRegions');
    expect(areaRegionName({ slug: 'toronto', name: 'Toronto' })).toBe('the Greater Toronto and Hamilton Area');
    expect(areaRegionName({ slug: 'vancouver', name: 'Vancouver' })).toBe('Metro Vancouver');
    expect(areaRegionName({ slug: 'calgary', name: 'Calgary' })).toBe('the Calgary area');
    expect(areaRegionTitle({ slug: 'san-francisco', name: 'San Francisco' })).toBe('Bay Area');
    expect(areaRegionSentenceStart({ slug: 'calgary', name: 'Calgary' })).toBe('The Calgary area');
  });
});
