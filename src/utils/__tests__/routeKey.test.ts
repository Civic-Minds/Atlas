import { describe, expect, it } from 'vitest';
import { buildRouteKey, dedupeRouteKeysByDisplay, splitRouteKey } from '../routeKey';

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
});
