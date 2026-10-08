import type { HeadwayByPeriod, PeriodKey } from './config.js';

/** The largest full-window gap that can still qualify as frequent service. */
export const PERIOD_COVERAGE_MAX_HEADWAY = 60;

export interface PeriodEligibilityFields {
  tier?: string | null;
  headwayByPeriod?: HeadwayByPeriod;
  periodCoverageHeadway?: Partial<Record<PeriodKey, number | null>>;
  worstDirectionPeriodCoverageHeadway?: Partial<Record<PeriodKey, number | null>>;
  maxGapByPeriod?: Partial<Record<PeriodKey, number | null>>;
  headwayByPeriodSustained?: Partial<Record<PeriodKey, boolean>>;
}

function hasOwn(source: object | undefined, key: string): boolean {
  return source != null && Object.prototype.hasOwnProperty.call(source, key);
}

/** Full-window gap used by period filtering, with legacy max-gap fallback. */
export function periodCoverageValue(fields: PeriodEligibilityFields, period: PeriodKey): number | null | undefined {
  if (hasOwn(fields.worstDirectionPeriodCoverageHeadway, period)) return fields.worstDirectionPeriodCoverageHeadway?.[period];
  if (hasOwn(fields.periodCoverageHeadway, period)) return fields.periodCoverageHeadway?.[period];
  if (fields.tier !== 'span' && hasOwn(fields.maxGapByPeriod, period)) return fields.maxGapByPeriod?.[period];
  return undefined;
}

/** Whether an artifact supplied coverage data for this period, including explicit null. */
export function hasPeriodCoverageValue(fields: PeriodEligibilityFields, period: PeriodKey): boolean {
  return hasOwn(fields.worstDirectionPeriodCoverageHeadway, period)
    || hasOwn(fields.periodCoverageHeadway, period)
    || (fields.tier !== 'span' && hasOwn(fields.maxGapByPeriod, period));
}

/** Whether any period coverage data exists on the artifact. */
export function hasAnyPeriodCoverage(fields: PeriodEligibilityFields): boolean {
  return fields.worstDirectionPeriodCoverageHeadway !== undefined
    || fields.periodCoverageHeadway !== undefined
    || (fields.tier !== 'span' && fields.maxGapByPeriod !== undefined);
}

/** Whether the artifact explicitly supplied a period summary, including null. */
export function hasPeriodSummary(fields: PeriodEligibilityFields, period: PeriodKey): boolean {
  return hasOwn(fields.headwayByPeriod, period)
    || (period === 'late' && hasOwn(fields.headwayByPeriod, 'lateNight'));
}

/** Whether an explicit period summary says that the period has no service. */
export function hasNoPeriodService(fields: PeriodEligibilityFields, period: PeriodKey): boolean {
  if (!fields.headwayByPeriod) return false;
  if (hasOwn(fields.headwayByPeriod, period)) return fields.headwayByPeriod[period] == null;
  return period === 'late'
    && hasOwn(fields.headwayByPeriod, 'lateNight')
    && (fields.headwayByPeriod as Record<string, number | null>)['lateNight'] == null;
}

/** Legacy records cannot use an unsustained median as proof of filterable service. */
export function isUnsustainedWithoutCoverage(fields: PeriodEligibilityFields, period: PeriodKey): boolean {
  return fields.headwayByPeriodSustained?.[period] === false
    && !hasPeriodCoverageValue(fields, period);
}
