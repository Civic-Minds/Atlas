import type { HeadwayByPeriod, PeriodKey } from './config.js';

/** The largest full-window gap that can still qualify as frequent service. */
export const PERIOD_COVERAGE_MAX_HEADWAY = 60;

/**
 * The filter's value for one period (CIV-2976 F4/F5, the one copy): a consistent period whose wait is within
 * PERIOD_COVERAGE_MAX_HEADWAY reads its spacing (headway), any other its full-window wait (coverage).
 * `capWait` is the wait the cap tests, when it is not `coverage` itself (CIV-1958: stretches test the clock-minute wait).
 */
export function periodFilterValue({ headway, coverage, sustained, capWait = coverage }: {
  headway: number | null;
  coverage: number | null | undefined;
  sustained: boolean;
  capWait?: number | null;
}): number | null | undefined {
  return sustained && coverage != null && capWait != null && capWait <= PERIOD_COVERAGE_MAX_HEADWAY ? headway : coverage;
}

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
