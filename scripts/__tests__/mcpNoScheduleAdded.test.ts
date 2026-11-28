import { describe, expect, it } from 'vitest';
import * as data from '../mcp/atlasData';
import { handlers } from '../mcp/tools';
import type { AtlasStore } from '../../shared/mcpStore';

// #1905: list_agencies gave Atlas's last refresh as "schedule added", so a 2019 schedule read as added this month. Atlas
// records no date the schedule changed (CIV-3115), so the column is gone: name, region and when the schedule runs out.
const catalog = [{ slug: 'yakima', name: 'Yakima Transit', region: 'Washington', lastRefreshedAt: '2026-11-02T06:00:00Z', lastFeedExpiry: '20270630' }];
const store = {
  catalog: async () => catalog, available: async () => new Set(catalog.map(a => a.slug)),
  meta: async () => new Map([['yakima', { shortName: null, parentAgency: null }]]),
  index: async () => catalog.map(a => ({ ...a, country: 'US', railRoutes: 0, days: {} })),
} as unknown as AtlasStore;

describe('list_agencies gives no "schedule added" date (#1905)', () => {
  it('lists name, region and valid-through only, never the refresh date', async () => {
    data.useStore(store);
    const res = await handlers.list_agencies({ query: 'Yakima' }) as { agencies: string[]; columns: string };
    expect(res.columns).toBe('name | region | schedule valid through');
    expect(res.agencies[0].split(' | ')).toHaveLength(3);
    expect(res.agencies[0]).not.toContain('2026-11-02');
    expect(JSON.stringify(res)).not.toMatch(/schedule added/);
  });
});
