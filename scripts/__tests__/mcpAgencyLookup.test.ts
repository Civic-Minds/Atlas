import { describe, expect, it } from 'vitest';
import * as data from '../mcp/atlasData';
import type { AtlasStore } from '../../shared/mcpStore';

// #1676 and #1675: agency names find the agency meant, and a parent agency groups its feeds in every tool.
const catalog = [
  { slug: 'owen-sound', name: 'Owen Sound Transit' }, { slug: 'soundtransit', name: 'Sound Transit (Seattle)' },
  { slug: 'translink', name: 'TransLink (Vancouver)' }, { slug: 'c-tran-test', name: 'C-TRAN (Vancouver, WA)' },
  { slug: 'nyct-subway', name: 'MTA NYCT Subway' }, { slug: 'nyct-bus-bronx', name: 'MTA NYCT Bus (Bronx)' },
  { slug: 'go', name: 'GO Transit' }, { slug: 'upexpress', name: 'UP Express (Toronto)' },
  { slug: 'cta', name: 'Chicago Transit Authority (CTA)' }, { slug: 'durango', name: 'Durango Transit' },
  { slug: 'exo', name: 'exo (Trains)' }, { slug: 'exo-laurentides', name: 'exo (Laurentides)' },
];
const parentOf = (slug: string) => (slug.startsWith('nyct') ? 'MTA New York' : slug.startsWith('exo') ? 'exo' : null);
const store = {
  catalog: async () => catalog, available: async () => new Set(catalog.map(a => a.slug)),
  meta: async () => new Map(catalog.map(a => [a.slug, { shortName: '', parentAgency: parentOf(a.slug) }])),
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

  it('finds a service brand in route names only as whole words (#1682)', async () => {
    data.useStore({ ...store, catalog: async () => [{ slug: 'psta', name: 'PSTA' }, { slug: 'yrt', name: 'York Region Transit' }], available: async () => new Set(['psta', 'yrt']), rankAgencies: async () => [{ slug: 'psta', name: 'PSTA' }, { slug: 'yrt', name: 'York Region Transit' }], routeNameText: async () => ({ psta: '19 LARGO TRANSIT / TARPON SPRINGS', yrt: 'blue Viva Blue' }) } as unknown as AtlasStore);
    expect(await data.agenciesWithRouteName('go transit')).toEqual([]);
    expect((await data.agenciesWithRouteName('viva')).map(a => a.agency)).toEqual(['York Region Transit']);
    expect(data.hasWholeWords('Largo Transit', 'transit')).toBe(true);
    expect(data.hasWholeWords('Viva Blue', 'viv')).toBe(false);
  });

  it('finds a parent agency by its name or slug, never one of its feeds silently (#1806)', async () => {
    data.useStore(store);
    await expect(data.findAgency('MTA New York')).rejects.toThrow(/MTA New York is split across several feeds here: MTA NYCT Subway; MTA NYCT Bus \(Bronx\)/);
    await expect(data.findAgency('exo')).rejects.toThrow(/exo is split across several feeds here: exo \(Trains\); exo \(Laurentides\)/);
    await expect(data.findAgency('mta-new-york')).rejects.toThrow(/MTA New York is split/);
    expect((await data.findAgency('exo (Trains)'))?.slug).toBe('exo');
    expect((await data.findAgency('MTA NYCT Subway'))?.slug).toBe('nyct-subway');
    expect((await data.findAgency('exo', catalog.filter(a => a.slug === 'exo')))?.slug).toBe('exo');
    expect((await data.findAgencyEntry('exo'))?.members.map(m => m.slug)).toEqual(['exo', 'exo-laurentides']);
  });

  it('asks which agency when an id, short name or bracketed name fits two (#1869: "RTC" went to Québec silently)', async () => {
    const rtc = [{ slug: 'rtc', name: 'RTC (Québec)' }, { slug: 'rtcsnv', name: 'Regional Transportation Commission of Southern Nevada (RTC)' }, { slug: 'cta', name: 'Chicago Transit Authority (CTA)' }];
    data.useStore({ ...store, catalog: async () => rtc, available: async () => new Set(rtc.map(a => a.slug)), meta: async () => new Map(rtc.map(a => [a.slug, { shortName: '', parentAgency: null }])) } as unknown as AtlasStore);
    await expect(data.findAgency('RTC')).rejects.toThrow(/"RTC" matches several agencies: RTC \(Québec\); Regional Transportation Commission of Southern Nevada \(RTC\)/);
    expect((await data.findAgency('RTC (Québec)'))?.slug).toBe('rtc');
    expect((await data.findAgency('CTA'))?.slug).toBe('cta');
  });

  it('says a parent agency is in Atlas when this server has none of its feeds (#1806)', async () => {
    data.useStore({ ...store, available: async () => new Set(['go', 'cta']) } as unknown as AtlasStore);
    expect(await data.agencyNotOnThisServer('MTA New York')).toEqual({ name: 'MTA New York' });
    expect(await data.agencyNotOnThisServer('GO Transit')).toBeNull();
    data.useStore({ ...store, available: async () => new Set(['nyct-subway']) } as unknown as AtlasStore);
    expect(await data.agencyNotOnThisServer('MTA New York')).toBeNull();
    expect((await data.findAgency('MTA New York'))?.slug).toBe('nyct-subway');
  });
});

describe("an agency's routes in other agencies' files (#1911)", () => {
  const cat = [{ slug: 'soundtransit', name: 'Sound Transit (Seattle)' }, { slug: 'kingcountymetro', name: 'King County Metro (Seattle)' }, { slug: 'piercetransit', name: 'Pierce Transit' }, { slug: 'owen-sound', name: 'Owen Sound Transit' }];
  const routes: Record<string, string[]> = { kingcountymetro: ['556', '2'], piercetransit: ['2'], soundtransit: ['1 Line'], 'owen-sound': [] };
  const st = { ...store, catalog: async () => cat, available: async () => new Set(cat.map(a => a.slug)), summaries: async (slug: string) => (routes[slug] ?? []).map(n => ({ shortName: n, name: n, longName: null, mode: 'Bus' })) } as unknown as AtlasStore;
  const sound = cat[0] as unknown as Parameters<typeof data.routeInOtherFileNote>[0];

  it("points Sound Transit's 556 to King County Metro's file, not answering for it", async () => {
    data.useStore(st);
    const note = await data.routeInOtherFileNote(sound, '556', 'Weekday');
    expect(note).toMatch(/Sound Transit \(Seattle\)'s own file has no route "556" on Weekday/);
    expect(note).toMatch(/ST Express buses are in other agencies' schedule files here: King County Metro \(Seattle\) and Pierce Transit\./);
    expect(note).toMatch(/King County Metro \(Seattle\) has a route "556": if it's the one meant, call again with that agency\./);
  });

  it('names every file with a route of that number, since the rows do not say who runs it', async () => {
    data.useStore(st);
    expect(await data.routeInOtherFileNote(sound, '2', 'Weekday')).toMatch(/King County Metro \(Seattle\) and Pierce Transit have a route "2"/);
  });

  it('says none has it, and leaves other agencies to the usual message', async () => {
    data.useStore(st);
    expect(await data.routeInOtherFileNote(sound, '999', 'Weekday')).toMatch(/None of them has a route "999" on Weekday either/);
    expect(await data.routeInOtherFileNote(cat[3] as unknown as Parameters<typeof data.routeInOtherFileNote>[0], '556', 'Weekday')).toBeNull();
  });
});
