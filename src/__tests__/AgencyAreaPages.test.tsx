import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import AgencyPage from '../AgencyPage';
import AreaPage from '../AreaPage';
import { agencyPageData, type AgencyPageRoute, type AgencyPageSummary } from '../../shared/agencyPages';
import { buildAreaPageData } from '../../shared/areaPages';
import type { AreaConfig } from '../../shared/areas';

const r = (name: string, mode: number, midday: number | null, extra: Partial<AgencyPageRoute> = {}): AgencyPageRoute =>
  ({ name, longName: null, mode, midday, am: midday, pm: midday, ...extra });
const TTC: AgencyPageSummary = {
  slug: 'ttc', name: 'Toronto Transit Commission', displayName: 'TTC (Toronto)', city: 'Toronto', region: 'Ontario', country: 'Canada',
  routeCount: 5, span: { first: 5, last: 28 }, lastRefreshedAt: '2026-08-27', sat: true, sun: true,
  routes: [r('1', 1, 4), r('2', 1, 20), r('5', 3, 12), r('6', 3, 30), r('301', 3, null, { night: true, am: null, pm: null })],
};
const HSR: AgencyPageSummary = { ...TTC, slug: 'hsr', name: 'Hamilton Street Railway', displayName: 'HSR (Hamilton)', routes: [r('A', 3, 10), r('B', 3, 25)], routeCount: 2, sat: true, sun: false };
const AREA: AreaConfig = {
  slug: 'toronto', name: 'Toronto', type: 'CMA', officialName: 'Toronto', country: 'Canada', cities: ['Toronto'], bbox: [43, -80, 44, -79], center: [43.5, -79.5],
  largeMetro: true, page: true, agencies: ['ttc', 'hsr'],
};

function view(ui: React.ReactElement) {
  return render(<MemoryRouter>{ui}</MemoryRouter>);
}

describe('AgencyPage', () => {
  const data = agencyPageData(TTC, [TTC, HSR], '2026-10-13T00:00:00Z', { slug: 'toronto', name: 'Toronto' });

  it('shows the short title, the area link, plain stats and Night only', () => {
    view(<AgencyPage data={data} />);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('TTC · Toronto');
    expect(screen.getByRole('link', { name: 'Toronto area →' }).getAttribute('href')).toBe('/area/toronto');
    expect(screen.getByText('every 16 min')).toBeTruthy(); // typical wait: median of 4, 12, 20, 30
    expect(screen.getAllByText('every 4 min').length).toBeGreaterThan(0);
    expect(screen.queryByText('24 h')).toBeNull(); // service hours stat removed
    expect(screen.queryByText(/quickest route/)).toBeNull(); // quickest-route stat removed
    expect(screen.getByText('Night only')).toBeTruthy();
    expect(screen.queryByText(/frequent routes|frequent service/i)).toBeNull();
  });

  it('counts routes every 15 min or better with no picker', () => {
    view(<AgencyPage data={data} />);
    expect(screen.getByText('2 of 5 routes every 15 min or better on a weekday midday')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /min$/ })).toBeNull();
    expect(screen.queryByText(/pick a standard/i)).toBeNull();
  });

  it('hides a stat it cannot compute instead of showing a blank', () => {
    const bare = { ...TTC, span: null, routes: [r('x', 3, null)], sat: undefined, sun: undefined };
    view(<AgencyPage data={agencyPageData(bare, [bare], null)} />);
    expect(screen.queryByText('typical wait, weekday midday')).toBeNull();
    expect(screen.queryByText(/weekday service/)).toBeNull();
  });
});

describe('AgencyPage other agencies list', () => {
  it('is titled by the area, links the area, and links every agency', () => {
    const withArea = agencyPageData(TTC, [TTC, HSR], null, { slug: 'toronto', name: 'Toronto' }, [TTC, HSR]);
    expect(withArea.nearby.map(n => n.slug)).toEqual(['hsr']);
    view(<AgencyPage data={withArea} />);
    const heading = screen.getByRole('heading', { name: 'Other agencies in the Toronto area' });
    expect(heading.querySelector('a')?.getAttribute('href')).toBe('/area/toronto');
    expect(screen.getByRole('link', { name: 'Hamilton Street Railway' }).getAttribute('href')).toBe('/agency/hsr');
  });

  it('keeps "Nearby agencies" when there is no area page', () => {
    view(<AgencyPage data={agencyPageData(TTC, [TTC, HSR], null)} />);
    expect(screen.getByRole('heading', { name: 'Nearby agencies' })).toBeTruthy();
  });
});

describe('AreaPage', () => {
  const data = buildAreaPageData(AREA, new Map([[TTC.slug, TTC], [HSR.slug, HSR]]), '2026-10-13T00:00:00Z');

  it('lists agencies in a table with only the mode columns the area has, and links each agency', () => {
    view(<AreaPage data={data} />);
    const headers = screen.getAllByRole('columnheader').map(h => h.textContent);
    expect(headers).toEqual(['Agency', 'Subway', 'Bus', 'Every 15 min or better']);
    expect(screen.getByRole('link', { name: 'TTC (Toronto)' }).getAttribute('href')).toBe('/agency/ttc');
    const ttcRow = screen.getByRole('link', { name: 'TTC (Toronto)' }).closest('tr')!;
    expect(ttcRow.textContent).toContain('2 of 5');
    const hsrRow = screen.getByRole('link', { name: 'HSR (Hamilton)' }).closest('tr')!;
    expect(hsrRow.textContent).toContain('–'); // no subway routes
  });

  it('shows the 15 min column and counts with no picker', () => {
    view(<AreaPage data={data} />);
    expect(screen.getAllByRole('columnheader').map(h => h.textContent).pop()).toBe('Every 15 min or better');
    expect(screen.queryByRole('button', { name: /min$/ })).toBeNull();
  });
});
