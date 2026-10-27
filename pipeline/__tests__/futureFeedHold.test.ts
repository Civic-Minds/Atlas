import { describe, expect, it } from 'vitest';
import { futureFeedHoldUntil, heldFeedsDue, heldFeedSummary, startedArchiveInstead } from '../futureFeedHold';
import type { PeekedArchive } from '../archiveSelection';
import { evaluateAgency, summarizeArtifact } from '../releaseDiff';

// #1144: a timetable that hasn't started never replaces the one still running.
describe('future timetable hold (refresh)', () => {
  it('TANK: the winter feed (from 2026-11-07) waits while the current one runs to 2026-11-06', () => {
    expect(futureFeedHoldUntil({ feedStart: '20261107', todayYmd: '20261026', liveFeedExpiry: '20261106' })).toBe('20261107');
    expect(futureFeedHoldUntil({ feedStart: '20261107', todayYmd: '20261106', liveFeedExpiry: '20261106' })).toBe('20261107');
    // Its start date: processed.
    expect(futureFeedHoldUntil({ feedStart: '20261107', todayYmd: '20261107', liveFeedExpiry: '20261106' })).toBeNull();
  });

  it('TTC: the Nov 1 board waits through Oct 31, then goes live', () => {
    expect(futureFeedHoldUntil({ feedStart: '20261101', todayYmd: '20261026', liveFeedExpiry: '20261031' })).toBe('20261101');
    expect(futureFeedHoldUntil({ feedStart: '20261101', todayYmd: '20261101', liveFeedExpiry: '20261031' })).toBeNull();
    expect(futureFeedHoldUntil({ feedStart: '20261101', todayYmd: '20261102', liveFeedExpiry: '20261031' })).toBeNull();
  });

  it('a feed already in service, or one replacing an ended feed, is processed', () => {
    expect(futureFeedHoldUntil({ feedStart: '20261020', todayYmd: '20261026', liveFeedExpiry: '20261031' })).toBeNull();
    expect(futureFeedHoldUntil({ feedStart: '20261107', todayYmd: '20261026', liveFeedExpiry: '20261020' })).toBeNull();
    expect(futureFeedHoldUntil({ feedStart: null, todayYmd: '20261026', liveFeedExpiry: '20261031' })).toBeNull();
    expect(futureFeedHoldUntil({ feedStart: '20261107', todayYmd: '20261026', liveFeedExpiry: null })).toBeNull();
  });

  it('logs when it goes live', () => {
    expect(heldFeedSummary('20261107')).toBe('held (timetable starts 20261107; the current one stays live until then)');
  });

  it('the daily run refreshes held agencies on their start date, in their own local date', () => {
    const agencies = [
      { slug: 'tank', heldFeedStart: '20261107', timezone: 'America/New_York' },
      { slug: 'ttc', heldFeedStart: '20261101', timezone: 'America/Toronto' },
      { slug: 'yrt', heldFeedStart: null, timezone: 'America/Toronto' },
    ];
    expect(heldFeedsDue(agencies, '20261031')).toEqual([]);
    expect(heldFeedsDue(agencies, '20261101')).toEqual(['ttc']);
    expect(heldFeedsDue(agencies, '20261107')).toEqual(['tank', 'ttc']);
    expect(heldFeedsDue(agencies, a => (a.slug === 'tank' ? '20261107' : '20261031'))).toEqual(['tank']);
  });
});

describe('future timetable hold (rebuild archive pick)', () => {
  const zip = (key: string, feedStart: string, feedExpiry: string, uploaded: string): PeekedArchive => ({
    obj: { key, lastModified: new Date(uploaded) },
    dates: { feedStart, feedExpiry, feedVersion: key, feedInfoEnd: feedExpiry },
  });
  // Burlington: the Nov 1 timetable was uploaded last; the current one runs to Oct 31.
  const burlington = [
    zip('gtfs/archive/burlington/20261031-a.zip', '20260901', '20261031', '2026-09-01'),
    zip('gtfs/archive/burlington/20261219-b.zip', '20261101', '20261219', '2026-10-20'),
  ];

  it('Burlington: the zip in service today replaces a newest zip that has not started', () => {
    const pick = startedArchiveInstead({ pickedKey: burlington[1].obj.key, peeked: burlington, todayYmd: '20261022', liveFeedExpiry: '20261031' });
    expect(pick).toEqual({ key: burlington[0].obj.key, reason: expect.stringContaining('starts 20261101') });
  });

  it('from its start date the newest zip stands', () => {
    expect(startedArchiveInstead({ pickedKey: burlington[1].obj.key, peeked: burlington, todayYmd: '20261101', liveFeedExpiry: '20261031' })).toBeNull();
  });

  it('refuses when no archived zip is in service today', () => {
    const onlyFuture = [burlington[1], zip('gtfs/archive/burlington/20261020-c.zip', '20260801', '20261020', '2026-08-01')];
    expect(startedArchiveInstead({ pickedKey: burlington[1].obj.key, peeked: onlyFuture, todayYmd: '20261022', liveFeedExpiry: '20261031' }))
      .toEqual({ refuse: expect.stringContaining('no archived zip is in service today') });
  });
});

describe('release gate: future-start (#1144)', () => {
  const artifact = JSON.stringify({ type: 'FeatureCollection', atlasSchemaVersion: 2, features: [
    { type: 'Feature', geometry: { type: 'LineString', coordinates: [[0, 0], [0.01, 0.01]] }, properties: { routeId: '1', day: 'Weekday', directionId: 0, headway: 30, tier: '30' } },
  ] });
  const summary = summarizeArtifact(artifact, null);
  const futureStart = (liveFeedExpiry?: string | null) => evaluateAgency(
    { slug: 'tank', live: summary, next: summary, allowMissingLive: true, service: { start: '20261107', end: '20270319', liveFeedExpiry } },
    [], '20261026',
  ).filter(f => f.flag === 'future-start');

  it('is red while the live timetable still runs', () => {
    expect(futureStart('20261106').map(f => f.level)).toEqual(['red']);
  });

  it('stays yellow with no running live timetable or no live expiry given', () => {
    expect(futureStart('20261020').map(f => f.level)).toEqual(['yellow']);
    expect(futureStart(undefined).map(f => f.level)).toEqual(['yellow']);
  });
});
