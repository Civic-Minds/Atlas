import { describe, expect, it } from 'vitest';
import { decideRefreshSkipUnchanged, isFeedExpired, markFeedStale, recordedFeedExpiry, shouldReplaceExpiredFeed, shouldSkipAllExpiredFeeds, shouldStampFeedMeta, stampFeedMeta, stampReprocessedFeedExpiry, stampSupplementalFeedMeta } from '../refreshMeta.js';
import { isCurrentProductionFeed, isStaleProductionFeed } from '../../shared/feedAvailability.js';

describe('feed expiry checks', () => {
  it('recognizes a feed that ended before the refresh date', () => {
    expect(isFeedExpired('20241221', '20260806')).toBe(true);
    expect(isFeedExpired('20260807', '20260806')).toBe(false);
    expect(isFeedExpired(null, '20260806')).toBe(false);
  });

  it('skips only when every dated feed is expired', () => {
    expect(shouldSkipAllExpiredFeeds(['20241221', '20241011'], '20260806')).toBe(true);
    expect(shouldSkipAllExpiredFeeds(['20241221', '20260807'], '20260806')).toBe(false);
    expect(shouldSkipAllExpiredFeeds(['20241221', null], '20260806')).toBe(false);
    expect(shouldSkipAllExpiredFeeds([null, undefined], '20260806')).toBe(false);
  });

  it('replaces an expired source with a dated current fallback', () => {
    expect(shouldReplaceExpiredFeed({
      selectedExpiry: '20260801',
      candidateExpiry: '20261001',
      todayYmd: '20260919',
    })).toBe(true);
    expect(shouldReplaceExpiredFeed({
      selectedExpiry: '20260801',
      candidateExpiry: null,
      todayYmd: '20260919',
    })).toBe(false);
    expect(shouldReplaceExpiredFeed({
      selectedExpiry: '20261001',
      candidateExpiry: '20261101',
      todayYmd: '20260919',
    })).toBe(false);
  });
});

describe('shouldStampFeedMeta', () => {
  it('stamps only when featureCount > 0', () => {
    expect(shouldStampFeedMeta(0)).toBe(false);
    expect(shouldStampFeedMeta(1)).toBe(true);
    expect(shouldStampFeedMeta(42)).toBe(true);
  });
});

describe('stampFeedMeta', () => {
  it('writes expiry, version, and refreshed-at', () => {
    const agency: {
      lastFeedExpiry?: string | null;
      lastFeedVersion?: string | null;
      lastRefreshedAt?: string | null;
    } = {
      lastFeedExpiry: 'old',
      lastFeedVersion: 'v0',
      lastRefreshedAt: '2020-01-01',
    };
    stampFeedMeta(agency, {
      feedExpiry: '20251231',
      feedVersion: 'v2',
      peekedExpiry: 'peeked',
      peekedVersion: 'peeked-v',
      todayYmd: '2026-07-19',
    });
    expect(agency.lastFeedExpiry).toBe('20251231');
    expect(agency.lastFeedVersion).toBe('v2');
    expect(agency.lastRefreshedAt).toBe('2026-07-19');
  });

  it('keeps the calendar end when feed_info ends earlier', () => {
    // coast-transit-ms: feed_info ends 20260930, calendar.txt runs to 20261231.
    const agency: { lastFeedExpiry?: string | null } = {};
    stampFeedMeta(agency, {
      feedExpiry: '20260930',
      feedVersion: '20260316',
      peekedExpiry: '20261231',
      peekedVersion: '20260316',
      todayYmd: '2026-10-07',
    });
    expect(agency.lastFeedExpiry).toBe('20261231');
  });

  it('picks the later valid expiry and falls back when either is missing', () => {
    expect(recordedFeedExpiry('20270101', '20261231', '2026-10-07')).toBe('20270101');
    expect(recordedFeedExpiry('20261231', null, '2026-10-07')).toBe('20261231');
    expect(recordedFeedExpiry(null, null, '2026-10-07')).toBeNull();
  });

  it('caps a placeholder calendar end at today + 2 years', () => {
    // bc-ferries style: feed_info ends 20270331, calendar runs to 20500101.
    expect(recordedFeedExpiry('20270331', '20500101', '2026-10-07')).toBe('20281007');
  });

  it('caps at feed_info end + 2 years when that is sooner', () => {
    expect(recordedFeedExpiry('20251001', '20500101', '20261007')).toBe('20271001');
  });

  it('leaves a real calendar extension within the cap unaffected', () => {
    // coast-transit-ms: feed_info ends 20260930, calendar.txt runs to 20261231.
    expect(recordedFeedExpiry('20260930', '20261231', '2026-10-07')).toBe('20261231');
  });

  it('without feed_info, caps the calendar end at today + 2 years only', () => {
    expect(recordedFeedExpiry(null, '20500101', '2026-10-07')).toBe('20281007');
    expect(recordedFeedExpiry(null, '20261231', '2026-10-07')).toBe('20261231');
  });

  it('clears stale state after a successful refresh', () => {
    const agency = {
      feedRefreshStatus: 'stale' as const,
      feedRefreshError: 'HTTP 403',
      feedRefreshErrorAt: '2026-07-18',
      feedRefreshRetryCount: 3,
    };
    stampFeedMeta(agency, {
      feedExpiry: '20251231',
      feedVersion: 'v2',
      peekedExpiry: null,
      peekedVersion: null,
      todayYmd: '2026-07-19',
    });
    expect(agency).toMatchObject({
      feedRefreshStatus: 'current',
      feedRefreshError: null,
      feedRefreshErrorAt: null,
      feedRefreshRetryCount: 0,
    });
  });

  it('records stale state without changing the active feed identity', () => {
    const agency = {
      lastFeedExpiry: '20261101',
      lastFeedVersion: '202607301229',
      lastRefreshedAt: '2026-08-07',
    };
    markFeedStale(agency, { reason: 'HTTP 403', todayYmd: '2026-09-21' });
    markFeedStale(agency, { reason: 'all available feeds expired', todayYmd: '2026-09-28' });
    expect(agency).toMatchObject({
      lastFeedExpiry: '20261101',
      lastFeedVersion: '202607301229',
      lastRefreshedAt: '2026-08-07',
      lastFeedCheckAt: '2026-09-28',
      feedRefreshStatus: 'stale',
      feedRefreshError: 'all available feeds expired',
      feedRefreshErrorAt: '2026-09-28',
      feedRefreshRetryCount: 2,
    });
  });

  it('falls back to peeked values when process did not return feed_info', () => {
    const agency: {
      lastFeedExpiry?: string | null;
      lastFeedVersion?: string | null;
      lastRefreshedAt?: string | null;
    } = {};
    stampFeedMeta(agency, {
      feedExpiry: null,
      feedVersion: null,
      peekedExpiry: '20250101',
      peekedVersion: 'peek',
      todayYmd: '2026-07-19',
    });
    expect(agency.lastFeedExpiry).toBe('20250101');
    expect(agency.lastFeedVersion).toBe('peek');
  });
});

describe('supplemental feed metadata (#630)', () => {
  it('records each supplemental expiry and archive key, and an expired rail feed makes the agency stale', () => {
    const agency: Parameters<typeof stampSupplementalFeedMeta>[0] = {};
    stampFeedMeta(agency, { feedExpiry: null, feedVersion: null, peekedExpiry: '20261212', peekedVersion: null, todayYmd: '2026-10-10' });
    stampSupplementalFeedMeta(agency, [{ feedExpiry: '20261021', feedVersion: null, rawArchiveKey: '20261021-abc' }]);

    expect(agency.lastFeedExpiry).toBe('20261212');
    expect(agency.lastSupplementalFeeds).toEqual([{ feedExpiry: '20261021', feedVersion: null, rawArchiveKey: '20261021-abc' }]);
    expect(isCurrentProductionFeed(agency, '20261021')).toBe(true);
    expect(isStaleProductionFeed(agency, '20261022')).toBe(true);
  });

  it('clears stale supplemental metadata when an agency no longer has supplementals', () => {
    const agency: Parameters<typeof stampSupplementalFeedMeta>[0] = {
      lastSupplementalFeeds: [{ feedExpiry: '20260829', feedVersion: 'v1', rawArchiveKey: 'k' }],
    };
    stampSupplementalFeedMeta(agency, []);
    expect(agency).not.toHaveProperty('lastSupplementalFeeds');
  });
});

describe('decideRefreshSkipUnchanged with a run-date reference (#774)', () => {
  // NCSU Wolfline: same feed_version and calendar end every week, but the timetable in force
  // changes with the semester (calendar_dates), so the feed must be reprocessed each run.
  const same = { forceRefresh: false, hasSupplementals: false, feedExpired: false, peekedExpiry: '20271231', peekedVersion: '20250228', lastFeedExpiry: '20271231', lastFeedVersion: '20250228' };
  it('skips an unchanged feed by default', () => {
    expect(decideRefreshSkipUnchanged(same).skip).toBe(true);
  });
  it('never skips an agency read as of the run date', () => {
    expect(decideRefreshSkipUnchanged({ ...same, referenceDateFromRunDate: true }).skip).toBe(false);
  });
});

describe('unchanged-feed check with a placeholder calendar end (#688)', () => {
  // bc-ferries: calendar ends 20500101, recorded expiry is capped near today + 2 years.
  const base = { forceRefresh: false, hasSupplementals: false, feedExpired: false, peekedExpiry: '20500101', peekedVersion: null, lastFeedExpiry: '20281007', lastFeedVersion: null };

  it('stamps the uncapped expiry next to the capped one', () => {
    const agency: Record<string, unknown> = {};
    stampFeedMeta(agency, { feedExpiry: null, feedVersion: null, peekedExpiry: '20500101', peekedVersion: null, todayYmd: '2026-10-07' });
    expect(agency.lastFeedExpiry).toBe('20281007');
    expect(agency.lastPeekedExpiry).toBe('20500101');
  });

  it('skips an unchanged feed whose recorded expiry was capped', () => {
    expect(decideRefreshSkipUnchanged({ ...base, lastPeekedExpiry: '20500101' }).skip).toBe(true);
  });

  it('still reprocesses when the placeholder date itself changes', () => {
    expect(decideRefreshSkipUnchanged({ ...base, lastPeekedExpiry: '20490101' }).skip).toBe(false);
  });

  it('keeps comparing against the recorded expiry for records without an uncapped one', () => {
    expect(decideRefreshSkipUnchanged({ ...base, peekedExpiry: '20261231', lastFeedExpiry: '20261231' }).skip).toBe(true);
    expect(decideRefreshSkipUnchanged(base).skip).toBe(false);
  });
});

describe('stampReprocessedFeedExpiry (#837)', () => {
  const todayYmd = '20261013';

  it('records the processed feed expiry over an older one, as mcts needed', () => {
    const agency = { lastFeedExpiry: '20260920', lastPeekedExpiry: '20260920', lastFeedVersion: 'v1', lastRefreshedAt: '2026-09-01' };
    expect(stampReprocessedFeedExpiry(agency, { feedExpiry: null, calendarExpiry: '20261205', todayYmd })).toBe(true);
    expect(agency).toEqual({ lastFeedExpiry: '20261205', lastPeekedExpiry: '20261205', lastFeedVersion: 'v1', lastRefreshedAt: '2026-09-01' });
  });

  it('caps a placeholder calendar end like a refresh does', () => {
    const agency = { lastFeedExpiry: '20261001' };
    stampReprocessedFeedExpiry(agency, { feedExpiry: '20270101', calendarExpiry: '20991231', todayYmd });
    expect(agency).toEqual({ lastFeedExpiry: recordedFeedExpiry('20270101', '20991231', todayYmd), lastPeekedExpiry: '20991231' });
    expect(agency.lastFeedExpiry).toBe('20281013');
  });

  it('keeps a later feed_info end over an earlier calendar end', () => {
    const agency = { lastFeedExpiry: '20261001' };
    stampReprocessedFeedExpiry(agency, { feedExpiry: '20270115', calendarExpiry: '20261231', todayYmd });
    expect(agency.lastFeedExpiry).toBe('20270115');
  });

  it('reports no change when the record already matches', () => {
    const agency = { lastFeedExpiry: '20261205', lastPeekedExpiry: '20261205' };
    expect(stampReprocessedFeedExpiry(agency, { feedExpiry: null, calendarExpiry: '20261205', todayYmd })).toBe(false);
  });

  it('leaves the record alone when the feed has no dates', () => {
    const agency = { lastFeedExpiry: '20261205', lastPeekedExpiry: '20261205' };
    expect(stampReprocessedFeedExpiry(agency, { feedExpiry: null, calendarExpiry: null, todayYmd })).toBe(false);
    expect(agency).toEqual({ lastFeedExpiry: '20261205', lastPeekedExpiry: '20261205' });
  });
});
