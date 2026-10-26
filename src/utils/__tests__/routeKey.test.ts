import { describe, expect, it } from 'vitest';
import { buildRouteKey, dedupeRouteKeysByDisplay, routeKeyForShortName, splitRouteKey } from '../routeKey';

describe('route keys', () => {
  it('keeps unbranched route keys backward-compatible', () => {
    expect(buildRouteKey('ttc', '506')).toBe('ttc::506');
    expect(splitRouteKey('ttc::506')).toEqual({ agencySlug: 'ttc', routeId: '506', routeBranch: undefined });
  });

  it('round-trips a derived branch without changing the source route ID', () => {
    const key = buildRouteKey('rideon', '9023', 'Orange');
    expect(key).toBe('rideon::9023::branch:Orange');
    expect(splitRouteKey(key)).toEqual({ agencySlug: 'rideon', routeId: '9023', routeBranch: 'Orange' });
  });

  it('collapses different feed IDs with the same rider-facing route label', () => {
    expect(dedupeRouteKeysByDisplay([
      { key: 'calgary::202-20785', agencySlug: 'calgary', shortName: '202', longName: 'Blue Line' },
      { key: 'calgary::202-20786', agencySlug: 'calgary', shortName: '202', longName: 'Blue Line' },
      { key: 'calgary::201', agencySlug: 'calgary', shortName: '201', longName: 'Red Line' },
    ])).toEqual(['calgary::202-20785', 'calgary::201']);
  });

  it('collapses raw name variants that render as the same rider-facing label', () => {
    expect(dedupeRouteKeysByDisplay([
      { key: 'yrt::603', agencySlug: 'yrt', shortName: 'purple', longName: 'VIVA PURPLE' },
      { key: 'yrt::603-variant', agencySlug: 'yrt', shortName: 'Purple', longName: 'Viva   Purple' },
    ])).toEqual(['yrt::603']);
  });
});

describe('routeKeyForShortName (Live\'s route as the map\'s selection key)', () => {
  const f = (properties: Record<string, unknown>): GeoJSON.Feature => ({ type: 'Feature', properties, geometry: { type: 'LineString', coordinates: [] } });
  const features = [
    f({ routeShortName: '505', routeId: '505', day: 'Weekday' }),
    f({ routeShortName: '504', routeId: '504-sat', day: 'Saturday', routeBranch: 'A' }),
    f({ routeShortName: '504', routeId: '504', day: 'Weekday', routeBranch: 'B' }),
  ];

  it('keys the whole route by its own ID, never one branch', () => {
    expect(routeKeyForShortName('ttc', features, '504', 'Weekday')).toBe('ttc::504');
  });

  it('prefers the given day and falls back to any day', () => {
    expect(routeKeyForShortName('ttc', features, '504', 'Saturday')).toBe('ttc::504-sat');
    expect(routeKeyForShortName('ttc', features, '504', 'Sunday')).toBe('ttc::504-sat');
  });

  it('gives null for a route the agency does not have', () => {
    expect(routeKeyForShortName('ttc', features, '999', 'Weekday')).toBeNull();
  });
});
