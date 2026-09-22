export type FeedQualityStatus = 'healthy' | 'review' | 'degraded' | 'unusable';

export interface FeedQualityMetrics {
  validationErrors: number;
  validationWarnings: number;
  shapeAnomalies: number;
  routeHeadwayMismatches: number;
  featureCount: number;
}

export interface FeedQuality {
  status: FeedQualityStatus;
  score: number;
  reasons: string[];
  metrics: FeedQualityMetrics;
  checkedAt: string;
}

export interface FeedQualityInput extends FeedQualityMetrics {
  feedExpiry?: string | null;
  checkedAt?: string;
}

export function feedQualityReasonForValidationWarnings(count: number): string {
  return `${count} minor schedule ${count === 1 ? 'issue' : 'issues'} found while reading the feed.`;
}

export function feedQualityReasonForShapeAnomalies(count: number): string {
  return `${count} route ${count === 1 ? 'shape needed' : 'shapes needed'} adjustment before display.`;
}

export function feedQualityReasonForHeadwayMismatches(count: number): string {
  return `${count} route ${count === 1 ? 'has' : 'have'} stops whose frequency differs from the overall route schedule.`;
}

export const FEED_QUALITY_EXPIRED_REASON = 'The schedule dates in this feed have passed.';
export const FEED_QUALITY_NO_ROUTES_REASON = 'Atlas could not find any usable routes in this feed.';
export const FEED_QUALITY_VALIDATION_ERROR_REASON = 'Atlas found errors while reading this feed.';

function isExpired(expiry: string | null | undefined, today: string): boolean {
  return Boolean(expiry && /^\d{8}$/.test(expiry) && expiry < today.replaceAll('-', ''));
}

/**
 * Turn processing evidence into a conservative, explainable beta rating.
 * A review rating keeps usable data visible; only clearly broken output is unusable.
 */
export function assessFeedQuality(input: FeedQualityInput): FeedQuality {
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

function metricsFrom(input: FeedQualityInput): FeedQualityMetrics {
  return {
    validationErrors: input.validationErrors,
    validationWarnings: input.validationWarnings,
    shapeAnomalies: input.shapeAnomalies,
    routeHeadwayMismatches: input.routeHeadwayMismatches,
    featureCount: input.featureCount,
  };
}

export function qualityStatusLabel(status: FeedQualityStatus): string {
  return {
    healthy: 'Healthy',
    review: 'Review',
    degraded: 'Degraded',
    unusable: 'Unusable',
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
    return `${count} route ${count === 1 ? 'shape needed' : 'shapes needed'} adjustment before display.`;
  }

  const frequencyMatch = reason.match(/^\d+ route (?:frequency needs|frequencies need) checking — some stops appear to have more frequent service than the route's overall schedule suggests\.$/);
  if (frequencyMatch) {
    const countMatch = reason.match(/^(\d+)/);
    const count = Number(countMatch?.[1] ?? 0);
    return `${count} route ${count === 1 ? 'has' : 'have'} stops whose frequency differs from the overall route schedule.`;
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
