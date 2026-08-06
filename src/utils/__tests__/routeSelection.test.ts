import { describe, expect, it } from 'vitest';
import { resolveRouteSelectionForDay } from '../routeSelection';

function feature(routeId: string, day: string, shortName = '6A', longName = 'Visalia Transit'): GeoJSON.Feature {
  return {
    type: 'Feature',
    geometry: { type: 'LineString', coordinates: [[0, 0], [1, 1]] },
    properties: { routeId, routeShortName: shortName, routeLongName: longName, day },
  };
}

describe('resolveRouteSelectionForDay', () => {
  it('switches Visalia weekday/weekend route IDs while keeping the logical route selected', () => {
    const features = [feature('6A', 'Weekday'), feature('6AW', 'Saturday'), feature('6AW', 'Sunday')];

    expect(resolveRouteSelectionForDay('visalia::6A', 'visalia', features, 'Saturday')).toBe('visalia::6AW');
    expect(resolveRouteSelectionForDay('visalia::6AW', 'visalia', features, 'Weekday')).toBe('visalia::6A');
  });

  it('keeps the existing route ID when it exists for the active day', () => {
    const features = [feature('6A', 'Weekday'), feature('6AW', 'Saturday')];

    expect(resolveRouteSelectionForDay('visalia::6A', 'visalia', features, 'Weekday')).toBe('visalia::6A');
  });

  it('does not guess when multiple same-name route IDs exist on the active day', () => {
    const features = [feature('6A', 'Weekday'), feature('6B', 'Saturday'), feature('6C', 'Saturday')];

    expect(resolveRouteSelectionForDay('visalia::6A', 'visalia', features, 'Saturday')).toBeNull();
  });
});
