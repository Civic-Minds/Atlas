import { describe, expect, it } from 'vitest';
import {
  buildRouteModeFilters,
  routeMatchesModeFilter,
  routeModeFilterLabel,
} from '../routeModeFilters';

const gold = {
  routeShortName: 'Gold',
  routeLongName: 'Downtown - Folsom',
  routeType: 0,
  agencySlug: 'sacrt',
};

describe('routeModeFilters', () => {
  it('classifies SacRT route_type=0 light rail as light rail', () => {
    expect(routeModeFilterLabel(gold)).toBe('Light rail');
  });

  it('builds mode and subtype filter counts', () => {
    expect(buildRouteModeFilters([
      gold,
      { routeShortName: '1', routeLongName: 'Greenback', routeType: 3, busSubType: 'local', agencySlug: 'sacrt' },
      { routeShortName: '2', routeLongName: 'Express', routeType: 3, busSubType: 'express', agencySlug: 'sacrt' },
    ])).toEqual([
      { key: 'mode:100', label: 'Light rail', count: 1 },
      { key: 'subtype:express', label: 'Express', count: 1 },
    ]);
  });

  it('matches only routes with the selected current metadata', () => {
    expect(routeMatchesModeFilter(gold, 'mode:100')).toBe(true);
    expect(routeMatchesModeFilter({ ...gold, routeType: 3 }, 'mode:100')).toBe(false);
  });
});
