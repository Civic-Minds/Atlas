import { describe, expect, it } from 'vitest';
import * as data from '../mcp/atlasData';
import { handlers } from '../mcp/tools';
import { needAgency } from '../mcp/toolHelpers';
import type { AtlasStore } from '../../shared/mcpStore';

// #1687: the hosted pilot carries a few agencies; one outside them is named as such, not pointed to and then failed.
const catalog = [
  { slug: 'stm', name: 'STM (Montréal)', cities: ['Montréal'] }, { slug: 'ttc', name: 'Toronto Transit Commission', region: 'Ontario', cities: ['Toronto'] },
  { slug: 'hsr', name: 'Hamilton Street Railway', region: 'Ontario', cities: ['Hamilton'] },
  { slug: 'kingston', name: 'Kingston Transit', region: 'Ontario', cities: ['Kingston'] },
];
const store = {
  catalog: async () => catalog, available: async () => new Set(['ttc', 'hsr']),
  meta: async () => new Map(catalog.map(a => [a.slug, { shortName: a.slug.toUpperCase(), parentAgency: null }])),
  index: async () => null, routeFeatures: async () => [], vehicles: async () => null,
} as unknown as AtlasStore;

describe('agencies this server has no schedules for (#1687)', () => {
  it('says the server covers only its agencies, and names them', async () => {
    data.useStore(store);
    await expect(needAgency('STM')).rejects.toThrow(/STM \(Montréal\) is in Atlas, but this server has schedules for only 2 agencies: Toronto Transit Commission; Hamilton Street Railway/);
    await expect(handlers.compare_agencies({ agencies: ['TTC', 'STM'], period: 'midday', every: 15 })).rejects.toThrow(/this server has schedules for only 2 agencies/);
    const listed = await handlers.list_agencies({ query: 'Montréal' }) as { matches: number; note: string };
    expect(listed.matches).toBe(0);
    expect(listed.note).toMatch(/STM \(Montréal\) is in Atlas, but this server has schedules for only 2 agencies/);
  });
  it('still says no agency matches when Atlas has none by that name', async () => {
    data.useStore(store);
    await expect(needAgency('Nowhere Transit')).rejects.toThrow(/No agency matching "Nowhere Transit" has data here/);
  });

  it('buses_needed gives the schedule end date like every schedule tool (#1688)', async () => {
    data.useStore(store);
    const res = await handlers.buses_needed({ agency: 'TTC', route: '504', period: 'midday' }) as Record<string, unknown>;
    expect(res).toHaveProperty('scheduleValidThrough');
  });
  it('a filter that finds some agencies here says how many more Atlas has that this server lacks (#1702)', async () => {
    data.useStore(store);
    const on = await handlers.list_agencies({ region: 'ON' }) as { matches: number; notOnThisServer?: string };
    expect(on.matches).toBe(2);
    expect(on.notOnThisServer).toMatch(/^The 1 other agency this filter finds is in Atlas, but this server has schedules for only 2 agencies/);
    const toronto = await handlers.list_agencies({ query: 'Toronto' }) as { matches: number; notOnThisServer?: string };
    expect(toronto.matches).toBe(1);
    expect(toronto.notOnThisServer).toBeUndefined();
  });
});
