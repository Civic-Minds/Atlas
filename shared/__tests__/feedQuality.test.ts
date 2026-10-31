import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { FEED_QUALITY_EXPIRED_REASON, FEED_QUALITY_NO_ROUTES_REASON, assessFeedQuality, feedQualityListItems, feedQualityToday, presentFeedQualityReason, rescoreFeedQuality, withFeedQualityToday, type FeedQuality } from '../feedQuality';

const healthy = {
  validationErrors: 0,
  validationWarnings: 0,
  shapeAnomalies: 0,
  routeHeadwayMismatches: 0,
  featureCount: 10,
  checkedAt: '2026-08-14',
};

describe('assessFeedQuality', () => {
  it('keeps a usable feed with a metric warning in review', () => {
    const result = assessFeedQuality({ ...healthy, routeHeadwayMismatches: 1 });
    expect(result.status).toBe('review');
    expect(result.score).toBe(90);
  });

  it('does not call a feed unusable because it needs review', () => {
    const result = assessFeedQuality({ ...healthy, shapeAnomalies: 1, validationWarnings: 1 });
    expect(result.status).toBe('review');
    expect(result.reasons).toHaveLength(2);
  });

  it('marks expired feeds degraded', () => {
    const result = assessFeedQuality({ ...healthy, feedExpiry: '20260813' });
    expect(result.status).toBe('degraded');
    expect(result.reasons).toContain('The schedule dates in this feed have passed.');
  });

  it('marks feeds with no route output unusable', () => {
    const result = assessFeedQuality({ ...healthy, featureCount: 0 });
    expect(result.status).toBe('unusable');
    expect(result.score).toBe(0);
  });
});

describe('assessFeedQuality share rules (CIV-533)', () => {
  const shares = { ...healthy, routeCount: 200, problemShapes: 0, problemShapeRoutes: 0, mismatchRoutes: 0, resumesOn: null };

  it('reads the share of routes a problem touches, so size alone never lowers a score', () => {
    // TTC-sized: 7 mismatch routes and 4 problem shapes on 2 routes of 200 lose 4 and 1 points, not 30 and 30.
    expect(assessFeedQuality({ ...shares, mismatchRoutes: 7, problemShapes: 4, problemShapeRoutes: 2 })).toMatchObject({ status: 'review', score: 95 });
    // Small agency: 1 of 3 routes is a third of the service, capped like the count rules.
    expect(assessFeedQuality({ ...shares, routeCount: 3, mismatchRoutes: 1 })).toMatchObject({ status: 'review', score: 70 });
    expect(assessFeedQuality({ ...shares, routeCount: 4, mismatchRoutes: 2, problemShapes: 2, problemShapeRoutes: 2 })).toMatchObject({ status: 'degraded', score: 40 });
  });

  it('leaves out shapes Atlas repaired: only problem shapes give a reason or a penalty', () => {
    expect(assessFeedQuality({ ...shares, shapeAnomalies: 4 })).toMatchObject({ status: 'healthy', score: 100, reasons: [] });
  });

  it('keeps the count rules for validation warnings and expiry', () => {
    expect(assessFeedQuality({ ...shares, validationWarnings: 2 })).toMatchObject({ status: 'review', score: 80 });
    expect(assessFeedQuality({ ...shares, feedExpiry: '20260801' })).toMatchObject({ status: 'degraded', score: 65 });
  });

  it('rates a seasonal pause paused until it resumes, then unusable as a feed with no routes', () => {
    const pause = { ...shares, featureCount: 0, routeCount: 0, resumesOn: '20261122', checkedAt: '2026-10-29' };
    const paused = assessFeedQuality(pause);
    expect(paused).toMatchObject({ status: 'paused', reasons: [] });
    expect(paused.metrics.resumesOn).toBe('20261122');
    expect(rescoreFeedQuality(paused, null, '2026-11-21').status).toBe('paused');
    expect(rescoreFeedQuality(paused, null, '2026-11-22')).toMatchObject({ status: 'unusable', reasons: [FEED_QUALITY_NO_ROUTES_REASON] });
    expect(assessFeedQuality({ ...pause, resumesOn: null }).status).toBe('unusable');
    expect(assessFeedQuality({ ...pause, validationErrors: 1 }).status).toBe('unusable');
  });

  it('a rating made with the share rules re-scores to itself', () => {
    const rated = assessFeedQuality({ ...shares, mismatchRoutes: 7, feedExpiry: '20261231' });
    expect(rescoreFeedQuality(rated, null, rated.checkedAt)).toMatchObject({ status: rated.status, score: rated.score, metrics: rated.metrics });
  });
});

describe('presentFeedQualityReason', () => {
  it('normalizes older persisted route-shape wording', () => {
    expect(presentFeedQualityReason('369 map lines were repaired — Atlas fixed unusual route geometry before displaying it.'))
      .toBe('369 route shapes needed adjustment before display.');
  });

  it('normalizes older persisted frequency wording', () => {
    expect(presentFeedQualityReason("1 route frequency needs checking — some stops appear to have more frequent service than the route's overall schedule suggests."))
      .toBe('1 route has stops whose frequency differs from the overall route schedule.');
  });
});

describe('feedQualityListItems', () => {
  it('shortens shape and frequency reasons, keeping singular and legacy wording', () => {
    expect(feedQualityListItems([
      '26 route shapes needed adjustment before display.',
      '2 route have stops whose frequency differs from the overall route schedule.',
    ])).toEqual(['26 shapes adjusted', '2 routes with frequency mismatches']);
    expect(feedQualityListItems([
      '1 map line was repaired — Atlas fixed unusual route geometry before displaying it.',
      "1 route frequency needs checking — some stops appear to have more frequent service than the route's overall schedule suggests.",
    ])).toEqual(['1 shape adjusted', '1 route with frequency mismatches']);
  });

  it('shows only the parts that apply and keeps other reasons in their existing wording without the closing full stop', () => {
    expect(feedQualityListItems([
      '3 minor schedule issues found while reading the feed.',
      '4 route shapes needed adjustment before display.',
    ])).toEqual(['4 shapes adjusted']); // N81: warnings stay out of rider-facing lists
    expect(feedQualityListItems(["1 schedule-data warning — Atlas found a minor issue while reading the schedule."])).toEqual([]);
    expect(feedQualityListItems(['The schedule dates in this feed have passed.'])).toEqual(['The schedule dates in this feed have passed']);
  });
});

describe('feedQualityToday (#1229)', () => {
  const base = { validationErrors: 0, validationWarnings: 0, shapeAnomalies: 0, routeHeadwayMismatches: 0, featureCount: 10 };
  const now = new Date('2026-11-01T12:00:00Z');

  it('adds the expired reason when a supplemental feed has ended since processing, as the map does', () => {
    const stored = assessFeedQuality({ ...base, feedExpiry: '20270401', checkedAt: '2026-10-19' });
    const lacmta = { lastFeedExpiry: '20270401', lastSupplementalFeeds: [{ feedExpiry: '20261031', feedVersion: null, rawArchiveKey: null }], timezone: 'America/Los_Angeles', feedQuality: stored };
    const today = withFeedQualityToday(lacmta, now).feedQuality!;
    expect(today.reasons).toContain(FEED_QUALITY_EXPIRED_REASON);
    expect(today.status).toBe('degraded');
    // The metrics stay as measured (the expiry the pipeline scored with); only the rating is today's.
    expect(today).toEqual({ ...assessFeedQuality({ ...base, feedExpiry: '20261031', checkedAt: '2026-11-01' }), checkedAt: '2026-10-19', metrics: stored.metrics });
  });

  it('drops a stale expired reason once a newer feed is on file', () => {
    const stored = assessFeedQuality({ ...base, validationWarnings: 1, feedExpiry: '20261001', checkedAt: '2026-10-05' });
    const today = withFeedQualityToday({ lastFeedExpiry: '20261231', timezone: 'America/Toronto', feedQuality: stored }, now).feedQuality!;
    expect(today).toEqual({ ...assessFeedQuality({ ...base, validationWarnings: 1, feedExpiry: '20261231', checkedAt: '2026-10-05' }), metrics: stored.metrics });
  });

  it('leaves a current or unusable rating as it is', () => {
    const current = assessFeedQuality({ ...base, feedExpiry: '20261231', checkedAt: '2026-10-05' });
    expect(feedQualityToday(current, false)).toBe(current);
    const unusable = assessFeedQuality({ ...base, featureCount: 0, checkedAt: '2026-10-05' });
    expect(feedQualityToday(unusable, true)).toBe(unusable);
    const paused: FeedQuality = { status: 'paused', score: 0, reasons: [], metrics: unusable.metrics, checkedAt: '2026-10-05' };
    expect(feedQualityToday(paused, true)).toBe(paused);
  });
});

describe('rescoreFeedQuality (CIV-533)', () => {
  const measured = assessFeedQuality({ ...healthy, routeHeadwayMismatches: 1, feedExpiry: '20261231', checkedAt: '2026-10-07' });

  it('stores the expiry the rating was scored with', () => {
    expect(measured.metrics.feedExpiry).toBe('20261231');
    expect(measured).toMatchObject({ status: 'review', score: 90 });
  });

  it('checks the expiry against the run date, and keeps the measured date as checkedAt', () => {
    const later = rescoreFeedQuality(measured, '20271231', '2027-01-05');
    expect(later).toMatchObject({ status: 'degraded', score: 55, checkedAt: '2026-10-07', scoredAt: '2027-01-05' });
    expect(later.reasons).toContain('The schedule dates in this feed have passed.');
    expect(rescoreFeedQuality(measured, null, '2026-11-02')).toMatchObject({ status: 'review', score: 90, scoredAt: '2026-11-02' });
  });

  it('re-scores a rating made before the expiry was stored only when the registry date reproduces it', () => {
    const { feedExpiry: _drop, ...legacyMetrics } = measured.metrics;
    const legacy: FeedQuality = { ...measured, metrics: legacyMetrics };
    expect(rescoreFeedQuality(legacy, '20261231', '2026-11-02')).toMatchObject({ status: 'review', scoredAt: '2026-11-02' });
    // coast-transit-ms: scored expired on 2026-10-07, while the registry now records 20261231.
    const expired = assessFeedQuality({ ...healthy, validationWarnings: 1, feedExpiry: '20261001', checkedAt: '2026-10-07' });
    const { feedExpiry: _gone, ...expiredMetrics } = expired.metrics;
    const unknown: FeedQuality = { ...expired, metrics: expiredMetrics };
    expect(rescoreFeedQuality(unknown, '20261231', '2026-11-02')).toBe(unknown);
  });

  it('every stored rating re-scores to its own status and score on its own date', () => {
    const dir = resolve(__dirname, '../../config/agencies');
    const mismatches: string[] = [];
    let checked = 0;
    for (const file of readdirSync(dir).filter(name => name.endsWith('.json') && name !== 'order.json')) {
      const agency = JSON.parse(readFileSync(resolve(dir, file), 'utf8')) as { slug?: string; lastFeedExpiry?: string | null; feedQuality?: FeedQuality };
      const quality = agency.feedQuality;
      if (!quality) continue;
      checked++;
      const again = rescoreFeedQuality(quality, agency.lastFeedExpiry, quality.scoredAt ?? quality.checkedAt);
      if (again.status !== quality.status || again.score !== quality.score) mismatches.push(`${agency.slug}: ${quality.status}/${quality.score} -> ${again.status}/${again.score}`);
    }
    expect(checked).toBeGreaterThan(100);
    expect(mismatches).toEqual([]);
  });
});
