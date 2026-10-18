import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { displayNameFor, getReleaseAgency, primaryCity, pruneReleaseCache, summarize } from './build-agency-page-summaries';
import { bandCounts, FREQUENCY_BANDS } from '../shared/agencyPages';

function line(name: string, directionId: number, midday: number | null, extra: Record<string, unknown> = {}) {
  return {
    geometry: { type: 'LineString' },
    properties: {
      routeId: name, routeShortName: name, routeLongName: `${name} Street`, routeType: 3, directionId, day: 'Weekday', tier: 'frequent',
      headway: midday,
      headwayByPeriod: { midday, amPeak: midday, pmPeak: midday },
      headwayByPeriodSustained: { midday: midday != null, amPeak: midday != null, pmPeak: midday != null },
      periodCoverageHeadway: { midday, amPeak: midday, pmPeak: midday },
      headwayByHour: { '6': midday, '7': midday, '25': midday },
      ...extra,
    },
  };
}

describe('summarize', () => {
  it('records a route by the route card rule, judged by its slower direction (#821)', () => {
    const s = summarize([line('A', 0, 10), line('A', 1, 10), line('B', 0, 8), line('B', 1, 25), line('C', 0, 60), line('C', 1, 60)], 'x', '2026-10-01');
    expect(s.routeCount).toBe(3);
    expect(s.routes.map(r => [r.name, r.midday, r.am, r.pm])).toEqual([['A', 10, 10, 10], ['B', 25, 25, 25], ['C', 60, 60, 60]]);
    expect(s.routes[0].mode).toBe(3);
    expect(s.span).toEqual({ first: 6, last: 25 });
  });

  it('ignores other days and stops, and keeps routes with no midday service', () => {
    const s = summarize([line('A', 0, 10), line('A', 1, 10), line('N', 0, null), line('S', 0, 5, { day: 'Saturday' }), { geometry: { type: 'Point' }, properties: { day: 'Weekday' } }], 'x', null);
    expect(s.routeCount).toBe(2);
    expect(s.routes.find(r => r.name === 'N')?.midday).toBeNull();
    expect(s.lastRefreshedAt).toBeNull();
  });
});

describe('night routes and weekend service', () => {
  const night = (name: string, day = 'Weekday') => ({
    geometry: { type: 'LineString' },
    properties: {
      routeId: name, routeShortName: name, routeLongName: `${name} Blue Night`, routeType: 3, directionId: 0, day, tier: 'infrequent',
      headway: null,
      headwayByPeriod: { amPeak: null, midday: null, pmPeak: null, evening: null, late: null, overnight: 30 },
      headwayByPeriodSustained: { overnight: true },
      periodCoverageHeadway: { overnight: 30 },
      headwayByHour: { '25': 30, '26': 30 },
    },
  });

  it('records overnight and evening cadence from the route card rule', () => {
    const s = summarize([night('301'), line('A', 0, 10), line('A', 1, 10)], 'x', null);
    expect(s.routes.find(r => r.name === '301')).toMatchObject({ midday: null, am: null, pm: null, evening: null, overnight: 30 });
  });

  it('shows the map\'s number for unsustained daytime periods (CIV-237), and also records the overnight cadence', () => {
    const l = line('46', 0, 19, { headwayByPeriodSustained: { midday: false, amPeak: false, pmPeak: false }, headwayByPeriod: { midday: 19, amPeak: 13, pmPeak: 13, overnight: 17 } });
    const r = summarize([l], 'x', null).routes[0];
    expect([r.midday, r.am, r.pm, r.overnight]).toEqual([19, 19, 19, 17]);
  });

  it('leaves every period empty for a route with no service at all', () => {
    const s = summarize([line('N', 0, null)], 'x', null);
    expect([s.routes[0].evening, s.routes[0].overnight]).toEqual([null, null]);
  });

  it('records whether the release has Saturday and Sunday service', () => {
    const s = summarize([line('A', 0, 10), line('A', 1, 10), line('A', 0, 12, { day: 'Saturday' })], 'x', null);
    expect([s.sat, s.sun]).toEqual([true, false]);
    expect([summarize([line('A', 0, 10)], 'x', null).sat, summarize([line('A', 0, 10)], 'x', null).sun]).toEqual([false, false]);
  });
});

describe('names', () => {
  const base = { slug: 'x', name: 'Toronto Transit Commission', cities: ['Etobicoke, Ontario'], region: 'Ontario' };

  it('uses the config displayArea as the primary city, else the first listed city', () => {
    expect(primaryCity({ ...base, displayArea: 'Toronto' })).toBe('Toronto');
    expect(primaryCity(base)).toBe('Etobicoke');
  });

  it('uses labelPlace, and an empty one drops the bracket', () => {
    const york = { slug: 'yrt', name: 'York Region Transit', cities: ['Vaughan, Ontario'], region: 'Ontario' };
    expect(displayNameFor({ ...york, shortName: 'YRT', labelPlace: 'York Region' })).toBe('YRT (York Region)');
    expect(displayNameFor({ ...york, labelPlace: '' })).toBe('York Region Transit');
  });

  it('drops the first-city bracket when the name already names a region, county or district', () => {
    expect(displayNameFor({ slug: 'd', name: 'Durham Region Transit', cities: ['Oshawa, Ontario'], region: 'Ontario' })).toBe('Durham Region Transit');
    expect(displayNameFor({ slug: 'b', name: 'Broward County Transit', cities: ['Pompano Beach, Florida'], region: 'Florida' })).toBe('Broward County Transit');
    expect(displayNameFor({ slug: 'm', name: 'Marin Transit', cities: ['San Rafael, California'], region: 'California' })).toBe('Marin Transit (San Rafael)');
    // a curated displayArea is kept even on a regional name
    expect(displayNameFor({ slug: 'g', name: 'GO Transit', displayArea: 'Greater Toronto & Hamilton Area', cities: ['Mississauga, Ontario'], region: 'Ontario' })).toBe('GO Transit (Greater Toronto & Hamilton Area)');
  });

  it('puts the short name first with the city in brackets, falling back to the full name', () => {
    expect(displayNameFor({ ...base, displayArea: 'Toronto', shortName: 'TTC' })).toBe('TTC (Toronto)');
    expect(displayNameFor({ ...base, displayArea: 'Toronto' })).toBe('Toronto Transit Commission');
    expect(displayNameFor({ slug: 'h', name: 'Halifax Transit', displayArea: 'Halifax' })).toBe('Halifax Transit');
  });
});

describe('stretch filter fields (frequency focus step 7)', () => {
  const stretch = (name: string, dir: number, own: number, filter: Record<string, number | null>, range: Record<string, [number, number] | null>, extra: Record<string, unknown> = {}) =>
    line(name, dir, own, { routeFilterHeadwayByPeriod: filter, routeRunsByPeriod: Object.fromEntries(Object.keys(filter).map(k => [k, true])), stretchPeriodRange: range, ...extra });

  it('a route with a slower branch (TTC 507-style: main every 8, branch every 25) records the filter value with the range, in the 21-30 band', () => {
    const f = { amPeak: 25, midday: 25, pmPeak: 25, evening: null, late: null, overnight: null };
    const rg = { amPeak: [8, 25] as [number, number], midday: [8, 25] as [number, number], pmPeak: [8, 25] as [number, number] };
    const r = summarize([stretch('507', 0, 8, f, rg), stretch('507', 1, 8, f, rg)], 'x', null).routes[0];
    expect([r.midday, r.am, r.pm]).toEqual([25, 25, 25]);
    expect(r.shared?.midday).toBe(8);
    expect(bandCounts([r])[FREQUENCY_BANDS.findIndex(b => b.key === 'b30')]).toBe(1);
  });

  it('a route whose own rows read slower than its filter value (TTC 134-style) records the filter value 15', () => {
    const f = { amPeak: 15, midday: 15, pmPeak: 15, evening: null, late: null, overnight: null };
    const r = summarize([stretch('134', 0, 40, f, {}), stretch('134', 1, 40, f, {})], 'x', null).routes[0];
    expect(r.midday).toBe(15);
    expect(r.shared?.midday).toBeUndefined();
    expect(bandCounts([r])[FREQUENCY_BANDS.findIndex(b => b.key === 'b15')]).toBe(1);
  });

  it('a period the filter calls no regular service records no number and is not limited', () => {
    const f = { amPeak: 20, midday: null, pmPeak: 20, evening: null, late: null, overnight: null };
    const r = summarize([stretch('X', 0, 20, f, {}), stretch('X', 1, 20, f, {})], 'x', null).routes[0];
    expect(r.midday).toBeNull();
    expect(r.limited ?? []).not.toContain('midday');
  });
});

describe('summarize: areas per route (CIV-274)', () => {
  const sq: Array<[number, number]> = [[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]];
  const boundaries = { metro: { bbox: [0, 0, 10, 10] as [number, number, number, number], polygons: [[sq]] } };
  const stop = (id: string, lon: number, lat: number, routeIds: string[]) => ({ geometry: { type: 'Point', coordinates: [lon, lat] }, properties: { stopId: id, routeIds } });
  it('tags a route with the areas holding 2+ of its stops, from every direction', () => {
    const s = summarize([
      line('66', 0, 30), line('66', 1, 30), line('21', 0, 30),
      stop('a', 1, 1, ['66']), stop('b', 2, 2, ['66']), stop('c', 20, 5, ['66', '21']), stop('d', 9, 9, ['21']),
    ] as any, 'x', null, boundaries);
    expect(Object.fromEntries(s.routes.map(r => [r.name, r.areas]))).toEqual({ '21': [], '66': ['metro'] });
  });
  it('leaves areas out without boundaries', () => {
    expect(summarize([line('66', 0, 30)] as any, 'x', null).routes[0].areas).toBeUndefined();
  });
});

describe('release cache (CIV-315)', () => {
  const release = { releaseId: 'release-test', agencyPrefix: 'atlas/releases/release-test/agencies' };
  const dirs: string[] = [];
  afterEach(() => {
    vi.unstubAllGlobals();
    for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
  });
  const cacheRoot = () => { const d = mkdtempSync(join(tmpdir(), 'agency-pages-cache-')); dirs.push(d); return d; };

  it('fetches each agency once and reads it from the cache after that', async () => {
    const root = cacheRoot();
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ features: [{ geometry: { type: 'Point' }, properties: {} }] })));
    vi.stubGlobal('fetch', fetchMock);
    const first = await getReleaseAgency(release, 'ttc', root);
    const second = await getReleaseAgency(release, 'ttc', root);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(second).toEqual(first);
    expect(readdirSync(join(root, 'release-test'))).toEqual(['ttc.json']);
  });

  const routeFile = JSON.stringify({ features: [{ geometry: { type: 'Point' }, properties: {} }] });

  it('caches nothing when every download is incomplete, after retrying', async () => {
    vi.useFakeTimers();
    try {
      const root = cacheRoot();
      const fetchMock = vi.fn(async () => new Response('{"features": ['));
      vi.stubGlobal('fetch', fetchMock);
      const pending = expect(getReleaseAgency(release, 'ttc', root)).rejects.toThrow();
      await vi.runAllTimersAsync();
      await pending;
      expect(fetchMock).toHaveBeenCalledTimes(4);
      expect(existsSync(join(root, 'release-test', 'ttc.json'))).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it('retries a truncated download and caches the complete one', async () => {
    vi.useFakeTimers();
    try {
      const root = cacheRoot();
      const fetchMock = vi.fn()
        .mockResolvedValueOnce(new Response('{"features": ['))
        .mockResolvedValueOnce(new Response(routeFile));
      vi.stubGlobal('fetch', fetchMock);
      const pending = getReleaseAgency(release, 'ttc', root);
      await vi.runAllTimersAsync();
      expect((await pending).features).toHaveLength(1);
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(existsSync(join(root, 'release-test', 'ttc.json'))).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not cache JSON without a features array', async () => {
    vi.useFakeTimers();
    try {
      const root = cacheRoot();
      vi.stubGlobal('fetch', vi.fn(async () => new Response('{"error":"not found"}')));
      const pending = expect(getReleaseAgency(release, 'ttc', root)).rejects.toThrow(/shape/);
      await vi.runAllTimersAsync();
      await pending;
      expect(existsSync(join(root, 'release-test', 'ttc.json'))).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it('fetches again over a corrupt cached file', async () => {
    const root = cacheRoot();
    mkdirSync(join(root, 'release-test'), { recursive: true });
    writeFileSync(join(root, 'release-test', 'ttc.json'), '{"features": [');
    const fetchMock = vi.fn(async () => new Response(routeFile));
    vi.stubGlobal('fetch', fetchMock);
    expect((await getReleaseAgency(release, 'ttc', root)).features).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect((await getReleaseAgency(release, 'ttc', root)).features).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('ignores a leftover .part file', async () => {
    const root = cacheRoot();
    mkdirSync(join(root, 'release-test'), { recursive: true });
    writeFileSync(join(root, 'release-test', 'ttc.json.part'), routeFile);
    const fetchMock = vi.fn(async () => new Response(routeFile));
    vi.stubGlobal('fetch', fetchMock);
    await getReleaseAgency(release, 'ttc', root);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(readdirSync(join(root, 'release-test'))).toEqual(['ttc.json']);
  });

  it('does not read another release from the cache', async () => {
    const root = cacheRoot();
    const fetchMock = vi.fn(async () => new Response(routeFile));
    vi.stubGlobal('fetch', fetchMock);
    await getReleaseAgency(release, 'ttc', root);
    await getReleaseAgency({ releaseId: 'release-next', agencyPrefix: 'atlas/releases/release-next/agencies' }, 'ttc', root);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls.map(c => String(c[0]))).toEqual([
      expect.stringContaining('release-test/agencies/ttc.json'),
      expect.stringContaining('release-next/agencies/ttc.json'),
    ]);
  });

  it('prunes every release folder but the current one', () => {
    const root = cacheRoot();
    for (const id of ['release-old', 'release-test', 'release-older']) mkdirSync(join(root, id));
    writeFileSync(join(root, 'release-test', 'ttc.json'), routeFile);
    pruneReleaseCache('release-test', root);
    expect(readdirSync(root)).toEqual(['release-test']);
    expect(readdirSync(join(root, 'release-test'))).toEqual(['ttc.json']);
  });

});
