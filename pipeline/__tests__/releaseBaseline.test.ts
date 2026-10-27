import { describe, expect, it } from 'vitest';
import { liveBaselinePrefixes, releaseBaselineReader } from '../releaseDiff';

// CIV-522: a failed publish run rewrote ~512 top-level atlas/<slug>.json files that never went public. Refresh and
// reprocess compared their new output against those files, so the failed run's output became the drop and gate baseline.
const route = (n: number) => JSON.stringify({
  type: 'FeatureCollection',
  features: Array.from({ length: n }, (_, i) => ({
    type: 'Feature',
    geometry: { type: 'LineString', coordinates: [[0, i], [1, i]] },
    properties: { routeId: `r${i}`, routeShortName: `${i}`, directionId: 0, day: 'Weekday', headway: 10 },
  })),
});
const pointer = JSON.stringify({ releaseId: 'release-abc', agencyPrefix: 'atlas/releases/release-abc/agencies' });

function bucket(files: Record<string, string>) {
  const reads: string[] = [];
  const get = async (key: string) => { reads.push(key); return files[key] ?? null; };
  return { get, reads };
}

describe('refresh and reprocess baselines read the public release (CIV-522)', () => {
  it('a stale top-level file never becomes the baseline when the release has the agency', async () => {
    const { get } = bucket({
      'atlas/release.json': pointer,
      'atlas/releases/release-abc/agencies/ttc.json': route(10),
      'atlas/ttc.json': route(3), // a failed run's unpublished output
    });
    const live = await releaseBaselineReader(get)('ttc');
    expect(live?.counts.routes).toBe(10);
  });

  it('falls back to the top-level file only for an agency the release does not have', async () => {
    const { get } = bucket({ 'atlas/release.json': pointer, 'atlas/hidden-one.json': route(4) });
    expect((await releaseBaselineReader(get)('hidden-one'))?.counts.routes).toBe(4);
  });

  it('reads the pointer once per run', async () => {
    const { get, reads } = bucket({
      'atlas/release.json': pointer,
      'atlas/releases/release-abc/agencies/a.json': route(1),
      'atlas/releases/release-abc/agencies/b.json': route(2),
    });
    const read = releaseBaselineReader(get);
    await Promise.all([read('a'), read('b'), read('a')]);
    expect(reads.filter(k => k === 'atlas/release.json').length).toBe(1);
  });

  it('with no readable pointer, says so and uses the top-level files as before', async () => {
    const notes: string[] = [];
    expect(await liveBaselinePrefixes(async () => null, r => notes.push(r))).toEqual(['atlas']);
    expect(await liveBaselinePrefixes(async () => 'not json', r => notes.push(r))).toEqual(['atlas']);
    expect(await liveBaselinePrefixes(async () => { throw new Error('HTTP 500'); }, r => notes.push(r))).toEqual(['atlas']);
    expect(await liveBaselinePrefixes(async () => JSON.stringify({ agencyPrefix: 'atlas/' }), r => notes.push(r))).toEqual(['atlas']);
    expect(notes.length).toBe(4);
  });

  it('puts the release prefix first, without a trailing slash', async () => {
    expect(await liveBaselinePrefixes(async () => JSON.stringify({ agencyPrefix: 'atlas/releases/release-abc/agencies/' }))).toEqual(['atlas/releases/release-abc/agencies', 'atlas']);
  });
});
