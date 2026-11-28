import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { timetableContentKey } from '../feedPeek';
import { isPlaceholderFeedEnd, stampFeedMeta, stampReprocessedFeedExpiry, timetableChangedDate, type FeedMetaFields } from '../refreshMeta';

// CIV-3115 (Ryan, 2026-11-27): a feed whose calendar runs to a placeholder (2099) gives no end date, and the day its
// timetable (trips and stop times) last changed is kept for the 12-month "may be out of date" line.
const zip = async (files: Record<string, string>) => {
  const z = new JSZip();
  for (const [name, body] of Object.entries(files)) z.file(name, body);
  return Buffer.from(await z.generateAsync({ type: 'nodebuffer' }));
};
const TODAY = '20261127';

describe('isPlaceholderFeedEnd', () => {
  it('a 2099 calendar with no feed_info end gives no end date (LADOT, Knoxville)', () => {
    expect(isPlaceholderFeedEnd(null, '20991231', TODAY)).toBe(true);
  });
  it('a real end, or a feed_info end that wins, is a date', () => {
    expect(isPlaceholderFeedEnd(null, '20270601', TODAY)).toBe(false);
    expect(isPlaceholderFeedEnd('20270601', '20991231', TODAY)).toBe(false);
    // The calendar's own last service date inside the cap lowers it (#1039): a real date.
    expect(isPlaceholderFeedEnd(null, '20991231', TODAY, '20270315')).toBe(false);
  });
});

describe('timetableChangedDate', () => {
  it('starts from the day Atlas obtained the file, keeps it while the timetable is the same, and moves on a change', () => {
    expect(timetableChangedDate({ key: 'a', obtainedAt: '20220202', runDate: TODAY })).toBe('20220202');
    expect(timetableChangedDate({ key: 'a', lastKey: 'a', previous: '20220202', runDate: TODAY })).toBe('20220202');
    expect(timetableChangedDate({ key: 'b', lastKey: 'a', previous: '20220202', runDate: TODAY })).toBe(TODAY);
    expect(timetableChangedDate({ key: null, previous: '20220202', runDate: TODAY })).toBe('20220202');
  });
});

describe('timetableContentKey', () => {
  it('ignores a re-export that only moves the calendar end (Waco, Bowling Green); changes with the trips', async () => {
    const trips = 'route_id,service_id,trip_id\nR,S,T1\n';
    const times = 'trip_id,stop_id,stop_sequence,arrival_time,departure_time\nT1,A,1,08:00:00,08:00:00\n';
    const a = await zip({ 'trips.txt': trips, 'stop_times.txt': times, 'calendar.txt': 'service_id,start_date,end_date\nS,20261101,20501230\n' });
    const b = await zip({ 'trips.txt': trips, 'stop_times.txt': times, 'calendar.txt': 'service_id,start_date,end_date\nS,20261101,20311230\n' });
    const c = await zip({ 'trips.txt': trips, 'stop_times.txt': times.replace('08:00:00,08:00:00', '08:05:00,08:05:00'), 'calendar.txt': 'x' });
    expect(timetableContentKey(a)).toBe(timetableContentKey(b));
    expect(timetableContentKey(c)).not.toBe(timetableContentKey(a));
  });
});

describe('stamping', () => {
  it('a refresh records no end date and the timetable date; a real end clears the flag', () => {
    const agency: FeedMetaFields = { feedObtainedAt: '20220202' };
    stampFeedMeta(agency, { feedExpiry: null, feedVersion: null, peekedExpiry: '20991231', peekedVersion: null, todayYmd: TODAY, timetableKey: 'k', runDate: TODAY });
    expect(agency.noFeedEnd).toBe(true);
    expect(agency.timetableChangedAt).toBe('20220202');
    stampFeedMeta(agency, { feedExpiry: null, feedVersion: null, peekedExpiry: '20270601', peekedVersion: null, todayYmd: TODAY, timetableKey: 'k2', runDate: TODAY });
    expect(agency.noFeedEnd).toBeUndefined();
    expect(agency.timetableChangedAt).toBe(TODAY);
  });
  it('a rebuild records the flag even when the expiry itself is unchanged', () => {
    const agency: FeedMetaFields = { lastFeedExpiry: '20281127', lastPeekedExpiry: '20991231', feedObtainedAt: '20240130' };
    expect(stampReprocessedFeedExpiry(agency, { feedExpiry: null, calendarExpiry: '20991231', todayYmd: TODAY, timetableKey: 'k', runDate: TODAY })).toBe(true);
    expect(agency.noFeedEnd).toBe(true);
    expect(agency.timetableChangedAt).toBe('20240130');
  });
});
