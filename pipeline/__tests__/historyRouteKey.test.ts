import { describe, expect, it } from 'vitest';
import { historyRouteKey } from '../historyRouteKey.js';

describe('historyRouteKey', () => {
  it('prefers the public route short name', () => {
    expect(historyRouteKey({ routeShortName: '45', routeId: '145' })).toBe('45');
  });

  it('falls back to route ID for unnamed routes', () => {
    expect(historyRouteKey({ routeShortName: '', routeId: '145' })).toBe('145');
  });

  it('ignores routes with neither identifier', () => {
    expect(historyRouteKey({ routeShortName: ' ', routeId: null })).toBeNull();
  });
});
