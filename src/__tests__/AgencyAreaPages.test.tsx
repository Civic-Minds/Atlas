import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import type { ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AgencyPage from '../AgencyPage';
import AreaPage from '../AreaPage';
import RegionPage from '../RegionPage';
import { buildRegionPageData } from '../../shared/regionPages';
import { agencyBreadcrumbs, agencyPageData, type AgencyPageRoute, type AgencyPageSummary } from '../../shared/agencyPages';
import { buildAreaPageData, AREA_TABLE_OTHER } from '../../shared/areaPages';
import type { AreaConfig } from '../../shared/areas';
import { agencyPageSummaries } from '../../shared/agencyPagesData';
import { parentAgency, parentAgencyPageData } from '../../shared/parentAgencies';

const r = (name: string, mode: number, midday: number | null, extra: Partial<AgencyPageRoute> = {}): AgencyPageRoute =>
  ({ name, longName: null, mode, midday, am: midday, pm: midday, evening: midday, overnight: null, ...extra });
const TTC: AgencyPageSummary = {
  slug: 'ttc', name: 'Toronto Transit Commission', displayName: 'TTC (Toronto)', city: 'Toronto', region: 'Ontario', country: 'Canada',
  routeCount: 5, span: { first: 5, last: 28 }, lastRefreshedAt: '2026-08-27', sat: true, sun: true,
  routes: [r('1', 1, 4), r('2', 1, 20), r('5', 3, 12), r('6', 3, 30), r('301', 3, null, { am: null, pm: null, evening: null, overnight: 30 })],
};
const HSR: AgencyPageSummary = { ...TTC, slug: 'hsr', name: 'Hamilton Street Railway', displayName: 'HSR (Hamilton)', city: 'Hamilton', routes: [r('A', 3, 10), r('B', 3, 25)], routeCount: 2, sat: true, sun: false };
// A second Toronto-area agency, so the Toronto area has the two agencies a page needs (areaPageStatus).
const GO: AgencyPageSummary = { ...HSR, slug: 'go', name: 'GO Transit', displayName: 'GO Transit', city: 'Toronto' };
const AREA: AreaConfig = {
  slug: 'toronto', name: 'Toronto', type: 'CMA', officialName: 'Toronto', country: 'Canada', cities: ['Toronto'], bbox: [43, -80, 44, -79], center: [43.5, -79.5],
  largeMetro: true, page: true, agencies: ['ttc', 'hsr'],
};

function view(ui: React.ReactElement) {
  return render(<MemoryRouter>{ui}</MemoryRouter>);
}

describe('AgencyPage', () => {
  const data = agencyPageData(TTC, [TTC, HSR, GO], '2026-10-13T00:00:00Z', { slug: 'toronto', name: 'Toronto' });

  it('names an area with one agency without a link, keeping the state link in the breadcrumb (Ryan, 2026-11-01)', () => {
    const alone = agencyPageData(TTC, [TTC, HSR], null, { slug: 'toronto', name: 'Toronto' });
    expect(alone.area).toEqual({ slug: 'toronto', name: 'Toronto', page: false });
    view(<AgencyPage data={alone} />);
    expect(screen.getByText('Greater Toronto and Hamilton Area').tagName).toBe('P');
    expect(screen.queryByRole('link', { name: 'Greater Toronto and Hamilton Area' })).toBeNull();
    expect(screen.queryByRole('heading', { name: /Nearby agencies in/ })).toBeNull();
    const crumbs = agencyBreadcrumbs(TTC, alone.area, '/region/ontario');
    expect(crumbs.find(c => c.name === 'Greater Toronto and Hamilton Area')?.href).toBeUndefined();
    expect(crumbs.find(c => c.name === 'Ontario')?.href).toBe('/region/ontario');
  });

  it('shows the full agency name in the heading, the area link, plain stats and the five period columns', () => {
    view(<AgencyPage data={data} />);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Toronto Transit Commission');
    expect(screen.getByRole('link', { name: 'Greater Toronto and Hamilton Area' }).getAttribute('href')).toBe('/area/toronto');
    expect(screen.queryByText('every 16 min')).toBeNull(); // no average wait stat
    expect(screen.getAllByText('every 4 min').length).toBeGreaterThan(0);
    expect(screen.queryByText('24 h')).toBeNull(); // service hours stat removed
    expect(screen.queryByText(/quickest route/)).toBeNull(); // quickest-route stat removed
    expect(screen.queryByText('Night only')).toBeNull();
    expect(screen.getAllByRole('columnheader').map(h => h.textContent).slice(0, 6)).toEqual(['Route', 'AM peak', 'Midday', 'PM peak', 'Evening', 'Overnight']);
    expect(screen.getAllByText('every 30 min').length).toBeGreaterThan(0);
    expect(screen.queryByText(/frequent routes|frequent service/i)).toBeNull();
  });

  it('shows the frequency band bar with counts and no fixed threshold', () => {
    view(<AgencyPage data={data} />);
    expect(screen.queryByText(/15 min or better/)).toBeNull();
    expect(screen.getByRole('button', { name: /1 route every 10 min or better/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /route every 16–20 min/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /irregularly or not at all at midday/ })).toBeTruthy();
    expect(screen.queryByRole('tooltip')).toBeNull(); // no tooltip: the legend item is highlighted instead
    const segment = screen.getByRole('button', { name: /route every 16–20 min/ });
    const other = screen.getByRole('button', { name: /1 route every 10 min or better/ });
    fireEvent.focus(segment);
    const legend16 = document.querySelector('li[data-active="true"]')!;
    expect(legend16.textContent).toContain('16–20');
    expect((other as HTMLElement).style.opacity).toBe('0.35');
    expect((segment as HTMLElement).style.opacity).toBe('1');
    fireEvent.blur(segment);
    expect(document.querySelector('li[data-active="true"]')).toBeNull();
    expect((other as HTMLElement).style.opacity).toBe('1');
    // and the other way round: hovering a legend item highlights it and fades the other segments
    const item = [...document.querySelectorAll('li')].find(li => li.textContent!.includes('16–20'))!;
    fireEvent.mouseEnter(item);
    expect(item.getAttribute('data-active')).toBe('true');
    expect((other as HTMLElement).style.opacity).toBe('0.35');
    fireEvent.mouseLeave(item);
    expect((other as HTMLElement).style.opacity).toBe('1');
    expect(screen.queryByText(/pick a standard/i)).toBeNull();
  });

  it('has one map link under the bar (Weekday midday, every route); the bar and its legend are not links', () => {
    view(<AgencyPage data={data} />);
    expect(screen.queryByRole('link', { name: /route every/ })).toBeNull();
    const link = screen.getByRole('link', { name: 'See these routes on the map' });
    const url = new URL(link.getAttribute('href')!, 'http://x');
    expect([url.pathname, url.searchParams.get('agencies'), url.searchParams.get('h'), url.searchParams.get('p'), url.searchParams.get('day')]).toEqual(['/', 'ttc', 'all', 'midday', 'Weekday']);
    expect(link.querySelector('svg')).toBeTruthy(); // the shared page-link arrow
  });

  it('hides a stat it cannot compute instead of showing a blank', () => {
    const bare = { ...TTC, span: null, routes: [r('x', 3, null)], sat: undefined, sun: undefined };
    view(<AgencyPage data={agencyPageData(bare, [bare], null)} />);
    expect(screen.queryByText('typical wait, weekday midday')).toBeNull();
    expect(screen.queryByText(/weekday service/)).toBeNull();
  });
});

describe('AgencyPage intro', () => {
  const withConns = { ...TTC, stops: 7566, connections: [
    { slug: 'hsr', name: 'HSR', routes: ['1 King'] },
    { slug: 'nopage', name: 'Tiny Transit', routes: ['A'] },
    { slug: 'c', name: 'C', routes: ['x'] },
    { slug: 'd', name: 'D', routes: ['y'] },
  ] };

  it('says it once under the title, linking connecting agencies that have a page and counting the rest', () => {
    const d = agencyPageData(withConns, [withConns, HSR], null);
    expect(d.intro).toBe('Toronto Transit Commission operates 5 routes (2 subway/metro, 3 bus) in Toronto with 7,566 stops and connects with Hamilton Street Railway, Tiny Transit, C and 1 other agency.');
    view(<AgencyPage data={d} />);
    const p = screen.getByText((_, el) => el?.tagName === 'P' && /operates 5 routes \(2 subway\/metro, 3 bus\) in Toronto with 7,566 stops/.test(el.textContent ?? ''));
    expect(p.textContent).toBe(d.intro);
    // #1283: a link names the page it opens, so a city is plain text.
    expect(screen.queryByRole('link', { name: 'Toronto' })).toBeNull();
    expect(document.body.textContent!.split('operates 5 routes (').length - 1).toBe(1);
    expect(screen.getAllByRole('link', { name: 'Hamilton Street Railway' })[0].getAttribute('href')).toBe('/agency/hsr');
    expect(screen.queryByRole('link', { name: 'Tiny Transit' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Connects with' })).toBeNull();
    expect(screen.queryByTitle(/150 m/)).toBeNull();
  });

  it('says after the intro when an agency has no regular midday service (CIV-965)', () => {
    const none = { ...HSR, routes: [r('A', 3, null), r('B', 3, null)] };
    view(<AgencyPage data={agencyPageData(none, [none, TTC], null)} />);
    expect(screen.getByText(/Its routes have no regular midday service\./)).toBeTruthy();
  });

  it('says "Irregular" where the map list does, and a dash where the route does not run (#1249)', () => {
    // CTA 1, weekday midday: the route runs, but the filter finds no regular cadence.
    const cta = { ...HSR, routes: [r('1', 3, null, { am: 10, noRegular: ['midday'] }), r('B', 3, null, { am: 10 })] };
    view(<AgencyPage data={agencyPageData(cta, [cta, TTC], null)} />);
    const rowOf = (name: string) => screen.getAllByRole('row').find(row => within(row).queryAllByRole('cell')[0]?.textContent?.includes(name) || row.firstElementChild?.textContent?.startsWith(name))!;
    const cells = (name: string) => Array.from(rowOf(name).children).map(c => c.textContent);
    expect(cells('1')[2]).toBe('Irregular');
    expect(cells('B')[2]).not.toBe('Irregular');
  });

  it('has no connects-with clause without connections', () => {
    view(<AgencyPage data={agencyPageData(TTC, [TTC, HSR], null)} />);
    expect(screen.queryByText(/connects with/)).toBeNull();
  });
});

describe('AgencyPage intro place, notes and headings', () => {
  const um = { ...TTC, slug: 'um', name: 'University of Michigan Transit Services (Toronto)', city: 'Toronto', stops: 12, websiteUrl: 'https://example.org' };

  it('never links a city to its area page (#1283) and drops the repeated city from the name', () => {
    const d = agencyPageData(um, [um, HSR], '2026-10-13T00:00:00Z', { slug: 'toronto', name: 'Toronto' });
    expect(d.intro.startsWith('University of Michigan Transit Services operates 5 routes')).toBe(true);
    view(<AgencyPage data={d} />);
    expect(screen.queryByRole('link', { name: 'Toronto' })).toBeNull();
    expect(screen.getByRole('link', { name: 'University of Michigan Transit Services' }).getAttribute('href')).toBe('https://example.org');
    expect(screen.getByText(/Agency website:/)).toBeTruthy();
    expect(screen.getByText(/Based on the agency's published schedule, not live arrivals\./)).toBeTruthy();
  });

  it('has the bar note and counts without brackets', () => {
    view(<AgencyPage data={agencyPageData(TTC, [TTC, HSR], null)} />);
    expect(screen.getByRole('link', { name: /See all agencies/ }).getAttribute('href')).toBe('/agencies');
    expect(screen.getByText("The bar splits this agency's routes by how often they run on a weekday midday. Each route is judged by its slower direction.")).toBeTruthy();
    expect(screen.queryByText(/sustained/)).toBeNull();
    const caption = screen.getAllByText(/^Subway/)[0];
    expect(caption.textContent).toBe('Subway/Metro 2');
    expect(caption.querySelector('span')?.className).toContain('font-normal');
  });
});

describe('AgencyPage other agencies list', () => {
  it('is titled by the area, links the area, and links every agency', () => {
    const withArea = agencyPageData(TTC, [TTC, HSR, GO], null, { slug: 'toronto', name: 'Toronto' }, [TTC, HSR]);
    expect(withArea.nearby.map(n => n.slug)).toEqual(['hsr']);
    view(<AgencyPage data={withArea} />);
    const heading = screen.getByRole('heading', { name: 'Nearby agencies in the Greater Toronto and Hamilton Area' });
    expect(heading.querySelector('a')?.getAttribute('href')).toBe('/area/toronto');
    expect(screen.getByRole('link', { name: 'Hamilton Street Railway' }).getAttribute('href')).toBe('/agency/hsr');
  });

  it('keeps "Nearby agencies" when there is no area page', () => {
    view(<AgencyPage data={agencyPageData(TTC, [TTC, HSR], null)} />);
    expect(screen.getByRole('heading', { name: 'Nearby agencies' })).toBeTruthy();
  });
});

describe('AreaPage narrow names column', () => {
  it('shows the short name with the full one on hover only when the "Other" column narrows the names and the full name is long', () => {
    const long = 'San Francisco Bay Area Water Emergency Transportation Authority (WETA)';
    const weta: AgencyPageSummary = { ...HSR, slug: 'weta', name: long, displayName: 'WETA (San Francisco Bay)', routes: [r('F1', 6, 20)] };
    const withOther = buildAreaPageData({ ...AREA, agencies: ['ttc', 'weta'] }, new Map([[TTC.slug, TTC], [weta.slug, weta]]), null);
    view(<AreaPage data={withOther} />);
    const link = screen.getByRole('link', { name: 'WETA (San Francisco Bay)' });
    // The title on hover is the official name, without its bracket (#1245).
    expect(link.getAttribute('title')).toBe('San Francisco Bay Area Water Emergency Transportation Authority');
    expect(within(screen.getByRole('table')).getByRole('link', { name: 'Toronto Transit Commission' }).getAttribute('title')).toBeNull();
  });

  it('keeps a full name of two lines or fewer even with the "Other" column (CIV-973: Portland, New York)', () => {
    const name = 'Westchester County Bee-Line System (BeeLine)';
    const beeline: AgencyPageSummary = { ...HSR, slug: 'beeline', name, displayName: 'BeeLine (White Plains)', routes: [r('T', 6, 20)] };
    const data = buildAreaPageData({ ...AREA, agencies: ['ttc', 'beeline'] }, new Map([[TTC.slug, TTC], [beeline.slug, beeline]]), null);
    expect(data.modeColumns).toContain(AREA_TABLE_OTHER);
    view(<AreaPage data={data} />);
    expect(screen.getByRole('link', { name: 'Westchester County Bee-Line System' }).getAttribute('title')).toBeNull();
  });

  it('draws the names at normal weight, as the column asks (CIV-973)', () => {
    view(<AreaPage data={buildAreaPageData(AREA, new Map([[TTC.slug, TTC], [HSR.slug, HSR]]), null)} />);
    expect(screen.getByRole('link', { name: 'Toronto Transit Commission' }).className).not.toMatch(/font-(black|bold)/);
  });
});

describe('AreaPage', () => {
  const data = buildAreaPageData(AREA, new Map([[TTC.slug, TTC], [HSR.slug, HSR]]), '2026-10-13T00:00:00Z');

  it('lists agencies in a table with the same mode columns as every area (CIV-973), and links each agency', () => {
    view(<AreaPage data={data} />);
    const headers = screen.getAllByRole('columnheader').map(h => h.textContent);
    expect(headers).toEqual(['Agency', 'Subway/Metro', 'Light rail', 'Streetcar', 'Commuter rail', 'Bus', 'Ferry']);
    expect(screen.getByTitle('Bus and trolleybus routes').textContent).toBe('Bus');
    const table = within(screen.getByRole('table'));
    expect(table.getByRole('link', { name: 'Toronto Transit Commission' }).getAttribute('href')).toBe('/agency/ttc');
    const ttcRow = table.getByRole('link', { name: 'Toronto Transit Commission' }).closest('tr')!;
    const hsrRow = table.getByRole('link', { name: 'Hamilton Street Railway' }).closest('tr')!;
    expect(hsrRow.textContent).toContain('–'); // no subway routes
  });

  it('names the two biggest agencies in the intro past three, each linked to its page, and none up to three (CIV-968)', () => {
    const extra = (slug: string, n: number): AgencyPageSummary => ({ ...HSR, slug, name: `Agency ${slug}`, displayName: `Agency ${slug}`, routes: Array.from({ length: n }, (_, i) => r(`${slug}${i}`, 3, 30)), routeCount: n });
    const four = new Map([[TTC.slug, TTC], [HSR.slug, HSR], ['x', extra('x', 1)], ['y', extra('y', 1)]]);
    view(<AreaPage data={buildAreaPageData({ ...AREA, agencies: ['ttc', 'hsr', 'x', 'y'] }, four, null)} />);
    const intro = screen.getByText(/transit agencies operating/);
    expect(intro.textContent).toMatch(/, including Toronto Transit Commission, Hamilton Street Railway and 2 others\.$/);
    expect(within(intro).getByRole('link', { name: 'Toronto Transit Commission' }).getAttribute('href')).toBe('/agency/ttc');
    expect(within(intro).getByRole('link', { name: 'Hamilton Street Railway' }).getAttribute('href')).toBe('/agency/hsr');
  });

  it('ends the intro after the route breakdown with three agencies or fewer (CIV-968)', () => {
    view(<AreaPage data={data} />);
    const intro = screen.getByText(/transit agencies operating/);
    expect(intro.textContent).not.toMatch(/including/);
    expect(within(intro).queryAllByRole('link')).toHaveLength(0);
  });

  it('shows the band bar and no fixed threshold', () => {
    view(<AreaPage data={data} />);
    expect(screen.queryByText(/15 min or better/)).toBeNull();
    expect(screen.getAllByRole('button', { name: /every 10 min or better/ }).length).toBeGreaterThan(0);
  });

  it('has one map link under the bar framed on the area, and "See all agencies" in the section heading row', () => {
    view(<AreaPage data={data} />);
    expect(screen.queryByRole('link', { name: /route every/ })).toBeNull();
    const url = new URL(screen.getByRole('link', { name: 'See these routes on the map' }).getAttribute('href')!, 'http://x');
    expect([url.searchParams.get('area'), url.searchParams.get('h'), url.searchParams.get('p'), url.searchParams.get('day')]).toEqual(['toronto', 'all', 'midday', 'Weekday']);
    const seeAll = screen.getByRole('link', { name: 'See all agencies' });
    expect(seeAll.parentElement).toBe(screen.getByRole('heading', { name: 'Agencies and weekday frequency' }).parentElement);
    expect(screen.queryByText(/A dash means none/)).toBeNull();
  });
});

describe('not found is never shown while loading', () => {
  // The dev server loads page data after the first render; make the tests take that path.
  beforeEach(() => { vi.stubEnv('DEV', true); });
  afterEach(() => { vi.unstubAllEnvs(); });
  const at = (path: string, element: ReactElement, route: string) =>
    render(<MemoryRouter initialEntries={[path]}><Routes><Route path={route} element={element} /></Routes></MemoryRouter>);

  it('agency page: blank first, the page once its data resolves, not-found only for a missing slug', async () => {
    const { unmount } = at('/agency/ttc', <AgencyPage />, '/agency/:slug');
    expect(screen.queryByText('No page for this agency')).toBeNull();
    await waitFor(() => expect(screen.getByRole('heading', { level: 1 })).toBeTruthy(), { timeout: 25000 });
    expect(screen.queryByText('No page for this agency')).toBeNull();
    unmount();
    at('/agency/no-such-agency', <AgencyPage />, '/agency/:slug');
    expect(screen.queryByText('No page for this agency')).toBeNull();
    await waitFor(() => expect(screen.getByText('No page for this agency')).toBeTruthy(), { timeout: 25000 });
  }, 60000);

  it('area page: blank first, not-found only for a missing slug', async () => {
    at('/area/no-such-area', <AreaPage />, '/area/:slug');
    expect(screen.queryByText('No page for this region')).toBeNull();
    await waitFor(() => expect(screen.getByText('No page for this region')).toBeTruthy(), { timeout: 25000 });
  }, 60000);
});

describe('AgencyPage "See all agencies"', () => {
  it('sits in the Nearby agencies heading row when there are nearby agencies, and once only', () => {
    const data = agencyPageData(TTC, [TTC, HSR], '2026-10-13T00:00:00Z', { slug: 'toronto', name: 'Toronto' });
    view(<AgencyPage data={data} />);
    const links = screen.getAllByRole('link', { name: 'See all agencies' });
    expect(links).toHaveLength(1);
    expect(links[0].parentElement).toBe(screen.getByRole('heading', { name: /Nearby agencies/ }).parentElement);
  });

  it('still has the link when there are no nearby agencies', () => {
    view(<AgencyPage data={agencyPageData(TTC, [TTC], '2026-10-13T00:00:00Z')} />);
    expect(screen.queryByRole('heading', { name: /Nearby agencies/ })).toBeNull();
    expect(screen.getAllByRole('link', { name: 'See all agencies' })).toHaveLength(1);
  });
});

describe('RegionPage (CIV-976)', () => {
  const data = buildRegionPageData({ slug: 'ontario', name: 'Ontario', country: 'Canada' }, [TTC, HSR], '2026-10-13T00:00:00Z');

  it('lays out a province like an area page: heading, intro, map link, bar note and agency table', () => {
    view(<RegionPage data={data} />);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Ontario');
    expect(screen.getByText(/transit agencies operating/).textContent).toMatch(/^Ontario has 2 transit agencies operating 7 routes/);
    expect(screen.getByRole('link', { name: 'View on map' }).getAttribute('href')).toMatch(/^\/\?agencies=ttc%2Chsr/);
    expect(screen.getByText(/The bar splits this province's routes/)).toBeTruthy();
    expect(within(screen.getByRole('table')).getByRole('link', { name: 'Hamilton Street Railway' }).getAttribute('href')).toBe('/agency/hsr');
    expect(screen.queryByText(/^Area:/)).toBeNull();
  });

  it('names an agency\'s city without a link, since the link would open a different page (#1283)', () => {
    const night = { ...HSR, routes: [r('N', 3, null)] };
    const d = agencyPageData(night, [night], null);
    view(<AgencyPage data={d} />);
    expect(screen.queryByRole('link', { name: d.place })).toBeNull();
  });

  it('links each area the intro names to that area\'s page, counting past three (#1283)', () => {
    const tagged = (name: string, areas: string[]) => r(name, 3, 10, { areas });
    const wide = { ...HSR, routes: [tagged('1', ['los-angeles', 'riverside']), tagged('2', ['los-angeles', 'oxnard']), tagged('3', ['los-angeles', 'san-diego']), tagged('4', ['riverside', 'bakersfield'])] };
    // A second agency in Los Angeles and the Inland Empire only, so just those two areas have pages.
    const other = { ...HSR, slug: 'other', routes: [tagged('9', ['los-angeles', 'riverside'])] };
    const d = agencyPageData(wide, [wide, other], null);
    expect(d.place).toBe('Greater Los Angeles, the Inland Empire, the Bakersfield area and 2 other regions');
    view(<AgencyPage data={d} />);
    expect(screen.getByRole('link', { name: 'Greater Los Angeles' }).getAttribute('href')).toBe('/area/los-angeles');
    expect(screen.getByRole('link', { name: 'the Inland Empire' }).getAttribute('href')).toBe('/area/riverside');
    expect(screen.queryByRole('link', { name: 'the Bakersfield area' })).toBeNull();
    expect(screen.getByText((_, el) => el?.tagName === 'P' && (el.textContent ?? '').includes('and 2 other regions')).textContent).toBe(d.intro);
  });
});

describe('parent agency pages (CIV-1277)', () => {
  const all = agencyPageSummaries();

  it('lists the members under "Services", each linking its own page', () => {
    view(<AgencyPage data={parentAgencyPageData(parentAgency('exo')!, all, null)!} />);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('exo');
    const services = screen.getByRole('heading', { name: 'Services' }).closest('section')!;
    expect(within(services).getAllByRole('row').length).toBe(1 + 7);
    const trains = within(services).getAllByRole('link').find(a => a.getAttribute('href') === '/agency/exo-trains');
    expect(trains).toBeTruthy();
  });

  it('links a member up to its parent: "Part of MTA New York"', () => {
    view(<AgencyPage data={agencyPageData(all.find(a => a.slug === 'lirr')!, all, null)} />);
    expect(screen.getByRole('link', { name: /^Part of MTA New York/ }).getAttribute('href')).toBe('/agency/mta-new-york');
    expect(screen.queryByRole('heading', { name: 'Services' })).toBeNull();
  });
});
