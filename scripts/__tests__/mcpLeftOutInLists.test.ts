import { describe, expect, it } from 'vitest';
import * as data from '../mcp/atlasData';
import { handlers } from '../mcp/tools';
import type { AtlasStore } from '../../shared/mcpStore';

// #1700: a left-out agency (shared/rules/redistribution.ts) in a comparison dropped every other agency's row, and a
// ranking whose region holds only left-out agencies came back empty with no reason.
const catalog = [
  { slug: 'whitehorse', name: 'Whitehorse Transit', region: 'Yukon', cities: ['Whitehorse'] },
  { slug: 'kingston', name: 'Kingston Transit', region: 'Ontario', cities: ['Kingston'] },
];
const store = {
  catalog: async () => catalog, available: async () => new Set(catalog.map(a => a.slug)),
  meta: async () => new Map(catalog.map(a => [a.slug, { shortName: null, parentAgency: null }])),
  index: async () => null, routeFeatures: async () => [], vehicles: async () => null,
  rankAgencies: async () => [{ slug: 'kingston', name: 'Kingston Transit', region: 'Ontario', country: 'Canada', partOf: null, railRoutes: 0, weekdayRoutes: 20, kind: 'bus' }],
  rankWaits: async () => ({ kingston: [] }), rankLabels: async () => ({}),
} as unknown as AtlasStore;

describe('left-out agencies beside the others (#1700)', () => {
  it('compare_agencies keeps the other agencies and notes the left-out one', async () => {
    data.useStore(store);
    const res = await handlers.compare_agencies({ agencies: ['Whitehorse Transit', 'Kingston Transit'], period: 'midday', every: 30 }) as { agencies: Array<{ agency: string }>; leftOutAgencies?: string };
    expect(res.agencies.map(r => r.agency)).toEqual(['Kingston Transit']);
    expect(res.leftOutAgencies).toMatch(/Atlas can't serve Whitehorse Transit here/);
  });
  it('compare_agencies with only left-out agencies says why', async () => {
    data.useStore(store);
    await expect(handlers.compare_agencies({ agencies: ['Whitehorse Transit'], period: 'midday', every: 30 })).rejects.toThrow(/Atlas can't serve Whitehorse Transit here/);
  });
  it('rank_agencies for a region with a left-out agency says so', async () => {
    data.useStore(store);
    const yukon = await handlers.rank_agencies({ country: 'Canada', region: 'Yukon', period: 'midday', every: 30 }) as { agenciesCompared: number; leftOutAgencies?: string };
    expect(yukon.agenciesCompared).toBe(0);
    expect(yukon.leftOutAgencies).toMatch(/Whitehorse Transit \(Whitehorse Transit’s data terms/);
    const ontario = await handlers.rank_agencies({ region: 'Ontario', period: 'midday', every: 30 }) as { leftOutAgencies?: string };
    expect(ontario.leftOutAgencies).toBeUndefined();
  });
});
