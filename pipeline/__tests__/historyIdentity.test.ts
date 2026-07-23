import { describe, expect, it } from 'vitest';
import { resolveCurrentHistoryRoute } from '../historyIdentity.js';

describe('resolveCurrentHistoryRoute', () => {
  const current = {
    HL: { routeShortName: 'HL', routeLongName: 'HealthLine', headway: 15 },
    '51-51A': { routeShortName: '51-51A', routeLongName: 'MetroHealth Line', headway: 30 },
  };

  it('prefers an unchanged historical route ID', () => {
    expect(resolveCurrentHistoryRoute({ routeShortName: '51-51A', currentRouteShortNames: ['HL'] }, current)?.headway).toBe(30);
  });

  it('resolves an explicit route-ID redesign alias', () => {
    expect(resolveCurrentHistoryRoute({ routeShortName: 'HealthLine', currentRouteShortNames: ['HL'] }, current)?.routeShortName).toBe('HL');
  });

  it('returns no match when no current identity is available', () => {
    expect(resolveCurrentHistoryRoute({ routeShortName: '26' }, current)).toBeUndefined();
  });
});
