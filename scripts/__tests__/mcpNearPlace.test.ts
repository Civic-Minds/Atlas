import { describe, expect, it } from 'vitest';
import * as data from '../mcp/atlasData';
import { handlers } from '../mcp/tools';
import { placesNamed } from '../mcp/places';
import type { AtlasStore } from '../../shared/mcpStore';

// #1699: "Washington DC" found no place once WMATA was left out, "Washington" silently meant Washington State Ferries,
// and "Bethesda" measured from Maryland Transit Administration's area centre. #1687: near results named agencies the
// hosted pilot has no schedules for, with no note.
const catalog = [
  { slug: 'art', name: 'Arlington Transit (ART)', region: 'Virginia', center: [38.88, -77.1], cities: ['Arlington'] },
  { slug: 'mta-md', name: 'Maryland Transit Administration', region: 'Maryland', center: [39.29, -76.61], cities: ['Baltimore', 'Bethesda'] },
  { slug: 'wsf', name: 'Washington State Ferries', region: 'Washington', center: [47.6, -122.5], cities: ['Seattle'] },
  { slug: 'ttc', name: 'Toronto Transit Commission', region: 'Ontario', center: [43.7, -79.4], cities: ['Toronto'] },
];
const store = (available: string[]) => ({
  catalog: async () => catalog, available: async () => new Set(available),
  meta: async () => new Map(catalog.map(a => [a.slug, { shortName: a.slug.toUpperCase(), parentAgency: null }])),
  index: async () => null, routeFeatures: async () => [], vehicles: async () => null,
}) as unknown as AtlasStore;
type Near = { near: string; centredOn: string; note?: string; agencies: string[] };

describe('list_agencies near a city (#1699)', () => {
  it('finds a city by name, with its state or province written out, short or after a comma', () => {
    for (const q of ['Washington DC', 'Washington D.C.', 'Washington, District of Columbia']) expect(placesNamed(q)[0], q).toMatchObject({ name: 'Washington', region: 'District of Columbia' });
    expect(placesNamed('Arlington, Virginia').map(p => p.region)).toEqual(['Virginia']);
    expect(placesNamed('Arlington VA').map(p => p.region)).toEqual(['Virginia']);
    expect(placesNamed('Arlington').map(p => p.region)).toEqual(['Texas', 'Virginia']);
    expect(placesNamed('Montreal')[0]?.name).toBe('Montréal');
    expect(placesNamed('Nowhereville')).toEqual([]);
  });
  it('measures from the city, says so, and names what else the name could mean', async () => {
    data.useStore(store(catalog.map(a => a.slug)));
    const dc = await handlers.list_agencies({ near: 'Washington DC', km: 30 }) as Near;
    expect(dc.centredOn).toBe('the city of Washington, District of Columbia');
    expect(dc.agencies[0]).toMatch(/^Arlington Transit \(ART\) \| Virginia \| \d km$/);
    const bare = await handlers.list_agencies({ near: 'Washington', km: 30 }) as Near;
    expect(bare.near).toBe('Washington, District of Columbia');
    expect(bare.note).toMatch(/also matches the agency Washington State Ferries/);
    const bethesda = await handlers.list_agencies({ near: 'Bethesda', km: 60 }) as Near;
    expect(bethesda.agencies.find(a => a.startsWith('Maryland Transit'))).not.toMatch(/\| 0 km/);
    const arlington = await handlers.list_agencies({ near: 'Arlington', km: 30 }) as Near;
    expect(arlington.note).toMatch(/also Arlington, Virginia\. This used the largest/);
  });
  it("an agency's exact name still measures from its area", async () => {
    data.useStore(store(catalog.map(a => a.slug)));
    const ttc = await handlers.list_agencies({ near: 'TTC', km: 10 }) as Near;
    expect(ttc.centredOn).toBe("the centre of Toronto Transit Commission's area");
  });
});

describe('list_agencies near on a server with only some agencies (#1687)', () => {
  it('marks the agencies it has no schedules for and says so', async () => {
    data.useStore(store(['ttc']));
    const dc = await handlers.list_agencies({ near: 'Washington DC', km: 80 }) as Near;
    expect(dc.agencies).toContain(dc.agencies.find(a => a.startsWith('Arlington Transit'))!);
    expect(dc.agencies.every(a => a.endsWith('| not on this server'))).toBe(true);
    expect(dc.note).toMatch(/is in Atlas, but this server has schedules for only 1 agencies|are in Atlas, but this server has schedules for only 1 agencies/);
  });
  it('adds no mark where the server has every agency', async () => {
    data.useStore(store(catalog.map(a => a.slug)));
    const dc = await handlers.list_agencies({ near: 'Washington DC', km: 80 }) as Near;
    expect(dc.agencies.some(a => a.includes('not on this server'))).toBe(false);
    expect(dc.note).toBeUndefined();
  });
});
