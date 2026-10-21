import { describe, expect, it } from 'vitest';
import { afterEach, beforeEach } from 'vitest';
import { backfillRouteKey, historyRouteKey } from '../historyRouteKey.js';

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

  describe('long-name fallback is opt-in', () => {
    const saved = process.env.ATLAS_HISTORY_V2;
    beforeEach(() => { delete process.env.ATLAS_HISTORY_V2; });
    afterEach(() => { if (saved === undefined) delete process.env.ATLAS_HISTORY_V2; else process.env.ATLAS_HISTORY_V2 = saved; });

    const longOnly = { routeShortName: '', routeId: ' ', routeLongName: ' Lake Line ' };

    it('creates no new key by default (no flag, no option)', () => {
      expect(historyRouteKey(longOnly)).toBeNull();
      expect(historyRouteKey({ routeShortName: ' ', routeId: 'r9', routeLongName: 'Lake' })).toBe('r9');
    });

    it('falls back to the long name with the option or ATLAS_HISTORY_V2=1', () => {
      expect(historyRouteKey(longOnly, { longNameFallback: true })).toBe('Lake Line');
      process.env.ATLAS_HISTORY_V2 = '1';
      expect(historyRouteKey(longOnly)).toBe('Lake Line');
      expect(historyRouteKey(longOnly, { longNameFallback: false })).toBeNull();
    });

    it('legacy backfills skip a blank short name by default and fall back under the flag', () => {
      const blank = { routeShortName: '', routeId: 'r9', routeLongName: 'Lake' };
      expect(backfillRouteKey(blank)).toBeNull();
      expect(backfillRouteKey({ routeShortName: ' 12 ' })).toBe(' 12 ');
      process.env.ATLAS_HISTORY_V2 = '1';
      expect(backfillRouteKey(blank)).toBe('r9');
      expect(backfillRouteKey(longOnly)).toBe('Lake Line');
    });
  });
});
