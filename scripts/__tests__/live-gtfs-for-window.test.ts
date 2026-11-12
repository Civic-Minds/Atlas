import { describe, expect, it } from 'vitest';
import { torontoServiceStart } from '../live-fetch-archive';
import { surfaceKeyForDate } from '../live-gtfs-for-date';
import type { FeedCoverage } from '../live-gtfs-feeds';
import { dayMatch, serviceDateTripIds, windowServiceDates } from '../live-gtfs-for-window';

const snap = (ts: number, ...trips: (string | null)[]) => JSON.stringify({ ts, v: trips.map((t, i) => [`car${i}`, t, 0, 0, ts]) });

describe('live-gtfs-for-window', () => {
  it('takes the last N Toronto service dates before today, oldest first', () => {
    // 2026-11-12 03:00 UTC is still 11 Nov in Toronto.
    expect(windowServiceDates(3, Date.parse('2026-11-12T03:00:00Z'))).toEqual(['2026-11-08', '2026-11-09', '2026-11-10']);
    expect(windowServiceDates(2, Date.parse('2026-11-12T15:00:00Z'))).toEqual(['2026-11-10', '2026-11-11']);
  });

  it('picks the stored timetable that starts latest on or before the date', () => {
    const keys = ['gtfs/live/ttc-surface/2026-11-01.zip', 'gtfs/live/ttc-surface/2026-09-30.zip', 'gtfs/live/ttc-surface/notes.txt'];
    expect(surfaceKeyForDate(keys, '2026-10-31')).toBe('gtfs/live/ttc-surface/2026-09-30.zip');
    expect(surfaceKeyForDate(keys, '2026-11-01')).toBe('gtfs/live/ttc-surface/2026-11-01.zip');
    expect(surfaceKeyForDate(keys, '2026-09-29')).toBeUndefined();
  });

  it('counts a service date from 4 a.m. Toronto to 4 a.m. the next morning, across two UTC files', () => {
    const start = torontoServiceStart('2026-11-01'), end = torontoServiceStart('2026-11-02');
    const files: Record<string, string> = {
      // The UTC file of 1 Nov starts with the tail of 31 Oct's service.
      '504-2026-11-01.jsonl': [snap(start - 60, 'oct31-late'), snap(start, 'nov1-first'), snap(start + 3600, 'nov1-day', null)].join('\n'),
      '505-2026-11-01.jsonl': snap(start + 7200, 'nov1-other-route'),
      // The UTC file of 2 Nov starts with the tail of 1 Nov's service.
      '504-2026-11-02.jsonl': [snap(end - 60, 'nov1-after-midnight'), snap(end, 'nov2-first')].join('\n'),
      '504-2026-10-31.jsonl': snap(start - 7200, 'oct31-day'),
    };
    const ids = serviceDateTripIds(Object.keys(files), f => files[f], '2026-11-01');
    expect([...ids].sort()).toEqual(['nov1-after-midnight', 'nov1-day', 'nov1-first', 'nov1-other-route']);
  });

  it('reports a day against its timetable: fine, too low, no timetable, or no positions', () => {
    const feed: FeedCoverage = { key: 'S1', dir: '/x', version: 'S1', start: '20261101', end: '20261219' };
    const timetables = new Map([['S1', new Set(['a', 'b', 'c'])]]);
    expect(dayMatch('2026-11-02', new Set(['a', 'b']), feed, timetables, 0.9)).toEqual({ date: '2026-11-02', feed: 'S1', matched: 2, total: 2, share: 1, problem: null, others: [] });
    expect(dayMatch('2026-11-02', new Set(['a', 'x', 'y', 'z']), feed, timetables, 0.9).problem).toMatch(/below 90%/);
    expect(dayMatch('2026-11-02', new Set(['a']), null, timetables, 0.9).problem).toBe('no stored timetable covers this date');
    // A day the collector was down is reported, not failed: the analysis leaves it out by itself.
    expect(dayMatch('2026-11-02', new Set(), feed, timetables, 0.9)).toMatchObject({ total: 0, share: null, problem: null });
  });

  it('flags a day that another timetable matches better, even when the chosen one passes the share', () => {
    const oldFeed: FeedCoverage = { key: 'OLD', dir: '/o', version: 'OLD', start: '20260930', end: '20261031' };
    // The two feeds share most trip ids, as the TTC's do: the chosen one passes 90% but the other holds every id.
    const shared = Array.from({ length: 19 }, (_, i) => `t${i}`);
    const timetables = new Map([['OLD', new Set(shared)], ['NEW', new Set([...shared, 'new-only'])]]);
    const live = new Set([...shared, 'new-only']);
    const wrong = dayMatch('2026-10-31', live, oldFeed, timetables, 0.9);
    expect(wrong.share).toBe(0.95);
    expect(wrong.problem).toMatch(/timetable NEW matches more of this day \(100\.0%\)/);
    expect(wrong.others).toEqual([{ feed: 'NEW', matched: 20, share: 1 }]);
    // The right way round: the other timetable matches fewer, so it is listed and nothing is flagged.
    const newFeed: FeedCoverage = { key: 'NEW', dir: '/n', version: 'NEW', start: '20261101', end: '20261219' };
    const right = dayMatch('2026-11-01', live, newFeed, timetables, 0.9);
    expect(right.problem).toBeNull();
    expect(right.others).toEqual([{ feed: 'OLD', matched: 19, share: 0.95 }]);
  });
});
