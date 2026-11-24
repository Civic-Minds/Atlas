import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { calendarWithTrips, effectiveFeedExpiry } from '../feedFreshness.js';
import { peekFeedInfo } from '../feedPeek.js';
import { recordedFeedExpiry } from '../refreshMeta.js';

// Kingston, 2026-11-14 feed (#1768): service 1994 lists every date to 2027-11-15 but runs no trip; the last trips run 2027-01-03.
const calendarDates = [
  { service_id: '1996', date: '20261201', exception_type: '1' },
  { service_id: '2000', date: '20270103', exception_type: '1' },
  { service_id: '1994', date: '20270104', exception_type: '1' },
  { service_id: '1994', date: '20271115', exception_type: '1' },
];
const trips = [{ service_id: '1996' }, { service_id: '2000' }];

describe('the feed end ignores services with no trips (#1768)', () => {
  it('drops a trip-less service from the calendar, so the end is the last day with trips', () => {
    const served = calendarWithTrips([], calendarDates, trips.map(t => t.service_id));
    expect(effectiveFeedExpiry({ calendarDates: served.calendarDates })).toBe('20270103');
    expect(effectiveFeedExpiry({ calendarDates })).toBe('20271115');
  });

  it('records the last day with trips even when feed_info runs to the trip-less end', () => {
    const served = calendarWithTrips([], calendarDates, trips.map(t => t.service_id));
    const end = effectiveFeedExpiry({ feedInfoEnd: '20271115', calendarDates: served.calendarDates });
    const calendarOnlyEnd = effectiveFeedExpiry({ calendarDates: served.calendarDates });
    expect(recordedFeedExpiry('20271115', end, '20261124', calendarOnlyEnd)).toBe('20270103');
  });

  it('filters calendar.txt rows too', () => {
    const calendar = [{ service_id: 'A', end_date: '20270301' }, { service_id: 'EMPTY', end_date: '20991231' }];
    expect(calendarWithTrips(calendar, [], ['A']).calendar).toEqual([calendar[0]]);
  });

  it('changes nothing when the trips name no service, or none of the calendar\'s services', () => {
    expect(calendarWithTrips([], calendarDates, []).calendarDates).toEqual(calendarDates);
    expect(calendarWithTrips([], calendarDates, ['other']).calendarDates).toEqual(calendarDates);
  });

  it('a peek reads the same end as processing, so the same feed never reads as newer', async () => {
    const zip = new JSZip();
    zip.file('feed_info.txt', 'feed_publisher_name,feed_publisher_url,feed_lang,feed_start_date,feed_end_date\nK,https://k,en,20261114,20271115\n');
    zip.file('calendar_dates.txt', 'service_id,date,exception_type\n' + calendarDates.map(d => `${d.service_id},${d.date},${d.exception_type}`).join('\n') + '\n');
    zip.file('trips.txt', 'route_id,service_id,trip_id\n1,1996,t1\n1,2000,t2\n');
    const peek = await peekFeedInfo(await zip.generateAsync({ type: 'nodebuffer' }));
    // The peek keeps feed_info's end in its raw value; the recorded expiry caps it with the calendar's own end.
    expect(recordedFeedExpiry('20271115', peek.feedExpiry, '20261124', '20270103')).toBe('20270103');
  });
});
