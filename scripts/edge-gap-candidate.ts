import { applyAnalysisCriteria, determineTier, type TierDeterminer, type TierDeterminerContext } from '../pipeline/transit-phase2';
import { DEFAULT_CRITERIA } from '../pipeline/defaults';
import type { AnalysisResult, RawRouteDepartures } from '../types/gtfs';

const EDGE_ALLOWANCE_MINUTES = 10;

const qualifiesAtTier = (
  times: readonly number[],
  tier: number,
  graceMinutes: number,
  maxGraceViolations: number,
  gracePercent: number,
  violationPercent: number,
): boolean => {
  if (times.length < 2) return false;
  const gaps = times.slice(1).map((time, index) => time - times[index]);
  return determineTier(
    gaps,
    times.length,
    times[times.length - 1] - times[0],
    [tier],
    graceMinutes,
    maxGraceViolations,
    gracePercent,
    violationPercent,
  ) === String(tier);
};

const candidateTier: TierDeterminer = (
  headways,
  tripCount,
  spanMinutes,
  tiers,
  graceMinutes,
  maxGraceViolations,
  gracePercent,
  violationPercent,
  context: TierDeterminerContext,
): string => {
  const analysisTimes = [...context.analysisTimes];
  const rawTimes = context.rawDepartureTimes;
  const actualOpening = !rawTimes.some(time => time < analysisTimes[0]);
  const actualClosing = !rawTimes.some(time => time > analysisTimes[analysisTimes.length - 1]);

  for (const tier of tiers) {
    const gaps = analysisTimes.slice(1).map((time, index) => time - analysisTimes[index]);
    const existingGrace = Math.max(graceMinutes, Math.round(tier * gracePercent));
    const openingEligible = actualOpening && gaps[0] > tier + existingGrace && gaps[0] <= tier + EDGE_ALLOWANCE_MINUTES;
    const closingEligible = actualClosing && gaps[gaps.length - 1] > tier + existingGrace && gaps[gaps.length - 1] <= tier + EDGE_ALLOWANCE_MINUTES;
    const variants: boolean[] = [];
    if (openingEligible) variants.push(true);
    if (closingEligible) variants.push(false);

    // At most one exception is allowed. When both ends qualify, test each side
    // independently; the first qualifying result is the fastest tier because tiers
    // are tested in ascending order.
    for (const opening of variants) {
      const trimmed = analysisTimes.slice(opening ? 1 : 0, opening ? undefined : -1);
      if (trimmed.length < 3) continue;
      if (qualifiesAtTier(trimmed, tier, graceMinutes, maxGraceViolations, gracePercent, violationPercent)) {
        return String(tier);
      }
    }

    // If neither edge is eligible, preserve the baseline calculation exactly.
    if (!openingEligible && !closingEligible && qualifiesAtTier(analysisTimes, tier, graceMinutes, maxGraceViolations, gracePercent, violationPercent)) {
      return String(tier);
    }
  }

  // Keep the unused baseline arguments explicit: the custom determiner has the
  // same signature as production, and the values document what is being replaced.
  void headways;
  void tripCount;
  void spanMinutes;
  return 'span';
};

export function applyEdgeGapCandidateCriteria(rawData: RawRouteDepartures[]): AnalysisResult[] {
  return applyAnalysisCriteria(rawData, DEFAULT_CRITERIA, candidateTier);
}

export { EDGE_ALLOWANCE_MINUTES };
