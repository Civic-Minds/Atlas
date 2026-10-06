export type EdgeMode = 'none' | 'opening' | 'closing' | 'both';
export type EdgeLimit = 'grace' | 'double';
export type InternalPolicy = {
  name: string;
  percent: number;
  percentByTier?: Record<number, number>;
  minimum: number;
  maximum?: number;
};
export type HardGapPolicy = 'current' | 'one-and-a-quarter' | 'one-and-a-half' | 'one-and-three-quarters' | 'double';

export interface CandidateRuleOptions {
  edgeMode: EdgeMode;
  edgeLimit: EdgeLimit;
  internal: InternalPolicy;
  hardGap: HardGapPolicy;
  minimumEvidence?: number;
  graceMinutes?: number;
  gracePercent?: number;
}

export interface CandidateResult {
  tier: string;
  edgeWarnings: string[];
}

const graceFor = (tier: number, options: CandidateRuleOptions): number =>
  Math.max(options.graceMinutes ?? 5, Math.round(tier * (options.gracePercent ?? 0.15)));

const hardLimitFor = (tier: number, grace: number, policy: HardGapPolicy): number => {
  if (policy === 'one-and-a-quarter') return Math.round(tier * 1.25);
  if (policy === 'one-and-a-half') return Math.round(tier * 1.5);
  if (policy === 'one-and-three-quarters') return Math.round(tier * 1.75);
  if (policy === 'double') return tier * 2;
  return tier + grace;
};

const edgeAllowed = (gap: number, tier: number, grace: number, limit: EdgeLimit): boolean => {
  if (gap <= tier) return false;
  const maximum = limit === 'double' ? tier * 2 : tier + grace;
  return gap <= maximum;
};

const edgeSelected = (mode: EdgeMode, edge: 'opening' | 'closing'): boolean =>
  mode === 'both' || mode === edge;

export function determineCandidateTier(
  departureTimes: number[],
  tiers: number[],
  options: CandidateRuleOptions,
): CandidateResult {
  const sorted = [...departureTimes].sort((a, b) => a - b);
  const edgeWarnings: string[] = [];

  for (const tier of tiers) {
    if (sorted.length < 2) continue;
    const initialGaps = sorted.slice(1).map((time, index) => time - sorted[index]);
    const grace = graceFor(tier, options);
    const requestedOpening = edgeSelected(options.edgeMode, 'opening') && edgeAllowed(initialGaps[0], tier, grace, options.edgeLimit);
    const requestedClosing = edgeSelected(options.edgeMode, 'closing') && edgeAllowed(initialGaps[initialGaps.length - 1], tier, grace, options.edgeLimit);
    // An edge exception must still leave a sustained schedule to evaluate. This prevents a
    // two-trip period from becoming a "qualified" tier merely because its only gap was trimmed.
    const requestedTrims = Number(requestedOpening) + Number(requestedClosing);
    const canTrimEdges = sorted.length - requestedTrims >= 4;
    const trimOpening = canTrimEdges && requestedOpening;
    const trimClosing = canTrimEdges && requestedClosing;
    const start = trimOpening ? 1 : 0;
    const end = sorted.length - (trimClosing ? 1 : 0);
    const times = sorted.slice(start, end);
    if (times.length < (options.minimumEvidence ?? 2)) continue;

    const gaps = times.slice(1).map((time, index) => time - times[index]);
    const minimumTrips = Math.ceil((times[times.length - 1] - times[0]) / tier);
    if (times.length < minimumTrips) continue;

    const hardLimit = hardLimitFor(tier, grace, options.hardGap);
    const proportionalPercent = options.internal.percentByTier?.[tier] ?? options.internal.percent;
    const proportionalAllowance = Math.floor(gaps.length * proportionalPercent);
    const allowedExceptions = Math.min(
      options.internal.maximum ?? Number.POSITIVE_INFINITY,
      Math.max(options.internal.minimum, proportionalAllowance),
    );
    let exceptionCount = 0;
    let failed = false;
    for (const gap of gaps) {
      if (gap <= tier) continue;
      if (gap > hardLimit) {
        failed = true;
        break;
      }
      exceptionCount++;
      if (exceptionCount > allowedExceptions) {
        failed = true;
        break;
      }
    }
    if (!failed) {
      if (trimOpening) edgeWarnings.push('opening');
      if (trimClosing) edgeWarnings.push('closing');
      return { tier: String(tier), edgeWarnings };
    }
  }

  return { tier: 'span', edgeWarnings: [] };
}

export const CURRENT_INTERNAL_POLICY: InternalPolicy = { name: 'current-30-percent', percent: 0.30, minimum: 2 };

export const INTERNAL_CANDIDATES: InternalPolicy[] = [
  { name: 'fixed-0', percent: 0, minimum: 0, maximum: 0 },
  { name: 'fixed-1', percent: 0, minimum: 1, maximum: 1 },
  { name: 'fixed-2', percent: 0, minimum: 2, maximum: 2 },
  { name: 'fixed-3', percent: 0, minimum: 3, maximum: 3 },
  { name: 'percent-0-cap-2', percent: 0, minimum: 2, maximum: 2 },
  { name: 'percent-5-cap-3', percent: 0.05, minimum: 2, maximum: 3 },
  { name: 'percent-10-cap-3', percent: 0.10, minimum: 2, maximum: 3 },
  { name: 'percent-15-cap-3', percent: 0.15, minimum: 2, maximum: 3 },
  { name: 'percent-30-cap-3', percent: 0.30, minimum: 2, maximum: 3 },
  { name: 'percent-30-cap-5', percent: 0.30, minimum: 2, maximum: 5 },
];
