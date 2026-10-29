import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { serviceWeekKey } from '../serviceWeekKey';
import { decideRefreshSkipUnchanged } from '../refreshMeta';

// CIV-1066 (Miami-Dade): a feed with no feed_version whose latest end date stayed the same was
// skipped although its timetable changed. The refresh key now also covers trips and stop times.

const ANCHOR = '20261028';
const FILES = {
  'agency.txt': 'agency_id,agency_name,agency_url,agency_timezone\na,Test,https://example.test,America/New_York\n',
  'routes.txt': 'route_id,route_short_name,route_long_name,route_type\nR1,1,One,3\n',
  'calendar.txt': 'service_id,monday,tuesday,wednesday,thursday,friday,saturday,sunday,start_date,end_date\nwk,1,1,1,1,1,0,0,20260101,20271231\n',
  'stops.txt': 'stop_id,stop_name,stop_lat,stop_lon\ns1,One,25.77,-80.19\ns2,Two,25.78,-80.18\n',
  'trips.txt': 'route_id,service_id,trip_id\nR1,wk,t1\nR1,wk,t2\n',
  'stop_times.txt': 'trip_id,arrival_time,departure_time,stop_id,stop_sequence\nt1,08:00:00,08:00:00,s1,1\nt1,08:10:00,08:10:00,s2,2\nt2,08:20:00,08:20:00,s1,1\nt2,08:30:00,08:30:00,s2,2\n',
};

async function zip(files: Record<string, string>, opts: { reverse?: boolean; level?: number } = {}): Promise<Buffer> {
  const z = new JSZip();
  const names = Object.keys(files);
  for (const name of opts.reverse ? names.reverse() : names) z.file(name, files[name], { date: opts.reverse ? new Date('2026-10-01') : new Date('2026-07-31') });
  return z.generateAsync({ type: 'nodebuffer', compression: opts.level ? 'DEFLATE' : 'STORE', compressionOptions: { level: opts.level ?? 1 } });
}

const skip = (serviceWeek: string | null, lastServiceWeek: string | null) => decideRefreshSkipUnchanged({
  forceRefresh: false, hasSupplementals: false, feedExpired: false,
  peekedExpiry: '20271231', peekedVersion: null, lastFeedExpiry: '20271231', lastPeekedExpiry: '20271231', lastFeedVersion: null,
  serviceWeek, lastServiceWeek,
}).skip;

describe('refresh key covers trips and stop times (CIV-1066)', () => {
  it('processes a feed whose times change under the same service_ids and end date', async () => {
    const before = await serviceWeekKey(await zip(FILES), ANCHOR);
    const after = await serviceWeekKey(await zip({ ...FILES, 'stop_times.txt': FILES['stop_times.txt'].replace('08:20:00,08:20:00', '08:25:00,08:25:00') }), ANCHOR);
    expect(before).not.toBeNull();
    expect(after).not.toBe(before);
    expect(skip(after, before)).toBe(false);
  });

  it('processes a feed that adds a trip', async () => {
    const before = await serviceWeekKey(await zip(FILES), ANCHOR);
    const after = await serviceWeekKey(await zip({ ...FILES, 'trips.txt': `${FILES['trips.txt']}R1,wk,t3\n` }), ANCHOR);
    expect(skip(after, before)).toBe(false);
  });

  it('skips a byte-only rebuild: other file order, dates, compression and line endings', async () => {
    const before = await serviceWeekKey(await zip(FILES), ANCHOR);
    const crlf = Object.fromEntries(Object.entries(FILES).map(([k, v]) => [k, v.replace(/\n/g, '\r\n')]));
    const rebuilt = await zip(crlf, { reverse: true, level: 9 });
    expect(rebuilt.equals(await zip(FILES))).toBe(false);
    const after = await serviceWeekKey(rebuilt, ANCHOR);
    expect(after).toBe(before);
    expect(skip(after, before)).toBe(true);
  });
});
