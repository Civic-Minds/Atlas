import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { pinnedReadFor, readPinnedSidecars } from '../historyV2Pin.js';
import { mdbDatasetsAsArchive, mdbFeedIdOf, parseMbtaArchiveIndex, pickMdbSource, pickZipSource } from '../history-v2-fetch-pinned.js';

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

  // CIV-1862: past periods with no archived zip read the Mobility Database dataset in force on refDate.
  it('reads the MDB feed id from the agency config', () => {
    expect(mdbFeedIdOf({ mdbFeedUrl: 'https://files.mobilitydatabase.org/mdb-2253/latest.zip', feedUrl: 'https://x/y.zip' })).toBe('mdb-2253');
    expect(mdbFeedIdOf({ feedUrl: 'https://files.mobilitydatabase.org/mdb-528/latest.zip' })).toBe('mdb-528');
    expect(mdbFeedIdOf({ feedUrl: 'https://metro.kingcounty.gov/gtfs/google_transit.zip' })).toBeNull();
  });

  it('keeps one MDB dataset per file, picks the one in force on refDate downloaded last before it', () => {
    const ds = (id: string, at: string, hash: string, start: string, end: string) =>
      ({ id, downloaded_at: `${at}T05:00:00Z`, hosted_url: `https://files.mobilitydatabase.org/mdb-1/${id}.zip`, hash, service_date_range_start: start, service_date_range_end: end });
    const feeds = mdbDatasetsAsArchive([
      ds('a1', '2019-09-01', 'h1', '2019-09-01', '2019-12-31'),
      ds('a2', '2019-09-02', 'h1', '2019-09-01', '2019-12-31'), // same file again: kept once
      ds('b', '2019-11-01', 'h2', '2019-11-01', '2020-03-01'),
      { id: 'c', downloaded_at: '2019-10-01T00:00:00Z', hosted_url: 'https://x/c.zip', hash: 'h3' }, // no window: left out
    ]);
    expect(feeds.map(f => f.url)).toEqual(['https://files.mobilitydatabase.org/mdb-1/a1.zip', 'https://files.mobilitydatabase.org/mdb-1/b.zip']);
    // Both in force on 2019-11-20; b was downloaded last before it.
    expect(pickMdbSource('20191120', feeds).source).toMatchObject({ kind: 'url', url: 'https://files.mobilitydatabase.org/mdb-1/b.zip' });
    // Only a1 in force on 2019-10-15.
    expect(pickMdbSource('20191015', feeds).source).toMatchObject({ url: 'https://files.mobilitydatabase.org/mdb-1/a1.zip' });
    // A dataset downloaded on refDate itself counts as on or before it.
    expect(pickMdbSource('20190901', [feeds[1], feeds[0]]).source).toMatchObject({ url: 'https://files.mobilitydatabase.org/mdb-1/a1.zip' });
    expect(pickMdbSource('20210101', feeds)).toMatchObject({ source: null });
  });

});
