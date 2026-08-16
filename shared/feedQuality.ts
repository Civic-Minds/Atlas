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
      reasons: [input.featureCount === 0 ? 'No route features were produced.' : 'The feed has validation errors.'],
      metrics: metricsFrom(input),
      checkedAt,
    };
  }

  if (input.validationWarnings > 0) {
    score -= Math.min(30, input.validationWarnings * 10);
    reasons.push(`${input.validationWarnings} validation warning${input.validationWarnings === 1 ? '' : 's'}.`);
  }
  if (input.shapeAnomalies > 0) {
    score -= Math.min(30, input.shapeAnomalies * 10);
    reasons.push(`${input.shapeAnomalies} shape correction${input.shapeAnomalies === 1 ? '' : 's'} needed.`);
  }
  if (input.routeHeadwayMismatches > 0) {
    score -= Math.min(30, input.routeHeadwayMismatches * 10);
    reasons.push(`${input.routeHeadwayMismatches} route frequency metric${input.routeHeadwayMismatches === 1 ? '' : 's'} need review.`);
  }
  if (isExpired(input.feedExpiry, checkedAt)) {
    score -= 35;
    reasons.push('The feed schedule has expired.');
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
