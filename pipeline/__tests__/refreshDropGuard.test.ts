import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { countArtifacts, dropGuardRefusal, type ArtifactCounts } from '../archiveSelection.js';
import { refreshedFeedExpiry, stampFeedMeta } from '../refreshMeta.js';
import { applyOverrides, evaluateAgency, type ArtifactSummary } from '../releaseDiff.js';

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

  it('counts routes and stops from the route and stops artifacts', () => {
    const files: Record<string, string> = {
      'atlas/sct.json': JSON.stringify({ features: [
        { geometry: { type: 'LineString' }, properties: { routeId: '1' } },
        { geometry: { type: 'Point' }, properties: {} },
      ] }),
      'atlas/sct-stops.json': JSON.stringify({ a: {}, b: {} }),
    };
    expect(countArtifacts(files['atlas/sct.json'], files['atlas/sct-stops.json'])).toEqual({ stops: 2, stopPoints: 1, routes: 1 });
  });

  it('refresh checks the release diff gate before writing any artifact, archive, metadata or history', () => {
    const guard = refreshSource.indexOf('evaluateRun(');
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
    expect(refreshSource).toMatch(/allowMissingLive: true/);
    // --allow and --allow-drop are parsed out before slugs are read.
    expect(refreshSource).toMatch(/const rawArgs = gateOverrides\.rest;/);
  });

  it('reprocess keeps refusing when live data cannot be read, and gates the whole batch before any R2 write', () => {
    expect(reprocessSource).toMatch(/evaluateRun\(\{[\s\S]*?allowMissingLive: false,/);
    const gate = reprocessSource.indexOf('await gateProcessedRows(rows');
    const publish = reprocessSource.indexOf('publishRow(row,');
    expect(gate).toBeGreaterThan(0);
    expect(publish).toBeGreaterThan(gate);
    // The only R2 artifact write is inside publishRow.
    expect(reprocessSource.match(/r2Put\(/g)).toHaveLength(1);
    expect(reprocessSource.indexOf('r2Put(')).toBeGreaterThan(reprocessSource.indexOf('async function publishRow'));
  });

  it('reprocess --write applies the country-launch gate before processing and before any write (#668)', () => {
    expect(reprocessSource.indexOf('reprocessCountryLaunchSkip(')).toBeLessThan(reprocessSource.indexOf('const targets ='));
    expect(reprocessSource).toMatch(/const targets = selected\.filter\(agency => shouldProcess\(agency\) && !countrySkips\.has\(agency\.slug\)\)/);
    const assertAt = reprocessSource.indexOf('assertCountryMayWriteToR2({');
    expect(assertAt).toBeGreaterThan(reprocessSource.indexOf('async function publishRow'));
    expect(reprocessSource.indexOf('r2Put(')).toBeGreaterThan(assertAt);
  });

  it('publish-data-release runs the gate before moving the release pointer', () => {
    const publishSource = readFileSync(resolve('pipeline/publish-data-release.ts'), 'utf8');
    const gate = publishSource.indexOf('evaluateRun(');
    expect(gate).toBeGreaterThan(0);
    expect(publishSource.indexOf("r2Put('atlas/release.json'")).toBeGreaterThan(publishSource.indexOf('if (gateReport.blocked.length)'));
    expect(publishSource.indexOf('if (gateReport.blocked.length)')).toBeGreaterThan(gate);
  });

  it('refresh-release forwards gate overrides to publish and never reads them as slugs', () => {
    const releaseSource = readFileSync(resolve('pipeline/refresh-release.ts'), 'utf8');
    expect(releaseSource).toMatch(/requestedSlugs = overrides\.rest\.filter/);
    expect(releaseSource).toMatch(/run\('publish-data-release', overrideArgs\(overrides\)\)/);
  });
});

describe('refresh gate reads the expiry refresh records (#1304)', () => {
  // MAX (2026-11-02 weekly refresh): feed_info ends 20350201, calendar.txt's last service date is 20250531.
  const max = { feedExpiry: '20350201', peekedExpiry: '20350201', calendarExpiry: '20350201', calendarOnlyEnd: '20250531', todayYmd: '2026-11-02' };
  const live: ArtifactSummary = { counts: { stops: 1224, stopPoints: 1224, routes: 18 }, modes: ['Bus'], contentHash: 'live', routeSignatures: [], weekdayHeadways: {}, weekdayTiers: {}, weekdayDirectionHeadway: {}, centroid: null };

  it('gives the gate the same end stampFeedMeta records', () => {
    expect(refreshedFeedExpiry(max)).toBe('20250531');
    const agency = { slug: 'max-transit' } as Parameters<typeof stampFeedMeta>[0];
    stampFeedMeta(agency, { ...max, feedVersion: '20240531', peekedVersion: '20240531' });
    expect(agency.lastFeedExpiry).toBe(refreshedFeedExpiry(max));
  });

  it('refuses MAX\'s changed output at refresh, so it keeps its live file and the publish only warns', () => {
    const changed: ArtifactSummary = { ...live, contentHash: 'rebuilt' };
    const atRefresh = evaluateAgency({ slug: 'max-transit', live, next: changed, service: { end: refreshedFeedExpiry(max) }, allowMissingLive: true }, [], '20261102');
    expect(applyOverrides(atRefresh, { allow: [], allowDrop: false }).blocked).toEqual(['max-transit']);
    // The release then carries the live file: unchanged, so expired is yellow and the publish goes ahead.
    const atPublish = evaluateAgency({ slug: 'max-transit', live, next: live, service: { end: '20250531' }, allowMissingLive: true }, [], '20261102');
    expect(applyOverrides(atPublish, { allow: [], allowDrop: false }).blocked).toEqual([]);
  });

  it('refresh.ts passes that end to its gate', () => {
    expect(refreshSource).toMatch(/const serviceEnd = refreshedFeedExpiry\(\{ feedExpiry, peekedExpiry, .*calendarExpiry: keptCalendarExpiry, calendarOnlyEnd \}\);/);
    expect(refreshSource).toMatch(/service: \{ start: feedStart, end: serviceEnd,/);
  });
});
