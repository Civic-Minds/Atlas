import { describe, it, expect } from 'vitest';
import { buildAgencyRouteFilters, routeMatchesAgencyFilter } from '../AgencyCard';

const routes = [
  { routeId: '1', agencySlug: 'ttc', shortName: '1', longName: 'Line 1', headway: 4, tier: '5', routeType: 1, busSubType: undefined },
  { routeId: '2', agencySlug: 'ttc', shortName: '2', longName: 'Line 2', headway: 4, tier: '5', routeType: 1, busSubType: undefined },
  { routeId: '900', agencySlug: 'ttc', shortName: '900', longName: 'Airport Express', headway: 9, tier: '10', routeType: 3, busSubType: 'express' },
  { routeId: '36', agencySlug: 'ttc', shortName: '36', longName: 'Finch West', headway: 6, tier: '10', routeType: 3, busSubType: undefined },
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
});
