import { describe, it, expect } from 'vitest';
import { buildAgencyRouteFilters, buildHeaderSummary, routeMatchesAgencyFilter } from '../AgencyCard';

const routes = [
  { routeId: '1', agencySlug: 'ttc', shortName: '1', longName: 'Line 1', headway: 4, tier: '5', routeType: 1, busSubType: undefined, matchesFilter: true },
  { routeId: '2', agencySlug: 'ttc', shortName: '2', longName: 'Line 2', headway: 4, tier: '5', routeType: 1, busSubType: undefined, matchesFilter: true },
  { routeId: '900', agencySlug: 'ttc', shortName: '900', longName: 'Airport Express', headway: 9, tier: '10', routeType: 3, busSubType: 'express', matchesFilter: true },
  { routeId: '36', agencySlug: 'ttc', shortName: '36', longName: 'Finch West', headway: 6, tier: '10', routeType: 3, busSubType: undefined, matchesFilter: false },
];

describe('agency card filters', () => {
  it('builds mode and subtype chips from routes', () => {
    const chips = buildAgencyRouteFilters(routes);
    expect(chips).toEqual([
      { key: 'mode:1', label: 'Subway', count: 2 },
      { key: 'subtype:express', label: 'Express', count: 1 },
    ]);
  });

  it('filters express routes only', () => {
    const express = routes.filter(r => routeMatchesAgencyFilter(r, 'subtype:express'));
    expect(express.map(r => r.shortName)).toEqual(['900']);
  });

  it('keeps streetcar and virtual LRT chips distinct', () => {
    const chips = buildAgencyRouteFilters([
      { routeId: '501', agencySlug: 'ttc', shortName: '501', longName: 'Queen', headway: 8, tier: '10', routeType: 0, busSubType: undefined, matchesFilter: true },
      { routeId: '5', agencySlug: 'ttc', shortName: '5', longName: 'Line 5 Eglinton', headway: 6, tier: '10', routeType: 0, busSubType: undefined, matchesFilter: true },
    ]);
    expect(chips).toEqual([
      { key: 'mode:0', label: 'Streetcar', count: 1 },
      { key: 'mode:100', label: 'LRT', count: 1 },
    ]);
  });

  it('summarizes matching routes for active frequency filter', () => {
    expect(buildHeaderSummary(routes, 60)).toBe('4 routes · 3 match ≤60m');
    expect(buildHeaderSummary(routes, Infinity)).toBe('4 routes');
  });
});
