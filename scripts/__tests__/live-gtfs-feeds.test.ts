import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PATTERN_MERGE_REQUIRES_SAME_STOPS, assertDistinctFeeds, droppedDaysWarning, canonicalShapeIds, feedForDate, feedsOverlapping, prefixedId, readFeedCoverage, uncoveredDates, type FeedCoverage } from '../live-gtfs-feeds';

const csv = (path: string) => {
  const [head, ...rows] = readFileSync(path, 'utf8').trim().split('\n') as string[];
  const keys = head.split(',');
  return rows.map(r => Object.fromEntries(r.split(',').map((v, i) => [keys[i], v])));
};

/** A synthetic feed folder: a calendar (service ids 1 and 2, as the TTC reuses them in every feed) and a feed_info. */
function feedDir(version: string, start: string, end: string): string {
  const dir = mkdtempSync(join(tmpdir(), `feed-${version}-`));
  writeFileSync(join(dir, 'calendar.txt'), `service_id,monday,tuesday,wednesday,thursday,friday,saturday,sunday,start_date,end_date\n1,1,1,1,1,1,0,0,${start},${end}\n2,0,0,0,0,0,1,1,${start},${end}\n`);
  writeFileSync(join(dir, 'calendar_dates.txt'), 'service_id,date,exception_type\n');
  writeFileSync(join(dir, 'feed_info.txt'), `feed_publisher_name,feed_version\nTTC,${version}\n`);
  return dir;
}

describe('which timetable a service date uses (CIV-297)', () => {
  const old = readFeedCoverage(feedDir('S1000542', '20260930', '20261031'), csv);
  const next = readFeedCoverage(feedDir('S1000600', '20261101', '20261128'), csv);
  const feeds = [old, next];

  it('reads a feed\'s version and the dates its calendar covers', () => {
    expect(old).toMatchObject({ key: 'S1000542', version: 'S1000542', start: '20260930', end: '20261031' });
  });
  it('gives each date to the feed that covers it, the boundary day to the old feed and the day after to the new one', () => {
    expect(feedForDate(feeds, '2026-10-30')?.key).toBe('S1000542');
    expect(feedForDate(feeds, '2026-10-31')?.key).toBe('S1000542'); // an after-midnight run on Nov 1 belongs to Oct 31
    expect(feedForDate(feeds, '2026-11-01')?.key).toBe('S1000600');
    expect(feedForDate(feeds, '20261115')?.key).toBe('S1000600');
  });
  it('lets the newer feed win an overlap, whatever order the feeds are listed in', () => {
    const overlapping = readFeedCoverage(feedDir('S1000599', '20261029', '20261128'), csv);
    expect(feedForDate([old, overlapping], '2026-10-30')?.key).toBe('S1000599');
    expect(feedForDate([overlapping, old], '2026-10-30')?.key).toBe('S1000599');
    expect(feedForDate([old, overlapping], '2026-10-28')?.key).toBe('S1000542');
  });
  it('reports a date no feed covers instead of picking one', () => {
    const gap = readFeedCoverage(feedDir('S1000700', '20261105', '20261128'), csv);
    expect(feedForDate([old, gap], '2026-11-02')).toBeNull();
    expect(uncoveredDates([old, gap], ['2026-10-31', '2026-11-01', '2026-11-02', '2026-11-05'])).toEqual(['2026-11-01', '2026-11-02']);
    expect(uncoveredDates(feeds, ['2026-09-29'])).toEqual(['2026-09-29']); // before the first feed
  });
  it('takes a third feed without any change', () => {
    const third = readFeedCoverage(feedDir('S1000650', '20261129', '20261231'), csv);
    expect(feedForDate([old, next, third], '2026-12-01')?.key).toBe('S1000650');
    expect(feedForDate([old, next, third], '2026-11-28')?.key).toBe('S1000600');
  });
  it('keeps colliding service ids apart: ids are untouched for one feed and prefixed by feed for several', () => {
    expect(prefixedId([old], old, '1')).toBe('1');
    expect(prefixedId(feeds, old, '1')).toBe('S1000542:1');
    expect(prefixedId(feeds, next, '1')).toBe('S1000600:1');
    expect(prefixedId(feeds, old, '1')).not.toBe(prefixedId(feeds, next, '1')); // service 1 in both feeds
    expect(prefixedId(feeds, null, '123')).toBe('none:123'); // a date no feed covers matches nothing
  });
  it('refuses two feeds that cannot be told apart', () => {
    const same = { ...next, dir: 'elsewhere' } as FeedCoverage;
    expect(() => assertDistinctFeeds([old, { ...same, key: old.key }])).toThrow(/both called/);
    expect(() => assertDistinctFeeds(feeds)).not.toThrow();
  });
  it('refuses a feed folder with no calendar', () => {
    const dir = mkdtempSync(join(tmpdir(), 'feed-empty-'));
    mkdirSync(dir, { recursive: true });
    expect(() => readFeedCoverage(dir, csv)).toThrow(/no calendar/);
  });
});

describe('the same pattern in two feeds counts as one', () => {
  const trip = (feed: string, shapeId: string, direction: string, stops: string[]) => ({ feed, shapeId, direction, stops });
  it('maps each feed\'s shape for the same stops to the newest feed\'s shape', () => {
    const trips = [
      ...Array(5).fill(0).map(() => trip('A', 'A:s1', '0', ['x', 'y', 'z'])),
      ...Array(3).fill(0).map(() => trip('B', 'B:s9', '0', ['x', 'y', 'z'])),
      trip('A', 'A:s2', '1', ['z', 'y', 'x']),
      trip('B', 'B:s7', '1', ['z', 'y', 'x']),
    ];
    const remap = canonicalShapeIds(trips, ['A', 'B']);
    expect(remap.get('A:s1')).toBe('B:s9');
    expect(remap.get('B:s9')).toBe('B:s9');
    expect(remap.get('A:s2')).toBe('B:s7');
  });
  it('keeps two shapes with the same stops apart within a feed, pairing them by how many trips use them', () => {
    const trips = [
      ...Array(5).fill(0).map(() => trip('A', 'A:long', '0', ['x', 'y'])), ...Array(2).fill(0).map(() => trip('A', 'A:short', '0', ['x', 'y'])),
      ...Array(6).fill(0).map(() => trip('B', 'B:long', '0', ['x', 'y'])), ...Array(1).fill(0).map(() => trip('B', 'B:short', '0', ['x', 'y'])),
    ];
    const remap = canonicalShapeIds(trips, ['A', 'B']);
    expect(remap.get('A:long')).toBe('B:long');
    expect(remap.get('A:short')).toBe('B:short');
    expect(new Set(remap.values()).size).toBe(2);
  });
  it('leaves a pattern only one feed has under its own id, and does nothing for one feed', () => {
    const only = canonicalShapeIds([trip('A', 'A:old', '0', ['p', 'q']), trip('B', 'B:new', '0', ['p', 'r'])], ['A', 'B']);
    expect(only.get('A:old')).toBe('A:old');
    expect(only.get('B:new')).toBe('B:new');
    expect(canonicalShapeIds([trip('A', 'A:s', '0', ['x'])], ['A']).get('A:s')).toBe('A:s');
  });
});

describe('one coverage rule for calendar and calendar_dates (CIV-297 review)', () => {
  const dirWith = (version: string, calendar: string, calendarDates: string): string => {
    const dir = mkdtempSync(join(tmpdir(), `feed-${version}-`));
    writeFileSync(join(dir, 'calendar.txt'), `service_id,monday,tuesday,wednesday,thursday,friday,saturday,sunday,start_date,end_date\n${calendar}`);
    writeFileSync(join(dir, 'calendar_dates.txt'), `service_id,date,exception_type\n${calendarDates}`);
    writeFileSync(join(dir, 'feed_info.txt'), `feed_publisher_name,feed_version\nTTC,${version}\n`);
    return dir;
  };
  it('does not widen a feed\'s range with a removal dated before its calendar starts', () => {
    const f = readFeedCoverage(dirWith('N1', '1,1,1,1,1,1,0,0,20261101,20261130\n', '1,20261025,2\n1,20261110,2\n'), csv);
    expect(f).toMatchObject({ start: '20261101', end: '20261130' });
  });
  it('widens the range with an added service date outside the calendar rows', () => {
    const f = readFeedCoverage(dirWith('N2', '1,1,1,1,1,1,0,0,20261101,20261130\n', '1,20261031,1\n'), csv);
    expect(f.start).toBe('20261031');
  });
  it('supports a feed that is only calendar_dates additions (no calendar rows)', () => {
    const f = readFeedCoverage(dirWith('N3', '', '1,20261101,1\n1,20261102,1\n1,20261103,1\n'), csv);
    expect(f).toMatchObject({ start: '20261101', end: '20261103' });
    expect(feedForDate([f], '2026-11-02')?.key).toBe('N3');
    expect(feedForDate([f], '2026-11-04')).toBeNull();
  });
  it('refuses a feed with no calendar rows and no added dates', () => {
    expect(() => readFeedCoverage(dirWith('N4', '', '1,20261101,2\n'), csv)).toThrow(/covers no dates/);
  });
});

describe('which feeds a window uses', () => {
  const mk = (key: string, start: string, end: string): FeedCoverage => ({ key, dir: key, version: key, start, end });
  const feeds = [mk('A', '20260930', '20261031'), mk('B', '20261101', '20261128')];
  it('keeps only the feeds that overlap the window, so a window inside one feed is that feed alone', () => {
    expect(feedsOverlapping(feeds, '2026-10-20', '2026-10-26').map(f => f.key)).toEqual(['A']);
    expect(feedsOverlapping(feeds, '2026-10-28', '2026-11-03').map(f => f.key)).toEqual(['A', 'B']);
    expect(feedsOverlapping(feeds, '2026-11-02', '2026-11-08').map(f => f.key)).toEqual(['B']);
  });
  it('returns every feed when none overlaps, so the gap is reported rather than hidden', () => {
    expect(feedsOverlapping(feeds, '2026-12-20', '2026-12-26')).toHaveLength(2);
  });
});

describe('known limit: a stop change at a feed change', () => {
  it('does not merge two versions of a pattern whose stops differ, so they count as two patterns', () => {
    const trip = (feed: string, shapeId: string, stops: string[]) => ({ feed, shapeId, direction: '0', stops });
    const remap = canonicalShapeIds([trip('A', 'A:s', ['x', 'y', 'z']), trip('B', 'B:s', ['x', 'y', 'z', 'w'])], ['A', 'B']);
    expect(remap.get('A:s')).toBe('A:s');
    expect(remap.get('B:s')).toBe('B:s');
    expect(PATTERN_MERGE_REQUIRES_SAME_STOPS).toBe(true);
  });
});

describe('days one timetable does not cover', () => {
  it('names each dropped day in a loud warning, and says nothing when none is dropped', () => {
    expect(droppedDaysWarning([], 'S1 (20260930-20261031)')).toBeNull();
    const w = droppedDaysWarning(['2026-11-02', '2026-11-01'], 'S1 (20260930-20261031)')!;
    expect(w).toMatch(/WARNING/);
    expect(w).toMatch(/LEFT OUT/);
    expect(w).toMatch(/these 2 days/);
    expect(w).toContain('2026-11-01, 2026-11-02'); // sorted
    expect(w).toContain('S1 (20260930-20261031)');
    expect(droppedDaysWarning(['2026-11-01'], 'S1')).toMatch(/does not cover this day/);
  });
});
