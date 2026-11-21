/**
 * CIV-1959 B3 (#1620, #1086): the cards' branch readings, from the `pieceReadings` field (ATLAS_BRANCH_READINGS=1) behind
 * BRANCH_READINGS_ENABLED. Pure functions; the route card (routeCardRows) and the stop card (stopRoutes) call them.
 * The wording is the existing words: noNumberRowLabel (src/content/noticeCopy.ts, CIV-1251) for a branch with no number, and
 * shared/headwayText.ts (the every-N-until words through periodEdgeText, CIV-1241); nothing here types a string.
 */
import type { ShapeProperties, TimePeriod } from '../hooks/useIntervalStats';
import type { PeriodKey } from '../../shared/config';
import { pieceAtStop, type PieceReadings, type PieceTreatment } from '../../shared/pieceReadings';
import { periodEdgeText } from './effectiveHeadway';
import type { RouteCardRowValue } from './routeCardRowValue';
import { noNumberRowLabel } from '../content/noticeCopy';

/** A direction's trunk and branch treatments in one period, or null when the card keeps today's rows (no data, no trunk reading, or no branch to show). */
export interface DirectionPieceTreatments {
  trunk: Extract<PieceTreatment, { t: 'reading' | 'tail' }>;
  branches: ReadonlyMap<number, PieceTreatment>;
  /** CIV-1959 #1636: the name of each branch no feature of its own stands for, by branch index: where it goes (`to`, the pipeline's terminus) or, for an origin leg, where it starts (`from`). */
  names: ReadonlyMap<number, { to?: string; from?: string }>;
}

const readingsOf = (features: readonly ShapeProperties[] | undefined): PieceReadings | undefined =>
  features?.find(f => f.pieceReadings != null)?.pieceReadings;

export function directionPieceTreatments(features: readonly ShapeProperties[] | undefined, period: TimePeriod): DirectionPieceTreatments | null {
  if (period === 'all' || period === 'overnight') return null;
  const readings = readingsOf(features);
  if (!readings) return null;
  const key = period as PeriodKey;
  const trunk = readings.pieces.find(p => p.kind === 'trunk')?.periods[key];
  if (!trunk || trunk.t === 'limited') return null;
  const branches = new Map<number, PieceTreatment>();
  const names = new Map<number, { to?: string; from?: string }>();
  for (const p of readings.pieces) {
    const t = p.kind === 'branch' ? p.periods[key] : undefined;
    if (t) branches.set(p.index, t);
    if (t && (p.to || p.from)) names.set(p.index, { ...(p.to ? { to: p.to } : {}), ...(p.from ? { from: p.from } : {}) });
  }
  return branches.size > 0 ? { trunk, branches, names } : null;
}

/** The words after "every N" for a tail: "every 30 min until 12:16 PM" (headwayPeriodShape, as every other part-period row). */
export function tailText(t: Extract<PieceTreatment, { t: 'tail' }>): string {
  return periodEdgeText({ every: t.every, ...(t.from != null ? { from: t.from } : {}), ...(t.until != null ? { until: t.until } : {}) });
}

/**
 * A branch row's value from its piece treatment, over the value the card would have read: a reading shows its own number (no
 * trunk-to-branch range, the trunk has its own line); a tail shows its spacing with when it stops or starts and takes its
 * full-window wait for colour; a piece with too few or uneven trips (rule D) reads as any row with no number does (noNumberRowLabel).
 */
export function branchRowValue(base: RouteCardRowValue, t: PieceTreatment, noNumberLabel: string): { value: RouteCardRowValue; limitedLabel?: string } {
  const own = { ...base, trunkHeadway: undefined, edgeText: undefined, rowNoRegular: false, dimmed: base.dimmed };
  if (t.t === 'limited') {
    return { value: { ...own, isLimited: true, headway: undefined, displayH: undefined, headwayLabel: undefined, shownHeadway: undefined, colorHeadway: null }, limitedLabel: noNumberLabel };
  }
  if (t.t === 'tail') {
    return { value: { ...own, isLimited: false, headway: t.v, displayH: t.v, headwayLabel: tailText(t), shownHeadway: t.every, colorHeadway: t.v } };
  }
  return { value: { ...own, isLimited: false, headway: t.v, displayH: t.v, headwayLabel: undefined, shownHeadway: t.v, colorHeadway: t.v } };
}

/**
 * The stop card's words for a stop on a branch: the no-number words, a tail's spacing with when it stops, or the branch's
 * own reading as its row's number. Null for a stop on the trunk or on no piece, so those keep today's card.
 */
export function stopBranchReading(
  directionFeatures: readonly ShapeProperties[] | undefined,
  stopId: string,
  period: TimePeriod,
): { periodText?: string; rowHeadway?: number } | null {
  if (period === 'all' || period === 'overnight' || !directionFeatures) return null;
  const piece = pieceAtStop(directionFeatures.map(f => f.pieceReadings), stopId);
  if (!piece || piece.kind !== 'branch') return null;
  const t = piece.periods[period as PeriodKey];
  if (!t) return null;
  if (t.t === 'limited') return { periodText: noNumberRowLabel({}) };
  if (t.t === 'tail') return { periodText: tailText(t) };
  return { rowHeadway: t.v };
}
