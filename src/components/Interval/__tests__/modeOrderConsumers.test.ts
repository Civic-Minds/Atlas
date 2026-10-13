import { describe, it, expect } from 'vitest';
import { MODE_DEFINITIONS, FILTER_MODES, filterModeOptions, modeLabel, ON_DEMAND_MODE } from '../../../../shared/modes';
import { agencyStats, modesText, type AgencyPageRoute } from '../../../../shared/agencyPages';
import { buildAreaPageData } from '../../../../shared/areaPages';
import { buildAgencyRouteFilters } from '../AgencyCard';
import { buildHistoryRouteFilters } from '../../../utils/historyRouteFilters';
import { AVAILABLE_FILTER_MODES } from '../../../utils/shareUrlState';

// One shared definition of mode order and labels; every place that lists modes must follow it (#827).
const EXPECTED_ORDER = ['Subway/Metro', 'Light rail', 'Streetcar', 'Commuter rail', 'Monorail', 'Bus', 'Trolleybus', 'Ferry', 'Cable car', 'Gondola/aerial tram', 'Funicular', 'On-demand'];
const SHUFFLED = [3, 2, 100, 6, 4, 1, 0];

const route = (mode: number): AgencyPageRoute => ({ name: String(mode), longName: null, mode, midday: 10, am: 10, pm: 10, evening: null, overnight: null });
const summary = (slug: string, modes: number[]) => ({
  slug, name: slug, displayName: slug, city: 'X', routeCount: modes.length, routes: modes.map(route), span: { first: 6, last: 24 }, lastRefreshedAt: '2026-09-01',
});
const inOrder = (labels: string[]) => labels.map(l => EXPECTED_ORDER.indexOf(l));
const ascending = (nums: number[]) => nums.every((n, i) => n >= 0 && (i === 0 || n > nums[i - 1]));

describe('shared mode order and labels', () => {
  it('defines the agreed order in plain words', () => {
    expect(MODE_DEFINITIONS.map(m => m.label)).toEqual(EXPECTED_ORDER);
    expect(modeLabel(100)).toBe('Light rail');
    expect(modeLabel(2)).toBe('Commuter rail');
    expect(modeLabel(ON_DEMAND_MODE)).toBe('On-demand');
  });

  it('the map filter menu follows it, with On-demand last', () => {
    expect(ascending(inOrder(FILTER_MODES.map(m => m.label)))).toBe(true);
    expect(filterModeOptions(true).map(m => m.label)).toEqual([...FILTER_MODES.map(m => m.label), 'On-demand']);
    expect(AVAILABLE_FILTER_MODES.map(m => m.label).filter(l => l !== 'On-demand')).toEqual(FILTER_MODES.map(m => m.label));
  });

  it('agency page sections and the intro sentence follow it', () => {
    const stats = agencyStats(summary('a', SHUFFLED));
    expect(stats.byMode.map(g => g.label)).toEqual(['Subway/Metro', 'Light rail', 'Streetcar', 'Commuter rail', 'Bus', 'Ferry', 'Gondola/aerial tram']);
    expect(modesText(stats.byMode.map(g => ({ label: g.label, routes: g.routes.length }))))
      .toBe('1 subway/metro · 1 light rail · 1 streetcar · 1 commuter rail · 1 bus · 1 ferry · 1 gondola/aerial tram');
  });

  it('area page sections and table columns follow it', () => {
    const area = { slug: 'x', name: 'X', type: 'CMA', officialName: 'X', country: 'Canada', cities: ['X'], bbox: [0, 0, 1, 1], center: [0, 0], page: true, agencies: ['a', 'b'] } as never;
    const all = new Map([summary('a', [3, 100, 6]), summary('b', [2, 1, 4, 0])].map(a => [a.slug, a as never] as const));
    const d = buildAreaPageData(area, all, null);
    expect(d.byMode.map(m => m.label)).toEqual(['Subway/Metro', 'Light rail', 'Streetcar', 'Commuter rail', 'Bus', 'Ferry', 'Gondola/aerial tram']);
    expect(d.modeColumns).toEqual(d.byMode.map(m => m.label));
  });

  it('the agency card and history route chips follow it', () => {
    const rows = SHUFFLED.map(routeType => ({ routeId: String(routeType), agencySlug: 'x', shortName: String(routeType), longName: null, headway: 10, limited: false, tier: '10', routeType, busSubType: undefined, matchesFilter: true }));
    const card = buildAgencyRouteFilters(rows).map(c => c.label);
    expect(ascending(inOrder(card))).toBe(true);
    expect(card).not.toContain('Bus');
    const history = buildHistoryRouteFilters(SHUFFLED.map(routeType => ({ routeShortName: String(routeType), routeType, agencySlug: 'x' }))).map(c => c.label);
    expect(history).toEqual(card);
  });
});
