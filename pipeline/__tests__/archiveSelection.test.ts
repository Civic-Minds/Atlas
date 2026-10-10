import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import {
  archiveKeyServiceDate,
  countArtifacts,
  includeHiddenArgError,
  isReprocessTarget,
  feedDateRefusal,
  outputDropRefusal,
  peekFeedDates,
  selectArchiveForAgency,
  type ArchiveObject,
} from '../archiveSelection.js';

const obj = (slug: string, name: string, iso: string | null): ArchiveObject => ({
  key: `gtfs/archive/${slug}/${name}`,
  lastModified: iso ? new Date(iso) : null,
});

describe('archiveKeyServiceDate', () => {
  it('reads the leading service date and ignores undated names', () => {
    expect(archiveKeyServiceDate('gtfs/archive/a/20261128-a4634dda6cc46dcb.zip')).toBe('20261128');
    expect(archiveKeyServiceDate('gtfs/archive/a/20270501.zip')).toBe('20270501');
    expect(archiveKeyServiceDate('gtfs/archive/a/unknown-20260813-b0eaae35.zip')).toBeNull();
    expect(archiveKeyServiceDate('gtfs/archive/a/AUG17_3_1.zip')).toBeNull();
  });
});

describe('selectArchiveForAgency', () => {
  it('sun-tran: picks the newest upload, not the alphabetically last unknown- zip', () => {
    const objects = [
      obj('sun-tran', '20260516.zip', '2026-08-10T21:28:23Z'),
      obj('sun-tran', '20261128-a4634dda6cc46dcb.zip', '2026-08-24T18:06:47Z'),
      obj('sun-tran', 'unknown-20260813-b0eaae3599dbfe3e05cf69e3.zip', '2026-08-13T22:48:25Z'),
    ];
    const selection = selectArchiveForAgency(objects, { lastFeedExpiry: '20261128' });
    expect(selection).toMatchObject({ ok: true, key: 'gtfs/archive/sun-tran/20261128-a4634dda6cc46dcb.zip' });
  });

  it('communitytransit: ignores the legacy AUG17 zip that sorts last', () => {
    const objects = [
      obj('communitytransit', '20180922.zip', '2026-06-29T20:58:53Z'),
      obj('communitytransit', '20251212.zip', '2026-06-29T20:59:26Z'),
      obj('communitytransit', '20261211-0318aacc3c70915f.zip', '2026-10-07T01:12:40Z'),
      obj('communitytransit', '20261211-9afc11cb647f03d6.zip', '2026-10-03T16:50:01Z'),
      obj('communitytransit', 'AUG17_3_1.zip', '2026-06-29T20:58:48Z'),
    ];
    expect(selectArchiveForAgency(objects, { lastFeedExpiry: '20261211' }))
      .toMatchObject({ ok: true, key: 'gtfs/archive/communitytransit/20261211-0318aacc3c70915f.zip' });
  });

  it('art: orders hash variants of the same expiry by upload time', () => {
    const objects = [
      obj('art', '20271231-59c8c21b697a68b9.zip', '2026-10-03T16:54:25Z'),
      obj('art', '20271231-a6648eb7d6754139.zip', '2026-10-07T01:16:44Z'),
      obj('art', '20271231-ac63e8975163dca3.zip', '2026-09-14T12:39:27Z'),
    ];
    expect(selectArchiveForAgency(objects, { lastFeedExpiry: '20271231' }))
      .toMatchObject({ ok: true, key: 'gtfs/archive/art/20271231-a6648eb7d6754139.zip' });
  });

  it('norta: a later backfill of an old feed does not beat the current one', () => {
    const objects = [
      obj('norta', '20200202.zip', '2026-09-17T17:11:18Z'),
      obj('norta', '20210506.zip', '2026-09-17T17:13:45Z'),
      obj('norta', '20270124-3b32471680f57363.zip', '2026-08-27T21:09:32Z'),
    ];
    expect(selectArchiveForAgency(objects, { lastFeedExpiry: '20270124' }))
      .toMatchObject({ ok: true, key: 'gtfs/archive/norta/20270124-3b32471680f57363.zip' });
  });

  it('path: a bulk migration picks the latest service date, leaving the expiry check to refuse it', () => {
    const objects = [
      obj('path', '20240903.zip', '2026-09-04T21:20:28Z'),
      obj('path', '20250522.zip', '2026-09-04T21:20:31Z'),
      obj('path', 'en.zip', '2026-09-04T21:20:07Z'),
    ];
    const selection = selectArchiveForAgency(objects, { lastFeedExpiry: '20260601' });
    expect(selection).toMatchObject({ ok: true, key: 'gtfs/archive/path/20250522.zip' });
    expect(feedDateRefusal('20250522', '20260601', '20261010')).toMatch(/before today/);
  });

  it('refuses when upload order and service dates disagree and nothing matches the live feed', () => {
    const objects = [
      obj('grt', '20260426-071369b92e6aeb7d.zip', '2026-10-07T00:00:00Z'),
      obj('grt', '20261220-aaaaaaaaaaaaaaaa.zip', '2026-09-01T00:00:00Z'),
    ];
    const selection = selectArchiveForAgency(objects, { lastFeedExpiry: '20261129' });
    expect(selection).toMatchObject({ ok: false, noArchive: false });
    expect(selection.reason).toMatch(/cannot tell which archived zip is newest/);
  });

  it('refuses tied upload times with no service dates', () => {
    const objects = [
      obj('x', 'unknown-aaaa.zip', '2026-10-08T23:16:33Z'),
      obj('x', 'unknown-bbbb.zip', '2026-10-08T23:16:33Z'),
    ];
    expect(selectArchiveForAgency(objects, { lastFeedExpiry: null })).toMatchObject({ ok: false, noArchive: false });
  });

  it('refuses missing timestamps when the latest dated zips cannot be ordered', () => {
    const objects = [obj('x', '20261105-aaaa.zip', null), obj('x', '20261105-bbbb.zip', null)];
    expect(selectArchiveForAgency(objects, { lastFeedExpiry: '20261105' })).toMatchObject({ ok: false, noArchive: false });
  });

  it('reports an agency with no archived zip as noArchive so it is skipped', () => {
    expect(selectArchiveForAgency([], { lastFeedExpiry: '20501230' })).toMatchObject({ ok: false, noArchive: true });
    expect(selectArchiveForAgency([obj('duke', 'notes.json', '2026-01-01T00:00:00Z')], {}))
      .toMatchObject({ ok: false, noArchive: true });
  });
});

describe('feedDateRefusal', () => {
  it('accepts a current feed at least as new as the live one', () => {
    expect(feedDateRefusal('20261128', '20261128', '20261010')).toBeNull();
    expect(feedDateRefusal('20270101', '20261128', '20261010')).toBeNull();
    expect(feedDateRefusal('20270101', null, '20261010')).toBeNull();
  });

  it('refuses undated, expired, or older-than-live feeds', () => {
    expect(feedDateRefusal(null, '20261128', '20261010')).toMatch(/no service dates/);
    expect(feedDateRefusal('20261001', null, '20261010')).toMatch(/before today/);
    expect(feedDateRefusal('20261101', '20261128', '20261010')).toMatch(/older than the live data/);
  });
});

describe('peekFeedDates', () => {
  it('uses the latest calendar date, not only feed_info', async () => {
    const zip = new JSZip();
    zip.file('feed_info.txt', 'feed_publisher_name,feed_end_date,feed_version\nX,20261001,v7\n');
    zip.file('calendar.txt', 'service_id,start_date,end_date\nwk,20260101,20261128\n');
    zip.file('calendar_dates.txt', 'service_id,date,exception_type\nwk,20261231,2\n');
    const buf = await zip.generateAsync({ type: 'nodebuffer' });
    expect(await peekFeedDates(buf)).toEqual({ feedExpiry: '20261128', feedVersion: 'v7' });
  });

  it('returns nulls for an unreadable zip', async () => {
    expect(await peekFeedDates(Buffer.from('not a zip'))).toEqual({ feedExpiry: null, feedVersion: null });
  });
});

describe('output drop guard', () => {
  const geojson = (routes: number, points: number) => JSON.stringify({
    type: 'FeatureCollection',
    features: [
      ...Array.from({ length: routes }, (_, i) => ({ type: 'Feature', geometry: { type: 'LineString', coordinates: [] }, properties: { routeId: `r${i}` } })),
      ...Array.from({ length: routes }, (_, i) => ({ type: 'Feature', geometry: { type: 'LineString', coordinates: [] }, properties: { routeId: `r${i}` } })),
      ...Array.from({ length: points }, () => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [0, 0] }, properties: {} })),
    ],
  });
  const stops = (n: number) => JSON.stringify(Object.fromEntries(Array.from({ length: n }, (_, i) => [`s${i}`, {}])));

  it('counts distinct routes, stop points and stops.json entries', () => {
    expect(countArtifacts(geojson(3, 5), stops(4))).toEqual({ stops: 4, stopPoints: 5, routes: 3 });
    expect(countArtifacts(geojson(1, 0), null)).toEqual({ stops: 0, stopPoints: 0, routes: 1 });
  });

  it('refuses sun-tran-style and communitytransit-style drops', () => {
    expect(outputDropRefusal({ stops: 2151, stopPoints: 2151, routes: 40 }, { stops: 344, stopPoints: 344, routes: 18 }))
      .toMatch(/stops 2151 -> 344.*routes 40 -> 18/);
    expect(outputDropRefusal({ stops: 1652, stopPoints: 1652, routes: 30 }, { stops: 213, stopPoints: 213, routes: 30 }))
      .toMatch(/stops 1652 -> 213/);
  });

  it('allows small changes, growth, and a live count of zero', () => {
    expect(outputDropRefusal({ stops: 100, stopPoints: 100, routes: 10 }, { stops: 81, stopPoints: 95, routes: 8 })).toBeNull();
    expect(outputDropRefusal({ stops: 0, stopPoints: 240, routes: 4 }, { stops: 230, stopPoints: 240, routes: 4 })).toBeNull();
  });

  it('refuses a drop just past 20%', () => {
    expect(outputDropRefusal({ stops: 100, stopPoints: 100, routes: 10 }, { stops: 79, stopPoints: 100, routes: 10 })).toMatch(/stops 100 -> 79/);
  });
});

describe('isReprocessTarget', () => {
  const live = { lastFeedExpiry: '20261128' };

  it('skips hidden agencies by default', () => {
    expect(isReprocessTarget(live)).toBe(true);
    expect(isReprocessTarget({ ...live, hiddenInProduction: true })).toBe(false);
  });

  it('processes a hidden agency only when hidden ones are explicitly included', () => {
    expect(isReprocessTarget({ ...live, hiddenInProduction: true }, { includeHidden: true })).toBe(true);
  });

  it('never processes staged, pending or never-refreshed agencies, even with includeHidden', () => {
    expect(isReprocessTarget({ ...live, hiddenInProduction: true, staged: true }, { includeHidden: true })).toBe(false);
    expect(isReprocessTarget({ ...live, hiddenInProduction: true, pmtilesPending: true }, { includeHidden: true })).toBe(false);
    expect(isReprocessTarget({ hiddenInProduction: true }, { includeHidden: true })).toBe(false);
  });
});

describe('includeHiddenArgError', () => {
  it('requires --only-slug with --include-hidden', () => {
    expect(includeHiddenArgError(true, [])).toMatch(/--only-slug/);
    expect(includeHiddenArgError(true, ['sun-tran'])).toBeNull();
    expect(includeHiddenArgError(false, [])).toBeNull();
  });
});
