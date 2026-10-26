import { describe, expect, it } from 'vitest';
import { historyRouteMatchesQuery } from '../historyRouteSearch';

const route = (routeShortName: string, routeName: string) => ({ routeShortName, routeName });

describe('historyRouteMatchesQuery (#1015)', () => {
  it('matches the route number the way the map search does', () => {
    expect(historyRouteMatchesQuery(route('6', 'Emory'), '6')).toBe(true);
    expect(historyRouteMatchesQuery(route('006', 'Emory'), '6')).toBe(true);
    expect(historyRouteMatchesQuery(route('143', 'Windward Park / Ride'), '14')).toBe(true);
    expect(historyRouteMatchesQuery(route('24', 'East Lake'), '6')).toBe(false);
  });

  it('matches the name from two letters, ignoring case', () => {
    expect(historyRouteMatchesQuery(route('6', 'Emory'), 'em')).toBe(true);
    expect(historyRouteMatchesQuery(route('6', 'Emory'), 'EMORY')).toBe(true);
    expect(historyRouteMatchesQuery(route('6', 'Emory'), 'e')).toBe(false);
  });

  it('an empty search matches every route', () => {
    expect(historyRouteMatchesQuery(route('6', 'Emory'), '  ')).toBe(true);
  });
});
