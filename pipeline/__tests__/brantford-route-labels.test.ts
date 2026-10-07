import { describe, expect, it } from 'vitest';
import { normalizeBrantfordRouteLabels } from '../transforms/brantford-route-labels';
import type { GtfsData } from '../../types/gtfs';

function fixture(routes: GtfsData['routes']): GtfsData {
  return {
    agencies: [],
    routes,
    trips: [],
    stops: [],
    stopTimes: [],
    calendar: [],
    calendarDates: [],
    shapes: [],
  };
}

describe('normalizeBrantfordRouteLabels', () => {
  it('removes the feed-supplied leading separator from route names', () => {
    const result = normalizeBrantfordRouteLabels(fixture([
      { route_id: '3076', route_short_name: '20', route_long_name: '- Grand River Line', route_type: '3' },
    ]));

    expect(result.routes[0].route_long_name).toBe('Grand River Line');
  });

  it('removes an en dash as well as a hyphen', () => {
    const result = normalizeBrantfordRouteLabels(fixture([
      { route_id: '14', route_short_name: '14', route_long_name: '– East Brantford Evening Loop', route_type: '3' },
    ]));

    expect(result.routes[0].route_long_name).toBe('East Brantford Evening Loop');
  });

  it('leaves normal route names unchanged', () => {
    const result = normalizeBrantfordRouteLabels(fixture([
      { route_id: '1', route_short_name: '1', route_long_name: 'Market Street', route_type: '3' },
    ]));

    expect(result.routes[0].route_long_name).toBe('Market Street');
  });
});
