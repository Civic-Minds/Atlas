import { describe, expect, it } from 'vitest';
import { buildRouteKey, splitRouteKey } from '../routeKey';

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
});
