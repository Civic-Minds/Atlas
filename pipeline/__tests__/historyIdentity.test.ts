import { describe, expect, it } from 'vitest';
import { aliasedLineKey, resolveCurrentHistoryRoute } from '../historyIdentity.js';

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

describe('aliasedLineKey', () => {
  const aliases = { 'T5 Bus': ['36B', { key: '36X', days: 'weekend' as const }] };
  it('uses the canonical key when the period drew the line under it', () => {
    expect(aliasedLineKey(k => ['T5 Bus', '36B'].includes(k), 'T5 Bus', aliases)).toBe('T5 Bus');
  });
  it('falls back to an alias source the period drew it under (SEPTA T5 Bus ← 36B, 2021-2024)', () => {
    expect(aliasedLineKey(k => k === '36B' || k === '36', 'T5 Bus', aliases)).toBe('36B');
    expect(aliasedLineKey(k => k === '36X', 'T5 Bus', aliases)).toBe('36X');
  });
  it('never takes an unrelated key, and gives nothing when no line is stored', () => {
    expect(aliasedLineKey(k => k === '36', 'T5 Bus', aliases)).toBeUndefined();
    expect(aliasedLineKey(() => false, '53', undefined)).toBeUndefined();
  });
});
