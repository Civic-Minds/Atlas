import { describe, expect, it } from 'vitest';
import * as data from '../mcp/atlasData';
import { handlers } from '../mcp/tools';
import { NO_REDISTRIBUTION, mayRedistribute, redistributionExclusion } from '../../shared/rules/redistribution';
import type { AtlasStore } from '../../shared/mcpStore';

// #1693 (CIV-2121): WMATA's terms bar an API to its data, so no MCP tool answers for it; the map and History keep it.
const catalog = [{ slug: 'wmata', name: 'WMATA (Washington, DC)' }, { slug: 'ttc', name: 'Toronto Transit Commission' }];
const store = {
  catalog: async () => catalog, available: async () => new Set(catalog.map(a => a.slug)),
  meta: async () => new Map([['wmata', { shortName: 'WMATA', parentAgency: null }], ['ttc', { shortName: 'TTC', parentAgency: null }]]),
  index: async () => catalog.map(a => ({ ...a, region: '', country: 'US', railRoutes: 0, days: {} })),
} as unknown as AtlasStore;

describe('agencies the MCP may not serve', () => {
  it('lists WMATA with its reason', () => {
    expect(NO_REDISTRIBUTION.map(x => x.slug)).toEqual(['wmata']);
    expect(mayRedistribute('wmata')).toBe(false);
    expect(mayRedistribute('ttc')).toBe(true);
    expect(redistributionExclusion('wmata')?.reason).toMatch(/terms don’t allow an API/);
  });

  it('leaves WMATA out of every list and says why when asked', async () => {
    data.useStore(store);
    expect((await data.availableAgencies()).map(a => a.slug)).toEqual(['ttc']);
    expect((await data.publicAgencies()).map(a => a.slug)).toEqual(['ttc']);
    expect((await data.agencyIndex())?.map(a => a.slug)).toEqual(['ttc']);
    for (const q of ['WMATA', 'wmata', 'WMATA (Washington, DC)']) await expect(data.findAgency(q)).rejects.toThrow(/Atlas can't serve WMATA \(Washington, DC\) here: WMATA’s terms/);
    expect((await data.findAgency('TTC'))?.slug).toBe('ttc');
    const listed = await handlers.list_agencies({ query: 'WMATA' }) as { matches: number; note: string };
    expect(listed.matches).toBe(0);
    expect(listed.note).toMatch(/can't serve WMATA/);
  });
});
