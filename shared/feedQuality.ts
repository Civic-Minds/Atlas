import { isExpiredFeedExpiry } from './feedAvailability';
import { plural } from './overflowText';

export type FeedQualityStatus = 'healthy' | 'review' | 'degraded' | 'unusable' | 'paused';

export interface FeedQualityMetrics {
  validationErrors: number;
  validationWarnings: number;
  shapeAnomalies: number;
  routeHeadwayMismatches: number;
  featureCount: number;
  /**
   * The expiry the rating was scored with (CIV-533), so a later re-score reads the same date.
   * Missing on ratings made before it was stored.
   */
  feedExpiry?: string | null;
  /**
   * CIV-533 share rules: the agency's route count and the routes each problem touches. A rating made
   * before these were stored has none of them and keeps the count rules it was made with.
   */
  routeCount?: number;
  /** Shapes Atlas could not repair: cut short at an implausible jump, or a detour the repair left in place. */
  problemShapes?: number;
  /** Routes drawn on one of those shapes. */
  problemShapeRoutes?: number;
  /** Routes with a main-line row whose headline is far slower than its own stops (tail and variant rows are left out). */
  mismatchRoutes?: number;
  /** With no routes in the read week: the first later date one of the file's routes runs again (a seasonal pause). */
  resumesOn?: string | null;
}

export interface FeedQuality {
  status: FeedQualityStatus;
  score: number;
  reasons: string[];
  metrics: FeedQualityMetrics;
  /** When the feed was processed and measured. */
  checkedAt: string;
  /** When the date-based part (the expiry check) was last scored, if later than checkedAt (CIV-533). */
  scoredAt?: string;
}

export interface FeedQualityInput extends FeedQualityMetrics {
  checkedAt?: string;
}

export function feedQualityReasonForValidationWarnings(count: number): string {
  return `${count} minor schedule ${plural(count, 'issue')} found while reading the feed.`;
}

export function feedQualityReasonForShapeAnomalies(count: number): string {
  return `${count} route ${plural(count, 'shape needed', 'shapes needed')} adjustment before display.`;
}

export function feedQualityReasonForHeadwayMismatches(count: number): string {
  return `${count} route ${plural(count, 'has', 'have')} stops whose frequency differs from the overall route schedule.`;
}

export const FEED_QUALITY_EXPIRED_REASON = 'The schedule dates in this feed have passed.';
export const FEED_QUALITY_NO_ROUTES_REASON = 'Atlas could not find any usable routes in this feed.';
export const FEED_QUALITY_VALIDATION_ERROR_REASON = 'Atlas found errors while reading this feed.';

function isExpired(expiry: string | null | undefined, today: string): boolean {
  return isExpiredFeedExpiry(expiry, today.replaceAll('-', ''));
}

/**
 * Turn processing evidence into a conservative, explainable beta rating.
 * A review rating keeps usable data visible; only clearly broken output is unusable.
 */
export function assessFeedQuality(input: FeedQualityInput): FeedQuality {
  return input.routeCount === undefined ? assessByCounts(input) : assessByShares(input);
}

/** Share of the agency's routes, as a penalty of one point per percent, capped like the count rules. */
function sharePenalty(routes: number, routeCount: number): number {
  return routeCount > 0 ? Math.min(30, Math.round((100 * routes) / routeCount)) : 0;
}

/**
 * CIV-533 (Ryan, 2026-10-29): penalties read the share of the agency's routes a problem touches, so
 * size alone never lowers a score. Shapes Atlas repaired are not problems, and a tail or variant row
 * (split from the main line by design) is not a mismatch. A feed with no routes in the read week but
 * routes that run again later in the same file is a seasonal pause, rated paused until that date.
 */
function assessByShares(input: FeedQualityInput): FeedQuality {
  const reasons: string[] = [];
  let score = 100;
  const checkedAt = input.checkedAt ?? new Date().toISOString().slice(0, 10);
  const routeCount = input.routeCount ?? 0;

  if (input.validationErrors === 0 && input.featureCount === 0 && input.resumesOn && checkedAt.replaceAll('-', '') < input.resumesOn) {
    return { status: 'paused', score: 0, reasons: [], metrics: metricsFrom(input), checkedAt };
  }
  if (input.featureCount === 0 || input.validationErrors > 0) {
    return {
      status: 'unusable',
      score: 0,
      reasons: [input.featureCount === 0 ? FEED_QUALITY_NO_ROUTES_REASON : FEED_QUALITY_VALIDATION_ERROR_REASON],
      metrics: metricsFrom(input),
      checkedAt,
    };
  }

  if (input.validationWarnings > 0) {
    score -= Math.min(30, input.validationWarnings * 10);
    reasons.push(feedQualityReasonForValidationWarnings(input.validationWarnings));
  }
  if ((input.problemShapes ?? 0) > 0) {
    score -= sharePenalty(input.problemShapeRoutes ?? 0, routeCount);
    reasons.push(feedQualityReasonForShapeAnomalies(input.problemShapes!));
  }
  if ((input.mismatchRoutes ?? 0) > 0) {
    score -= sharePenalty(input.mismatchRoutes!, routeCount);
    reasons.push(feedQualityReasonForHeadwayMismatches(input.mismatchRoutes!));
  }
  if (isExpired(input.feedExpiry, checkedAt)) {
    score -= 35;
    reasons.push(FEED_QUALITY_EXPIRED_REASON);
  }

  const status: FeedQualityStatus = isExpired(input.feedExpiry, checkedAt) || score < 60
    ? 'degraded'
    : reasons.length > 0
      ? 'review'
      : 'healthy';

  return { status, score: Math.max(0, score), reasons, metrics: metricsFrom(input), checkedAt };
}

/** The count rules every rating made before CIV-533's share rules was scored with. */
export function assessByCounts(input: FeedQualityInput): FeedQuality {
  const reasons: string[] = [];
  let score = 100;
  const checkedAt = input.checkedAt ?? new Date().toISOString().slice(0, 10);

  if (input.featureCount === 0 || input.validationErrors > 0) {
    return {
      status: 'unusable',
      score: 0,
      reasons: [input.featureCount === 0 ? FEED_QUALITY_NO_ROUTES_REASON : FEED_QUALITY_VALIDATION_ERROR_REASON],
      metrics: metricsFrom(input),
      checkedAt,
    };
  }

  if (input.validationWarnings > 0) {
    score -= Math.min(30, input.validationWarnings * 10);
    reasons.push(feedQualityReasonForValidationWarnings(input.validationWarnings));
  }
  if (input.shapeAnomalies > 0) {
    score -= Math.min(30, input.shapeAnomalies * 10);
    reasons.push(feedQualityReasonForShapeAnomalies(input.shapeAnomalies));
  }
  if (input.routeHeadwayMismatches > 0) {
    score -= Math.min(30, input.routeHeadwayMismatches * 10);
    reasons.push(feedQualityReasonForHeadwayMismatches(input.routeHeadwayMismatches));
  }
  if (isExpired(input.feedExpiry, checkedAt)) {
    score -= 35;
    reasons.push(FEED_QUALITY_EXPIRED_REASON);
  }

  const status: FeedQualityStatus = isExpired(input.feedExpiry, checkedAt) || score < 60
    ? 'degraded'
    : reasons.length > 0
      ? 'review'
      : 'healthy';

  return { status, score: Math.max(0, score), reasons, metrics: metricsFrom(input), checkedAt };
}

/**
 * CIV-533: re-score a stored rating for `today` without reprocessing the feed. The only date-based
 * part is the expiry check; everything else comes from the stored metrics, with the expiry the rating
 * was scored with. checkedAt stays the date the feed was measured; scoredAt records today.
 *
 * A rating made before the expiry was stored is re-scored with the registry's `fallbackExpiry` only
 * when that reproduces the stored score and status on its own date. Otherwise the expiry it used is
 * unknown (coast-transit-ms: scored expired, registry now 20261231), and it stays as it is rather than
 * reading healthier than it was measured.
 */
export function rescoreFeedQuality(quality: FeedQuality, fallbackExpiry: string | null | undefined, today: string): FeedQuality {
  let feedExpiry = quality.metrics.feedExpiry;
  if (feedExpiry === undefined) {
    const own = assessFeedQuality({ ...quality.metrics, feedExpiry: fallbackExpiry, checkedAt: quality.scoredAt ?? quality.checkedAt });
    if (own.status !== quality.status || own.score !== quality.score) return quality;
    feedExpiry = fallbackExpiry ?? null;
  }
  const scored = assessFeedQuality({ ...quality.metrics, feedExpiry, checkedAt: today });
  return { ...scored, checkedAt: quality.checkedAt, scoredAt: today };
}

function metricsFrom(input: FeedQualityInput): FeedQualityMetrics {
  return {
    validationErrors: input.validationErrors,
    validationWarnings: input.validationWarnings,
    shapeAnomalies: input.shapeAnomalies,
    routeHeadwayMismatches: input.routeHeadwayMismatches,
    featureCount: input.featureCount,
    ...(input.feedExpiry !== undefined ? { feedExpiry: input.feedExpiry } : {}),
    ...(input.routeCount !== undefined ? {
      routeCount: input.routeCount,
      problemShapes: input.problemShapes ?? 0,
      problemShapeRoutes: input.problemShapeRoutes ?? 0,
      mismatchRoutes: input.mismatchRoutes ?? 0,
      resumesOn: input.resumesOn ?? null,
    } : {}),
  };
}

export function qualityStatusLabel(status: FeedQualityStatus): string {
  return {
    healthy: 'Healthy',
    review: 'Review',
    degraded: 'Degraded',
    unusable: 'Unusable',
    paused: 'Paused',
  }[status];
}

/**
 * Keep persisted quality records readable when their wording predates the
 * current rider-facing copy.
 */
export function presentFeedQualityReason(reason: string): string {
  const shapeMatch = reason.match(/^(\d+) map lines? (?:was|were) repaired — Atlas fixed unusual route geometry before displaying it\.$/);
  if (shapeMatch) {
    const count = Number(shapeMatch[1]);
    return `${count} route ${plural(count, 'shape needed', 'shapes needed')} adjustment before display.`;
  }

  const frequencyMatch = reason.match(/^\d+ route (?:frequency needs|frequencies need) checking — some stops appear to have more frequent service than the route's overall schedule suggests\.$/);
  if (frequencyMatch) {
    const countMatch = reason.match(/^(\d+)/);
    const count = Number(countMatch?.[1] ?? 0);
    return `${count} route ${plural(count, 'has', 'have')} stops whose frequency differs from the overall route schedule.`;
  }

  if (reason === 'No route features were produced.') return FEED_QUALITY_NO_ROUTES_REASON;
  if (reason === 'The feed has validation errors.') return FEED_QUALITY_VALIDATION_ERROR_REASON;
  const warningMatch = reason.match(/^(\d+) schedule-data warnings? — Atlas found a minor issue while reading the schedule\.$/);
  if (warningMatch) {
    const count = Number(warningMatch[1]);
    return feedQualityReasonForValidationWarnings(count);
  }
  if (reason === 'The feed schedule has expired.') return FEED_QUALITY_EXPIRED_REASON;
  return reason;
}

/**
 * Short pieces for one agency's line in the Settings list of hidden feeds:
 * "26 shapes adjusted", "2 routes with frequency mismatches", then any other
 * reason in its usual wording minus the closing full stop (they sit in a joined line). The counts come from the same reasons the cards use.
 */
export function feedQualityListItems(reasons: readonly string[]): string[] {
  let shapes = 0;
  let frequencies = 0;
  const others: string[] = [];
  for (const reason of reasons) {
    const presented = presentFeedQualityReason(reason);
    const count = Number(presented.match(/^(\d+)/)?.[1] ?? 0);
    if (count > 0 && /\bshapes?\b|map lines?/.test(presented)) shapes += count;
    else if (count > 0 && /frequenc/.test(presented)) frequencies += count;
    else others.push(presented.replace(/\.$/, ''));
  }
  const items: string[] = [];
  if (shapes > 0) items.push(`${shapes} ${plural(shapes, 'shape')} adjusted`);
  if (frequencies > 0) items.push(`${frequencies} ${plural(frequencies, 'route')} with frequency mismatches`);
  return [...items, ...others];
}
