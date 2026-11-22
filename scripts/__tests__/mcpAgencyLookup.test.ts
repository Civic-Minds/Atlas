import { describe, expect, it } from 'vitest';
import * as data from '../mcp/atlasData';
import type { AtlasStore } from '../../shared/mcpStore';

// #1676 and #1675: agency names find the agency meant, and a parent agency groups its feeds in every tool.
const catalog = [
  { slug: 'owen-sound', name: 'Owen Sound Transit' }, { slug: 'soundtransit', name: 'Sound Transit (Seattle)' },
  { slug: 'translink', name: 'TransLink (Vancouver)' }, { slug: 'ctran', name: 'C-TRAN (Vancouver, WA)' },
  { slug: 'nyct-subway', name: 'MTA NYCT Subway' }, { slug: 'nyct-bus-bronx', name: 'MTA NYCT Bus (Bronx)' },
  { slug: 'go', name: 'GO Transit' }, { slug: 'upexpress', name: 'UP Express (Toronto)' },
  { slug: 'cta', name: 'Chicago Transit Authority (CTA)' }, { slug: 'durango', name: 'Durango Transit' },
];
const store = {
  catalog: async () => catalog, available: async () => new Set(catalog.map(a => a.slug)),
  meta: async () => new Map(catalog.map(a => [a.slug, { shortName: '', parentAgency: a.slug.startsWith('nyct') ? 'MTA New York' : null }])),
} as unknown as AtlasStore;

describe('agency lookup', () => {
  it('prefers the agency whose name starts with the words asked', async () => {
    data.useStore(store);
    expect((await data.findAgency('Sound Transit'))?.slug).toBe('soundtransit');
  });

  it('asks when a name fits several agencies equally', async () => {
    data.useStore(store);
    await expect(data.findAgency('Vancouver')).rejects.toThrow(/matches several agencies: TransLink \(Vancouver\); C-TRAN/);
  });

  it('groups a parent agency’s feeds from the meta file when the catalog has no parent', async () => {
    data.useStore(store);
    const e = await data.findAgencyEntry('MTA New York');
    expect(e?.name).toBe('MTA New York');
    expect(e?.members.map(m => m.slug).sort()).toEqual(['nyct-bus-bronx', 'nyct-subway']);
  });

  it('points an operator to the agencies it runs (#1681)', async () => {
    data.useStore(store);
    await expect(data.findAgency('Metrolinx')).rejects.toThrow(/Metrolinx runs several agencies here: GO Transit; UP Express/);
    const e = await data.findAgencyEntry('metrolinx');
    expect(e?.name).toBe('Metrolinx (GO Transit, UP Express (Toronto))');
    expect(e?.members.map(m => m.slug)).toEqual(['go', 'upexpress']);
  });

  it('matches a name where a word starts, not inside a word (#1682)', async () => {
    data.useStore(store);
    expect(data.hasWordsAt('Chicago Transit Authority (CTA)', 'GO Transit')).toBe(false);
    expect(data.hasWordsAt('Durango Transit', 'go transit')).toBe(false);
    expect(data.hasWordsAt('GO Transit', 'go transit')).toBe(true);
    expect(data.hasWordsAt('UP Express (Toronto)', 'toronto')).toBe(true);
    expect((await data.findAgency('GO Transit'))?.slug).toBe('go');
  });
});
