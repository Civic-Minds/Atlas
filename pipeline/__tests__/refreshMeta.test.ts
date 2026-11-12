import { describe, expect, it } from 'vitest';
import { candidateIsOlderThanActive, decideRefreshSkipUnchanged, feedFileDate, lowerStoredFeedExpiry, isFeedExpired, markFeedStale, rawArchiveKeyDigest, recordedFeedExpiry, routeLineCount, shouldReplaceExpiredFeed, shouldSkipAllExpiredFeeds, shouldStampFeedMeta, stampFeedMeta, stampReprocessedFeedExpiry, stampSupplementalFeedMeta } from '../refreshMeta.js';
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

describe('routeLineCount (#634)', () => {
  const stop = { type: 'Feature', geometry: { type: 'Point', coordinates: [0, 0] }, properties: { stopId: 's1' } };
  const line = (routeId: string) => ({ type: 'Feature', geometry: { type: 'LineString', coordinates: [[0, 0], [1, 1]] }, properties: { routeId } });

  it('is 0 for a stops-only artifact, which still has a nonzero feature count', () => {
    expect(routeLineCount(JSON.stringify({ type: 'FeatureCollection', features: [stop, stop] }))).toBe(0);
  });

  it('counts distinct routes drawn as lines', () => {
    const fc = { type: 'FeatureCollection', features: [stop, line('10'), line('10'), line('20'), { ...line('30'), geometry: null }] };
    expect(routeLineCount(JSON.stringify(fc))).toBe(2);
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

  it('records the kept routes\' calendar end, and keeps the raw peeked expiry for the next comparison (#1140)', () => {
    // Snowmass, CIV-829: the excluded routes run to Dec 29, the kept route 3 to Nov 25.
    const agency: { lastFeedExpiry?: string | null; lastPeekedExpiry?: string | null } = {};
    stampFeedMeta(agency, {
      feedExpiry: '20261125',
      feedVersion: null,
      peekedExpiry: '20261229',
      peekedVersion: null,
      todayYmd: '2026-10-27',
      calendarExpiry: '20261125',
    });
    expect(agency.lastFeedExpiry).toBe('20261125');
    expect(agency.lastPeekedExpiry).toBe('20261229');
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

  it('reads feed_info end over a placeholder calendar end (#875)', () => {
    // bc-ferries style: feed_info ends 20270331, calendar runs to 20500101.
    expect(recordedFeedExpiry('20270331', '20500101', '2026-10-07')).toBe('20270331');
    // Simi Valley's 20230601 zip: feed_info ends 20250601 under a 20301231 calendar, so the feed
    // is expired; it used to read current to 20270601 (feed_info end + 2 years).
    expect(recordedFeedExpiry('20250601', '20301231', '20261015')).toBe('20250601');
  });

  it('caps a calendar end at feed_info end + 2 years when the calendar is not a placeholder', () => {
    expect(recordedFeedExpiry('20251001', '20281001', '20261007')).toBe('20271001');
  });

  it('leaves a real calendar extension within the cap unaffected', () => {
    // coast-transit-ms: feed_info ends 20260930, calendar.txt runs to 20261231.
    expect(recordedFeedExpiry('20260930', '20261231', '2026-10-07')).toBe('20261231');
  });

  describe('calendar-only end can only lower the expiry (#1039)', () => {
    const today = '20261023';

    it('lowers a feed_info end the calendar outlived, as MAX needed', () => {
      // MAX: feed_info claims 20350201, but the calendar ends 20250531 (zip unchanged since Nov 2024).
      expect(recordedFeedExpiry('20350201', '20350201', today, '20250531')).toBe('20250531');
      expect(recordedFeedExpiry('20350201', '20350201', today)).toBe('20350201');
    });

    it('lowers a feed_info end that is later than a real calendar end', () => {
      expect(recordedFeedExpiry('20270601', '20270601', today, '20261231')).toBe('20261231');
    });

    it('never raises: a calendar end past the recorded value changes nothing', () => {
      // feed_info earlier than the calendar stays at the #687 later-of-two result, not past it.
      expect(recordedFeedExpiry('20261101', '20261231', today, '20261231')).toBe('20261231');
      expect(recordedFeedExpiry('20261231', '20261231', today, '20270301')).toBe('20261231');
      expect(recordedFeedExpiry('20251001', '20281001', today, '20281001')).toBe(recordedFeedExpiry('20251001', '20281001', today));
    });

    it('ignores a placeholder calendar end (#875)', () => {
      expect(recordedFeedExpiry('20350201', '20350201', today, '20301231')).toBe('20350201');
      expect(recordedFeedExpiry('20270331', '20500101', today, '20500101')).toBe('20270331');
      expect(recordedFeedExpiry('20250601', '20301231', today, '20301231')).toBe('20250601');
    });

    it('keeps stale feed_info with an extended calendar current (#687)', () => {
      // coast-transit-ms: feed_info ends 20260930, calendar runs to 20261231.
      expect(recordedFeedExpiry('20260930', '20261231', today, '20261231')).toBe('20261231');
      expect(recordedFeedExpiry('20260101', '20271231', today, '20271231')).toBe('20271231');
    });

    it('does nothing without a calendar-only end or a recorded value', () => {
      expect(recordedFeedExpiry('20270101', '20270101', today, null)).toBe('20270101');
      expect(recordedFeedExpiry(null, null, today, '20261231')).toBeNull();
    });

    it('reprocess records the lowered expiry too', () => {
      const agency = { lastFeedExpiry: '20350201', lastPeekedExpiry: '20350201' };
      expect(stampReprocessedFeedExpiry(agency, { feedExpiry: '20350201', calendarExpiry: '20350201', calendarOnlyEnd: '20250531', todayYmd: today })).toBe(true);
      expect(agency.lastFeedExpiry).toBe('20250531');
    });

    it('a refresh stamps the lowered expiry', () => {
      const agency: { lastFeedExpiry?: string | null } = {};
      stampFeedMeta(agency, { feedExpiry: '20350201', feedVersion: null, peekedExpiry: '20350201', peekedVersion: null, todayYmd: today, calendarOnlyEnd: '20250531' });
      expect(agency.lastFeedExpiry).toBe('20250531');
    });
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
  it('never skips an agency read as of the run date on the old picker (no service-week key)', () => {
    expect(decideRefreshSkipUnchanged({ ...same, referenceDateFromRunDate: true }).skip).toBe(false);
  });
  // CIV-1101: on the one service-day model the run-date agencies follow the service-week key.
  it('reprocesses a run-date agency when its picked week moved', () => {
    expect(decideRefreshSkipUnchanged({ ...same, referenceDateFromRunDate: true, serviceWeek: 'b', lastServiceWeek: 'a' }).skip).toBe(false);
  });
  it('skips a run-date agency whose picked week did not move', () => {
    expect(decideRefreshSkipUnchanged({ ...same, referenceDateFromRunDate: true, serviceWeek: 'a', lastServiceWeek: 'a' }).skip).toBe(true);
  });
});

describe('unchanged-feed check by zip hash (#1423)', () => {
  // Dutchess: a corrected feed republished with the same end date (and no new version) was skipped.
  const base = { forceRefresh: false, hasSupplementals: false, feedExpired: false, peekedExpiry: '20510930', lastPeekedExpiry: '20510930', lastFeedExpiry: '20510930' };
  const lastRawArchiveKey = '20510930-0123456789abcdef';

  it('reprocesses a corrected zip with the same end date and an unknown version', () => {
    expect(decideRefreshSkipUnchanged({ ...base, peekedVersion: null, lastFeedVersion: '124', zipDigest: 'fedcba9876543210', lastRawArchiveKey }).skip).toBe(false);
  });
  it('reprocesses a corrected zip with the same end date and the same version', () => {
    expect(decideRefreshSkipUnchanged({ ...base, peekedVersion: '124', lastFeedVersion: '124', zipDigest: 'fedcba9876543210', lastRawArchiveKey }).skip).toBe(false);
  });
  it('skips a byte-identical zip', () => {
    expect(decideRefreshSkipUnchanged({ ...base, peekedVersion: null, lastFeedVersion: null, zipDigest: '0123456789abcdef', lastRawArchiveKey })).toEqual({ skip: true, reason: 'skipped (same zip: 0123456789abcdef)' });
  });
  it('skips an identical zip even when no end date was read', () => {
    expect(decideRefreshSkipUnchanged({ ...base, peekedExpiry: null, peekedVersion: null, zipDigest: '0123456789abcdef', lastRawArchiveKey }).skip).toBe(true);
  });
  it('still reprocesses an identical zip whose picked week moved or that has ended', () => {
    expect(decideRefreshSkipUnchanged({ ...base, peekedVersion: null, zipDigest: '0123456789abcdef', lastRawArchiveKey, serviceWeek: 'b', lastServiceWeek: 'a' }).skip).toBe(false);
    expect(decideRefreshSkipUnchanged({ ...base, feedExpired: true, peekedVersion: null, zipDigest: '0123456789abcdef', lastRawArchiveKey }).skip).toBe(false);
  });
  it('keeps the end-date rule for a record without a hash', () => {
    const legacy = { ...base, peekedVersion: null, lastFeedVersion: '124', zipDigest: 'fedcba9876543210' };
    expect(decideRefreshSkipUnchanged(legacy).skip).toBe(true);
    expect(decideRefreshSkipUnchanged({ ...legacy, lastRawArchiveKey: null }).skip).toBe(true);
    // Older archive names carry only a label.
    expect(decideRefreshSkipUnchanged({ ...legacy, lastRawArchiveKey: '20510930' }).skip).toBe(true);
  });
  it('without a recorded key, skips a zip matching the newest archived zip', () => {
    expect(decideRefreshSkipUnchanged({ ...base, peekedVersion: '124', lastFeedVersion: '124', zipDigest: '0123456789abcdef', archivedRawKey: '20510930-0123456789abcdef' })).toEqual({ skip: true, reason: 'skipped (same zip: 0123456789abcdef)' });
  });
  it('without a recorded key, reprocesses a zip that differs from the newest archived zip (Dutchess)', () => {
    expect(decideRefreshSkipUnchanged({ ...base, peekedVersion: '124', lastFeedVersion: '124', zipDigest: 'fedcba9876543210', archivedRawKey: '20510930-0123456789abcdef' }).skip).toBe(false);
    expect(decideRefreshSkipUnchanged({ ...base, peekedVersion: null, lastFeedVersion: '124', zipDigest: 'fedcba9876543210', archivedRawKey: '20510930-0123456789abcdef' }).skip).toBe(false);
  });
  it('a recorded key wins over the archive', () => {
    expect(decideRefreshSkipUnchanged({ ...base, peekedVersion: null, zipDigest: '0123456789abcdef', lastRawArchiveKey, archivedRawKey: '20510930-fedcba9876543210' }).skip).toBe(true);
  });
  it('keeps the end-date rule when the archive is empty or unreadable', () => {
    expect(decideRefreshSkipUnchanged({ ...base, peekedVersion: '124', lastFeedVersion: '124', zipDigest: 'fedcba9876543210', archivedRawKey: null }).skip).toBe(true);
    expect(decideRefreshSkipUnchanged({ ...base, peekedVersion: '124', lastFeedVersion: '124', zipDigest: 'fedcba9876543210', archivedRawKey: 'en' }).skip).toBe(true);
  });
  it('reads the hash from an archive key', () => {
    expect(rawArchiveKeyDigest('20240630-cc0eb0e68ef49960')).toBe('cc0eb0e68ef49960');
    expect(rawArchiveKeyDigest('v1-2-cc0eb0e68ef49960')).toBe('cc0eb0e68ef49960');
    expect(rawArchiveKeyDigest('20240630')).toBeNull();
    expect(rawArchiveKeyDigest(null)).toBeNull();
  });
  it('a refresh records the archive key it processed', () => {
    const agency: Record<string, unknown> = { lastRawArchiveKey: '20240630-cc0eb0e68ef49960' };
    stampFeedMeta(agency, { feedExpiry: '20510930', feedVersion: '124', peekedExpiry: '20510930', peekedVersion: '124', todayYmd: '2026-11-11', rawArchiveKey: lastRawArchiveKey });
    expect(agency.lastRawArchiveKey).toBe(lastRawArchiveKey);
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

  it('reads a placeholder calendar end like a refresh does', () => {
    const agency = { lastFeedExpiry: '20261001' };
    stampReprocessedFeedExpiry(agency, { feedExpiry: '20270101', calendarExpiry: '20991231', todayYmd });
    expect(agency).toEqual({ lastFeedExpiry: recordedFeedExpiry('20270101', '20991231', todayYmd), lastPeekedExpiry: '20991231' });
    expect(agency.lastFeedExpiry).toBe('20270101');
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

describe('CIV-1011 stage 4: the picked week and the listing end', () => {
  const base = { forceRefresh: false, hasSupplementals: false, feedExpired: false, peekedExpiry: '20261231', peekedVersion: 'v1', lastPeekedExpiry: '20261231', lastFeedVersion: 'v1' };

  it('skips an unchanged feed whose picked week is unchanged, and reprocesses when it moves', () => {
    expect(decideRefreshSkipUnchanged({ ...base, serviceWeek: 'abc', lastServiceWeek: 'abc' }).skip).toBe(true);
    expect(decideRefreshSkipUnchanged({ ...base, serviceWeek: 'def', lastServiceWeek: 'abc' }).skip).toBe(false);
    // First run with the key on record: reprocess once so it is stamped.
    expect(decideRefreshSkipUnchanged({ ...base, serviceWeek: 'abc' }).skip).toBe(false);
    // The old picker (kill switch) passes no key: unchanged as before.
    expect(decideRefreshSkipUnchanged({ ...base, serviceWeek: null }).skip).toBe(true);
  });

  it('records the listing end and the picked week, and clears the end when it no longer holds', () => {
    const agency: Record<string, unknown> = {};
    stampFeedMeta(agency, { feedExpiry: '20261231', feedVersion: 'v1', peekedExpiry: '20261231', peekedVersion: 'v1', todayYmd: '20261027', listingEnd: '20261028', serviceWeek: 'abc' });
    expect(agency.listingEndedOn).toBe('20261028');
    expect(agency.lastServiceWeek).toBe('abc');
    stampFeedMeta(agency, { feedExpiry: '20261231', feedVersion: 'v2', peekedExpiry: '20261231', peekedVersion: 'v2', todayYmd: '20261103', listingEnd: null, serviceWeek: 'def' });
    expect(agency).not.toHaveProperty('listingEndedOn');
    expect(agency.lastServiceWeek).toBe('def');
  });

  it('a reprocess records a new listing end even when the expiry is unchanged', () => {
    const agency: Record<string, unknown> = { lastFeedExpiry: '20261231', lastPeekedExpiry: '20261231' };
    expect(stampReprocessedFeedExpiry(agency, { feedExpiry: '20261231', calendarExpiry: '20261231', todayYmd: '20261027', listingEnd: '20261028' })).toBe(true);
    expect(agency.listingEndedOn).toBe('20261028');
  });
});

describe('lowerStoredFeedExpiry: an unchanged feed gets today\'s expiry rule (CIV-443)', () => {
  const today = '20261027';
  it('lowers MAX\'s stored feed_info end to the calendar\'s last service date', () => {
    const agency = { lastFeedExpiry: '20350201' };
    expect(lowerStoredFeedExpiry(agency, { feedInfoEnd: '20350201', calendarEnd: '20250531', calendarOnlyEnd: '20250531', todayYmd: today })).toBe('20350201');
    expect(agency.lastFeedExpiry).toBe('20250531');
    // Recorded once: the next unchanged run changes nothing.
    expect(lowerStoredFeedExpiry(agency, { feedInfoEnd: '20350201', calendarEnd: '20250531', calendarOnlyEnd: '20250531', todayYmd: today })).toBeNull();
  });

  it('never raises, and leaves a placeholder calendar and a matching value alone', () => {
    const later = { lastFeedExpiry: '20260101' };
    expect(lowerStoredFeedExpiry(later, { feedInfoEnd: '20270101', calendarEnd: '20270101', calendarOnlyEnd: '20270101', todayYmd: today })).toBeNull();
    expect(later.lastFeedExpiry).toBe('20260101');
    // Brownsville-style placeholder 20501230: today's rule caps it at today + 2 years, which is not the calendar's end.
    const placeholder = { lastFeedExpiry: '20501230' };
    expect(lowerStoredFeedExpiry(placeholder, { feedInfoEnd: null, calendarEnd: '20501230', calendarOnlyEnd: '20501230', todayYmd: today })).toBeNull();
    expect(placeholder.lastFeedExpiry).toBe('20501230');
    const same = { lastFeedExpiry: '20270609' };
    expect(lowerStoredFeedExpiry(same, { feedInfoEnd: '20270609', calendarEnd: '20270609', calendarOnlyEnd: '20270609', todayYmd: today })).toBeNull();
  });

  it('records a real calendar end earlier than feed_info that has not passed yet', () => {
    const agency = { lastFeedExpiry: '20261231' };
    expect(lowerStoredFeedExpiry(agency, { feedInfoEnd: '20261231', calendarEnd: '20261126', calendarOnlyEnd: '20261126', todayYmd: today })).toBe('20261231');
    expect(agency.lastFeedExpiry).toBe('20261126');
  });
});

describe('feedFileDate (#1253)', () => {
  it('a new file is obtained on the run date', () => {
    expect(feedFileDate({ newFile: true, runDate: '20261102', feedObtainedAt: '20260101', zipDate: '20260421' })).toBe('20261102');
  });
  it('an unchanged file keeps its recorded date', () => {
    expect(feedFileDate({ newFile: false, runDate: '20261102', feedObtainedAt: '20260915', zipDate: '20260421' })).toBe('20260915');
  });
  it('with no recorded date it takes the zip\'s own date, never the last refresh (Miami: April file, refreshed Sep 17)', () => {
    expect(feedFileDate({ newFile: false, runDate: '20261102', feedObtainedAt: null, zipDate: '20260421' })).toBe('20260421');
    expect(feedFileDate({ newFile: false, runDate: '20261102', feedObtainedAt: undefined, zipDate: null })).toBeNull();
  });
});

describe('candidateIsOlderThanActive: a placeholder stamp sets no floor (CIV-1351)', () => {
  const refreshed = '2026-11-02';

  it('st-george: the city feed is not older than a stamp recorded from the 2031 placeholder', () => {
    // The rebuild stamped the old timetable back: 20310130 capped to 20281106. The refresh of 2026-11-06 01:04 refused
    // the city feed as "20271231 < 20310130"; with the cap it would still read 20271231 < 20281106.
    const active = { lastFeedExpiry: '20281106', lastPeekedExpiry: '20310130', lastRefreshedAt: refreshed };
    expect(candidateIsOlderThanActive({ candidateExpiry: '20271231', existingExpiry: active.lastFeedExpiry, existingPeekedExpiry: active.lastPeekedExpiry, recordedAt: active.lastRefreshedAt })).toBe(false);
    expect(candidateIsOlderThanActive({ candidateExpiry: '20271231', existingExpiry: '20310130', existingPeekedExpiry: '20310130', recordedAt: refreshed })).toBe(false);
  });

  it('an uncapped feed_info placeholder (dutchess 20510930) and an old record without a peeked end (appleton 20991231) set no floor either', () => {
    expect(candidateIsOlderThanActive({ candidateExpiry: '20270601', existingExpiry: '20510930', existingPeekedExpiry: '20510930', recordedAt: refreshed })).toBe(false);
    expect(candidateIsOlderThanActive({ candidateExpiry: '20270102', existingExpiry: '20991231', existingPeekedExpiry: null, recordedAt: '2026-08-10' })).toBe(false);
    // No record date at all: read against today.
    expect(candidateIsOlderThanActive({ candidateExpiry: '20270102', existingExpiry: '20991231', todayYmd: '20261106' })).toBe(false);
  });

  it('a real stamp still refuses an older or undated download, and a stamp two years out to the day is still a floor', () => {
    // tulsa-transit, 2026-11-03: 20261205 < 20261231, stamp recorded 2026-08-10.
    expect(candidateIsOlderThanActive({ candidateExpiry: '20261205', existingExpiry: '20261231', existingPeekedExpiry: null, recordedAt: '2026-08-10' })).toBe(true);
    expect(candidateIsOlderThanActive({ candidateExpiry: null, existingExpiry: '20261231', existingPeekedExpiry: '20261231', recordedAt: refreshed })).toBe(true);
    expect(candidateIsOlderThanActive({ candidateExpiry: '20270601', existingExpiry: '20281102', existingPeekedExpiry: '20281102', recordedAt: refreshed })).toBe(true);
    expect(candidateIsOlderThanActive({ candidateExpiry: '20270601', existingExpiry: '20281103', existingPeekedExpiry: '20281103', recordedAt: refreshed })).toBe(false);
    // The record date, not today, decides: prince-albert's 20281229 stays a placeholder after 2026-12-30.
    expect(candidateIsOlderThanActive({ candidateExpiry: '20270630', existingExpiry: '20281106', existingPeekedExpiry: '20281229', recordedAt: refreshed, todayYmd: '20270115' })).toBe(false);
  });

  it('a placeholder candidate is never older, and no stamp means no floor, as before', () => {
    expect(candidateIsOlderThanActive({ candidateExpiry: '20991231', existingExpiry: '20261231', existingPeekedExpiry: '20261231', recordedAt: refreshed })).toBe(false);
    expect(candidateIsOlderThanActive({ candidateExpiry: '20261205', existingExpiry: null })).toBe(false);
    expect(candidateIsOlderThanActive({ candidateExpiry: '20261205' })).toBe(false);
  });
});

describe('candidateIsOlderThanActive: a later period start is a newer feed, whatever its end (#1359)', () => {
  // A period starts on feed_info's start date, else the earliest calendar start.
  it('tulsa: the September feed (20260910-20261205) is not older than the April feed to 20261231', () => {
    // No stored start yet (every record today): the period began after the live feed was obtained on 2026-08-10.
    expect(candidateIsOlderThanActive({ candidateExpiry: '20261205', candidateStart: '20260910', existingExpiry: '20261231', existingPeekedExpiry: null, recordedAt: '2026-08-10' })).toBe(false);
    // With the live feed's start recorded (lastFeedStart 20260421), the same verdict by the stored start.
    expect(candidateIsOlderThanActive({ candidateExpiry: '20261205', candidateStart: '20260910', existingExpiry: '20261231', existingStart: '20260421', recordedAt: '2026-08-10' })).toBe(false);
    // The obtained date is the more precise record date when the agency has it.
    expect(candidateIsOlderThanActive({ candidateExpiry: '20261206', candidateStart: '20261105', existingExpiry: '20271231', existingPeekedExpiry: '20271231', existingObtainedAt: '20261102', recordedAt: '2026-11-02' })).toBe(false);
  });

  it('qline: an earlier edition with the same start (version 22 against 29) stays refused by its end', () => {
    expect(candidateIsOlderThanActive({ candidateExpiry: '20261223', candidateStart: '20250911', existingExpiry: '20270523', existingStart: '20250911', recordedAt: '2026-10-12' })).toBe(true);
    expect(candidateIsOlderThanActive({ candidateExpiry: '20261223', candidateStart: '20250911', existingExpiry: '20270523', existingPeekedExpiry: '20270523', recordedAt: '2026-10-12' })).toBe(true);
  });

  it('marintransit: a transient older download (earlier start and end) stays refused', () => {
    expect(candidateIsOlderThanActive({ candidateExpiry: '20260912', candidateStart: '20260613', existingExpiry: '20270110', existingStart: '20260913', recordedAt: '2026-11-02' })).toBe(true);
    expect(candidateIsOlderThanActive({ candidateExpiry: '20260912', candidateStart: '20260613', existingExpiry: '20270110', existingPeekedExpiry: '20270110', existingObtainedAt: '20261020', recordedAt: '2026-11-02' })).toBe(true);
  });

  it('greeley: a newer feed starting before the record date is still refused until the live start is stored', () => {
    const greeley = { candidateExpiry: '20270113', candidateStart: '20260820', existingExpiry: '20270228', existingPeekedExpiry: '20270228', recordedAt: '2026-08-27' };
    expect(candidateIsOlderThanActive(greeley)).toBe(true);
    expect(candidateIsOlderThanActive({ ...greeley, existingStart: '20260813' })).toBe(false);
  });

  it('an undated candidate, and one without a start, are judged as before', () => {
    expect(candidateIsOlderThanActive({ candidateExpiry: null, candidateStart: '20261105', existingExpiry: '20261231', existingStart: '20260421', recordedAt: '2026-08-10' })).toBe(true);
    expect(candidateIsOlderThanActive({ candidateExpiry: '20261205', candidateStart: null, existingExpiry: '20261231', existingStart: '20260421', recordedAt: '2026-08-10' })).toBe(true);
    expect(candidateIsOlderThanActive({ candidateExpiry: '20270601', candidateStart: '20270101', existingExpiry: '20261231', existingStart: '20260421', recordedAt: '2026-08-10' })).toBe(false);
  });

  it('the refresh and a reprocess record the live feed\'s period start', () => {
    const agency: Record<string, unknown> = {};
    stampFeedMeta(agency, { feedExpiry: '20261205', feedVersion: '20260910', peekedExpiry: '20261205', peekedVersion: '20260910', todayYmd: '20261106', feedStart: '20260910' });
    expect(agency.lastFeedStart).toBe('20260910');
    const reprocessed: Record<string, unknown> = { lastFeedExpiry: '20261231', lastPeekedExpiry: '20261231', lastFeedStart: '20260421' };
    expect(stampReprocessedFeedExpiry(reprocessed, { feedExpiry: '20261205', calendarExpiry: '20261205', todayYmd: '20261106', feedStart: '20260910' })).toBe(true);
    expect(reprocessed.lastFeedStart).toBe('20260910');
    // The same feed again: nothing changes, nothing is rewritten.
    expect(stampReprocessedFeedExpiry(reprocessed, { feedExpiry: '20261205', calendarExpiry: '20261205', todayYmd: '20261106', feedStart: '20260910' })).toBe(false);
    // A start alone counts as a change, so a record without one gains it on the next rebuild.
    const noStart: Record<string, unknown> = { lastFeedExpiry: '20261205', lastPeekedExpiry: '20261205' };
    expect(stampReprocessedFeedExpiry(noStart, { feedExpiry: '20261205', calendarExpiry: '20261205', todayYmd: '20261106', feedStart: '20260910' })).toBe(true);
    expect(noStart.lastFeedStart).toBe('20260910');
  });
});
