import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { currentRouteShortNamesFor, mergeAliasedRoutes, type HistoryRouteAliases } from '../historyIdentity.js';

const aliases = JSON.parse(readFileSync(resolve('config/history-route-aliases.json'), 'utf8')) as HistoryRouteAliases;

describe('GCRTA HealthLine renamed HL (#1762)', () => {
  it('folds the old HealthLine key into HL, so History shows one route', () => {
    const routes = { HealthLine: [{ periodKey: '20250827' }], HL: [{ periodKey: '20260923' }], '26': [{ periodKey: '20260923' }] };
    const { routes: out, merged } = mergeAliasedRoutes(routes, aliases.gcrta);
    expect(Object.keys(out).sort()).toEqual(['26', 'HL']);
    expect(out.HL.map(e => e.periodKey).sort()).toEqual(['20250827', '20260923']);
    expect(merged).toBeGreaterThan(0);
  });

  it('resolves the old key to the HL route on today\'s map', () => {
    expect(currentRouteShortNamesFor('HealthLine', undefined, aliases.gcrta)).toEqual(['HL']);
  });

  it('adds no alias for the merges and splits #1762 lists (not one service)', () => {
    const olds = (slug: string) => Object.values(aliases[slug] ?? {}).flat().map(e => (typeof e === 'string' ? e : e.key));
    for (const k of ['208', '271', '901']) expect(olds('kingcountymetro')).not.toContain(k);
    for (const k of ['37', '32']) expect(olds('trimet')).not.toContain(k);
  });
});
