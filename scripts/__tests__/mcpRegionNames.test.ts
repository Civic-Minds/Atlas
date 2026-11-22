import { describe, expect, it } from 'vitest';
import * as data from '../mcp/atlasData';
import { handlers } from '../mcp/tools';
import { sameRegion } from '../mcp/places';
import type { AtlasStore } from '../../shared/mcpStore';

// #1701: rank_agencies region "District of Columbia" or "DC" found nothing (Atlas stores "Washington DC"), with no note.
const catalog = [
  { slug: 'dc-circulator', name: 'DC Circulator', region: 'Washington DC', cities: ['Washington'] },
  { slug: 'kingston', name: 'Kingston Transit', region: 'Ontario', cities: ['Kingston'] },
];
const rankRow = (slug: string, name: string, region: string) => ({ slug, name, region, country: region === 'Ontario' ? 'Canada' : 'United States', partOf: null, railRoutes: 0, weekdayRoutes: 10, kind: 'bus' });
const store = {
  catalog: async () => catalog, available: async () => new Set(catalog.map(a => a.slug)),
  meta: async () => new Map(catalog.map(a => [a.slug, { shortName: null, parentAgency: null }])),
  index: async () => null, routeFeatures: async () => [], vehicles: async () => null,
  rankAgencies: async () => [rankRow('dc-circulator', 'DC Circulator', 'Washington DC'), rankRow('kingston', 'Kingston Transit', 'Ontario')],
  rankWaits: async () => ({}), rankLabels: async () => ({}),
} as unknown as AtlasStore;

describe('a region by any of its names (#1701)', () => {
  it('matches the full name, another name and the short form', () => {
    for (const asked of ['Washington DC', 'District of Columbia', 'DC', 'D.C.', 'washington dc']) expect(sameRegion('Washington DC', asked), asked).toBe(true);
    expect(sameRegion('Ontario', 'ON')).toBe(true);
    expect(sameRegion('Washington', 'DC')).toBe(false);
    expect(sameRegion('Washington DC', 'WA')).toBe(false);
  });
  it('rank_agencies and list_agencies find DC by "District of Columbia" and "DC"', async () => {
    data.useStore(store);
    for (const region of ['District of Columbia', 'DC']) {
      const rank = await handlers.rank_agencies({ region, period: 'midday', every: 15 }) as { agenciesCompared: number; regionNote?: string };
      expect(rank.agenciesCompared, region).toBe(1);
      expect(rank.regionNote).toBeUndefined();
      const list = await handlers.list_agencies({ region }) as { matches: number };
      expect(list.matches, region).toBe(1);
    }
  });
  it('says so when no agency is in a region by that name', async () => {
    data.useStore(store);
    const rank = await handlers.rank_agencies({ region: 'Atlantis', period: 'midday', every: 15 }) as { agenciesCompared: number; regionNote?: string };
    expect(rank.agenciesCompared).toBe(0);
    expect(rank.regionNote).toMatch(/no agency in a state or province named "Atlantis"/);
    const list = await handlers.list_agencies({ region: 'Atlantis' }) as { matches: number; regionNote?: string };
    expect(list.regionNote).toMatch(/Atlantis/);
  });
});
