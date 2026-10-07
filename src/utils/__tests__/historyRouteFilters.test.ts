import { describe, expect, it } from 'vitest';
import {
  buildHistoryRouteFilters,
  historyRouteMatchesFilter,
  historyRouteModeLabel,
} from '../historyRouteFilters';

const gold = {
  routeShortName: 'Gold',
  routeLongName: 'Downtown - Folsom',
  routeType: 0,
  agencySlug: 'sacrt',
};

describe('historyRouteFilters', () => {
  it('classifies SacRT route_type=0 light rail as LRT', () => {
    expect(historyRouteModeLabel(gold)).toBe('LRT');
  });

  it('builds mode and subtype filter counts', () => {
    expect(buildHistoryRouteFilters([
      gold,
      { routeShortName: '1', routeLongName: 'Greenback', routeType: 3, busSubType: 'local', agencySlug: 'sacrt' },
      { routeShortName: '2', routeLongName: 'Express', routeType: 3, busSubType: 'express', agencySlug: 'sacrt' },
    ])).toEqual([
      { key: 'mode:100', label: 'LRT', count: 1 },
      { key: 'subtype:express', label: 'Express', count: 1 },
    ]);
  });

  it('matches only routes with the selected current metadata', () => {
    expect(historyRouteMatchesFilter(gold, 'mode:100')).toBe(true);
    expect(historyRouteMatchesFilter({ ...gold, routeType: 3 }, 'mode:100')).toBe(false);
  });
});
