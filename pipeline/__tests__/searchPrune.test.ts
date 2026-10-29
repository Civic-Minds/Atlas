import { describe, expect, it } from 'vitest';
import { planSearchIndex, uploadSearchIndex, type SearchAgencyInput } from '../searchIndex';
import { planSearchPrune, pruneSearchIndex, type SearchObject } from '../searchPrune';

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.parse('2026-11-01T12:00:00Z');

const agency = (slug: string, stops: Record<string, string>): SearchAgencyInput => ({
  slug,
  routes: { features: [] },
  stops: Object.fromEntries(Object.entries(stops).map(([id, name], i) => [id, { name, lat: 40 + i, lon: -80 }])),
});

/** An in-memory bucket: build-pmtiles' upload, then a prune over it. */
function bucket() {
  const files = new Map<string, { body: string; at: number }>();
  let clock = NOW - 10 * DAY;
  const io = {
    getText: async (key: string) => files.get(key)?.body ?? null,
    listObjects: async (prefix: string): Promise<SearchObject[]> => [...files.entries()]
      .filter(([k]) => k.startsWith(prefix))
      .map(([key, f]) => ({ key, lastModified: new Date(f.at), size: f.body.length })),
    deleteKeys: async (keys: string[]) => { for (const k of keys) files.delete(k); return keys.length; },
    now: () => NOW,
    log: () => {},
  };
  const publish = async (releaseId: string, agencies: SearchAgencyInput[], at = clock) => {
    clock = at;
    const prefix = `atlas/releases/${releaseId}`;
    const plan = planSearchIndex(agencies, prefix);
    await uploadSearchIndex(plan.files, {
      listKeys: async p => [...files.keys()].filter(k => k.startsWith(p)),
      put: async (key, body) => { files.set(key, { body, at: clock }); },
      runWithConcurrency: async tasks => { for (const t of tasks) await t(); },
    });
    files.set(`${prefix}/manifest.json`, { body: '{}', at: clock });
    files.set('atlas/release.json', { body: JSON.stringify({ releaseId }), at: clock });
  };
  return { files, io, publish, dropRelease: (id: string) => { for (const k of [...files.keys()]) if (k.startsWith(`atlas/releases/${id}/`)) files.delete(k); } };
}

describe('search prune (CIV-1056)', () => {
  it('keeps files any release still in R2 names, and deletes only the rest', async () => {
    const b = bucket();
    await b.publish('release-a', [agency('ttc', { 1: 'Union Station', 2: 'King St' })], NOW - 9 * DAY);
    await b.publish('release-b', [agency('ttc', { 1: 'Union Station', 2: 'Queen St' })], NOW - 8 * DAY);
    // Both releases still in R2: nothing goes, even release-a's "kin" split.
    const both = await pruneSearchIndex({ dryRun: false }, b.io);
    expect(both.delete).toEqual([]);
    expect(both.keep.length).toBeGreaterThan(0);

    // The release prune removes release-a: its own split and page go, the shared "uni" split stays.
    b.dropRelease('release-a');
    const dry = await pruneSearchIndex({ dryRun: true }, b.io);
    expect(dry.delete.length).toBeGreaterThan(0);
    expect(dry.deleted).toBe(0);
    expect(b.files.size).toBeGreaterThan(0);
    const before = [...b.files.keys()];
    const run = await pruneSearchIndex({ dryRun: false }, b.io);
    expect(run.deleted).toBe(dry.delete.length);
    expect([...b.files.keys()].filter(k => !before.includes(k))).toEqual([]);
    // What release-b names is all still there.
    const again = await pruneSearchIndex({ dryRun: true }, b.io);
    expect(again.delete).toEqual([]);
    expect(again.keep.length).toBe(run.keep.length);
  });

  it('keeps an unpublished newer release\'s files, and anything uploaded in the last day', async () => {
    const b = bucket();
    await b.publish('release-a', [agency('ttc', { 1: 'Union Station' })], NOW - 9 * DAY);
    const live = b.files.get('atlas/release.json')!;
    // release-b uploaded but never published (the pointer still says release-a).
    await b.publish('release-b', [agency('ttc', { 1: 'Bathurst' })], NOW - 8 * DAY);
    b.files.set('atlas/release.json', live);
    expect((await pruneSearchIndex({ dryRun: true }, b.io)).delete).toEqual([]);
    // A split uploaded an hour ago that no index names yet (a build in progress).
    b.files.set('atlas/search/stops/0123456789abcdef.json', { body: '{}', at: NOW - 60 * 60 * 1000 });
    const plan = await pruneSearchIndex({ dryRun: true }, b.io);
    expect(plan.recent).toEqual(['atlas/search/stops/0123456789abcdef.json']);
    expect(plan.delete).toEqual([]);
  });

  it('refuses when the live release has no search index or a page it names is missing', async () => {
    const b = bucket();
    await b.publish('release-a', [agency('ttc', { 1: 'Union Station' })]);
    b.files.delete('atlas/releases/release-a/search/index.json');
    await expect(pruneSearchIndex({ dryRun: true }, b.io)).rejects.toThrow(/no search index/);

    const c = bucket();
    await c.publish('release-a', [agency('ttc', { 1: 'Union Station' })]);
    const page = [...c.files.keys()].find(k => k.startsWith('atlas/search/pages/'))!;
    c.files.delete(page);
    await expect(pruneSearchIndex({ dryRun: false }, c.io)).rejects.toThrow(/could not be read/);
    expect([...c.files.keys()].some(k => k.startsWith('atlas/search/stops/'))).toBe(true);
  });

  it('never touches a file under atlas/search/ that is not a content-addressed split or page', () => {
    const old = new Date(NOW - 30 * DAY);
    const plan = planSearchPrune({
      objects: [
        { key: 'atlas/search/stops/0123456789abcdef.json', lastModified: old, size: 1 },
        { key: 'atlas/search/README.txt', lastModified: old, size: 1 },
        { key: 'atlas/search/stops/kept0123456789ab.json', lastModified: old, size: 1 },
      ],
      referenced: new Set(),
      now: NOW,
    });
    expect(plan.delete).toEqual(['atlas/search/stops/0123456789abcdef.json']);
    expect(plan.foreign).toEqual(['atlas/search/README.txt', 'atlas/search/stops/kept0123456789ab.json']);
  });
});
