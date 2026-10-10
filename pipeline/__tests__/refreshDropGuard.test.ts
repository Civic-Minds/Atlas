import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { dropGuardRefusal, readLiveArtifactCounts, type ArtifactCounts } from '../archiveSelection.js';

// refresh.ts runs its CLI on import, so these tests exercise the shared guard
// with refresh's options and pin how refresh.ts wires it up.
const refreshSource = readFileSync(resolve('pipeline/refresh.ts'), 'utf8');
const reprocessSource = readFileSync(resolve('pipeline/reprocess-derived-artifacts.ts'), 'utf8');

// sct in the 2026-10-10 release dry run: 25 routes / 2283 stops live, 10 / 1010 refreshed.
const sctLive: ArtifactCounts = { stops: 2283, stopPoints: 2283, routes: 25 };
const sctRefreshed: ArtifactCounts = { stops: 1010, stopPoints: 1010, routes: 10 };

describe('refresh drop guard', () => {
  it('refuses a drop of more than 20% without --allow-drop', () => {
    expect(dropGuardRefusal(sctLive, sctRefreshed, { allowDrop: false, allowMissingLive: true }))
      .toMatch(/stops 2283 -> 1010.*routes 25 -> 10.*--allow-drop/);
  });

  it('allows the same drop with --allow-drop', () => {
    expect(dropGuardRefusal(sctLive, sctRefreshed, { allowDrop: true, allowMissingLive: true })).toBeNull();
  });

  it('allows small changes', () => {
    expect(dropGuardRefusal(sctLive, { stops: 2000, stopPoints: 2000, routes: 24 }, { allowDrop: false, allowMissingLive: true })).toBeNull();
  });

  it('lets refresh publish an agency with no live artifact, but reprocess refuses it', () => {
    expect(dropGuardRefusal(null, sctRefreshed, { allowDrop: false, allowMissingLive: true })).toBeNull();
    expect(dropGuardRefusal(null, sctRefreshed, { allowDrop: false, allowMissingLive: false })).toMatch(/could not be read/);
    expect(dropGuardRefusal(null, sctRefreshed, { allowDrop: true, allowMissingLive: false })).toBeNull();
  });

  it('reads live counts from the route and stops artifacts', async () => {
    const files: Record<string, string> = {
      'atlas/sct.json': JSON.stringify({ features: [
        { geometry: { type: 'LineString' }, properties: { routeId: '1' } },
        { geometry: { type: 'Point' }, properties: {} },
      ] }),
      'atlas/sct-stops.json': JSON.stringify({ a: {}, b: {} }),
    };
    const get = async (key: string) => files[key] ?? null;
    expect(await readLiveArtifactCounts('sct', get)).toEqual({ stops: 2, stopPoints: 1, routes: 1 });
    expect(await readLiveArtifactCounts('missing', get)).toBeNull();
  });

  it('refresh checks the guard before writing any artifact, archive, metadata or history', () => {
    const guard = refreshSource.indexOf('dropGuardRefusal(');
    expect(guard).toBeGreaterThan(0);
    for (const write of [
      'r2Put(`atlas/${agency.slug}.json`',
      'r2PutArchiveJson(stopSnapshotKey',
      'r2PutArchive(`gtfs/archive/${agency.slug}/',
      'stampFeedMeta(agency,',
      'writeHistorySnapshot(agency.slug',
    ]) {
      const at = refreshSource.indexOf(write);
      expect(at, write).toBeGreaterThan(guard);
    }
    expect(refreshSource).toMatch(/allowDrop, allowMissingLive: true/);
    expect(refreshSource).toMatch(/FLAG_ARGS = new Set\(\[[^\]]*ALLOW_DROP_FLAG/);
  });

  it('reprocess keeps refusing when live data cannot be read', () => {
    expect(reprocessSource).toMatch(/dropGuardRefusal\(row\.liveCounts, row\.outputCounts, \{ allowDrop, allowMissingLive: false \}\)/);
  });
});
