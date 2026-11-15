import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { pinnedReadFor, readPinnedSidecars } from '../historyV2Pin.js';
import { parseMbtaArchiveIndex, pickZipSource } from '../history-v2-fetch-pinned.js';

// CIV-1430: a pinned rebuild reads each published period at its own refDate.
describe('pinned History v2 rebuild (CIV-1430)', () => {
  it('an old (legacy or re-picked) sidecar is read with the old picker at its refDate; a vote-picked one re-reads its week', () => {
    expect(pinnedReadFor({ refDate: '20181129', refDateQuality: { holiday: false, reason: 'x', repicked: { from: '20181122', reason: 'Thanksgiving' } } as never }))
      .toMatchObject({ refDate: '20181129', overrides: { referenceDate: '20181129', legacyReferenceDate: true } });
    expect(pinnedReadFor({ refDate: '20111215' })).toMatchObject({ overrides: { referenceDate: '20111215', legacyReferenceDate: true } });
    expect(pinnedReadFor({ refDate: '20261118', refDateQuality: { holiday: false, reason: 'v', pickedBy: 'vote', weekStart: '20261116' } as never }))
      .toMatchObject({ refDate: '20261118', overrides: { serviceAnchor: '20261116' } });
  });

  it('reads published sidecars keeping the file key order, and refuses a file whose period disagrees with its path', () => {
    const dir = mkdtempSync(join(tmpdir(), 'pin-'));
    mkdirSync(join(dir, 'history-v2', 'mbta'), { recursive: true });
    writeFileSync(join(dir, 'history-v2', 'mbta', '20181202.json'), JSON.stringify({ version: 2, slug: 'mbta', periodKey: '20181202', refDate: '20181129', routes: {}, refDateQuality: { holiday: false, reason: 'r' } }));
    const m = readPinnedSidecars(dir, 'mbta');
    expect(Object.keys(m.get('20181202')!)).toEqual(['version', 'slug', 'periodKey', 'refDate', 'routes', 'refDateQuality']);
    writeFileSync(join(dir, 'history-v2', 'mbta', '20191208.json'), JSON.stringify({ version: 2, slug: 'mbta', periodKey: 'other', refDate: '20191206', routes: {} }));
    expect(() => readPinnedSidecars(dir, 'mbta')).toThrow(/do not match the path/);
  });

  it('picks the zip by content hash, then by period key, then the MBTA archive feed for the period', () => {
    const index = parseMbtaArchiveIndex('feed_start_date,feed_end_date,feed_version,archive_url,archive_note\n20181128,20181202,"Fall 2018, v1",https://cdn.mbtace.com/archive/20181128.zip,\n20181203,20181231,"Winter",https://cdn.mbtace.com/archive/20181203.zip,\n');
    expect(pickZipSource('20181202', '20181129', 'abcdef0123456789ffff', ['gtfs/archive/mbta/20181202-abcdef0123456789.zip'], index).source)
      .toMatchObject({ kind: 'r2', key: 'gtfs/archive/mbta/20181202-abcdef0123456789.zip' });
    expect(pickZipSource('20181202', '20181129', undefined, ['gtfs/archive/mbta/20181202-1111111111111111.zip'], index).source).toMatchObject({ kind: 'r2' });
    expect(pickZipSource('20181202', '20181129', undefined, [], index).source).toMatchObject({ kind: 'url', url: 'https://cdn.mbtace.com/archive/20181128.zip' });
    expect(pickZipSource('20181202', '20190101', undefined, [], index)).toMatchObject({ source: null });
    // The file named by the period key wins even when refDate is past its listed end (MBTA 20110909, refDate 20111215).
    expect(pickZipSource('20181128', '20181215', undefined, [], index).source).toMatchObject({ kind: 'url', url: 'https://cdn.mbtace.com/archive/20181128.zip' });
    expect(pickZipSource('20181202', '20181129', undefined, [], null)).toMatchObject({ source: null });
  });

});
