import { describe, expect, it } from 'vitest';
import * as data from '../mcp/atlasData';
import { handlers } from '../mcp/tools';
import type { AtlasStore } from '../../shared/mcpStore';

// #1705: list_agencies finds an agency by its short name (HSR), as the route tools do.
const catalog = [{ slug: 'hamilton', name: 'Hamilton Street Railway', region: 'Ontario' }, { slug: 'ttc', name: 'Toronto Transit Commission', region: 'Ontario' }];
const store = {
  catalog: async () => catalog, available: async () => new Set(catalog.map(a => a.slug)),
  meta: async () => new Map([['hamilton', { shortName: 'HSR', parentAgency: null }], ['ttc', { shortName: 'TTC', parentAgency: null }]]),
  index: async () => catalog.map(a => ({ ...a, country: 'CA', railRoutes: 0, days: {} })),
} as unknown as AtlasStore;

describe('list_agencies by short name', () => {
  it('finds HSR by its short name, and only it', async () => {
    data.useStore(store);
    const res = await handlers.list_agencies({ query: 'HSR' }) as { matches: number; agencies: string[] };
    expect(res.matches).toBe(1);
    expect(res.agencies[0]).toMatch(/^Hamilton Street Railway \|/);
  });
});
