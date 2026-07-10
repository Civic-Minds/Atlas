import type { HeadwayByPeriod } from '../hooks/useAgencyData';
import type { ShapeProperties, TimePeriod } from '../hooks/useIntervalStats';
import { TIME_PERIODS, periodKeyForHour } from '../../shared/config';

type ExtShape = ShapeProperties & {
  minStopHeadway?: number;
  headsignMinStopHeadwayByPeriod?: Partial<Record<string, number>>;
};

/** Headsign-scoped trunk minimum for route-card range display (not route-wide combined deps). */
export function headsignTrunkHeadway(d: ShapeProperties, period: string): number | null {
  const ext = d as ExtShape;
  if (period === 'all') return ext.minStopHeadway ?? null;
  return ext.headsignMinStopHeadwayByPeriod?.[period] ?? null;
}

/** Show `every X–Y min` only when trunk wait is materially better than destination wait. */
export function shouldShowBranchHeadwayRange(
  trunkHw: number | null | undefined,
  destHw: number | null | undefined,
  multiBranch: boolean,
): boolean {
  if (!multiBranch || trunkHw == null || destHw == null) return false;
  if (trunkHw < 5 || trunkHw >= destHw) return false;
  if (destHw - trunkHw < 5) return false;
  if (destHw / trunkHw > 4) return false;
  return true;
}

export function dirIdNum(dirId: number | string | undefined | null): number {
  const n = Number(dirId);
  return Number.isFinite(n) ? n : 0;
}

function hourlyNonNullCount(d: ShapeProperties): number {
  const hh = (d as { headwayByHour?: Record<number | string, number | null> }).headwayByHour;
  if (!hh) return 0;
  return Object.values(hh).filter((v): v is number => v != null).length;
}

/**
 * Directions to feed the route-card sparkline.
 * Prefer dir 0 when it has hourly data; otherwise any direction with hourly
 * data (Anchorage 31/40/41/51 only encode dir 1). Never hard-require dir 0.
 */
export function sparklineSourceDirections(
  directions: ShapeProperties[],
  primaryMultiBranch?: ShapeProperties[] | null,
): ShapeProperties[] {
  if (primaryMultiBranch && primaryMultiBranch.some(d => hourlyNonNullCount(d) > 0)) {
    return primaryMultiBranch;
  }
  const withHours = directions.filter(d => hourlyNonNullCount(d) > 0);
  if (withHours.length === 0) return directions;
  const dir0 = withHours.filter(d => dirIdNum(d.directionId) === 0);
  if (dir0.length > 0) return dir0;
  // Pick the direction with the richest hourly series
  const bestDir = withHours.reduce((best, d) => {
    const id = dirIdNum(d.directionId);
    return hourlyNonNullCount(d) > hourlyNonNullCount(best) ? d : best;
  });
  const id = dirIdNum(bestDir.directionId);
  return withHours.filter(d => dirIdNum(d.directionId) === id);
}

/** Combined trunk headway from minStopHeadwayByPeriod (union of deps at shared stops). */
export function groupTrunkHeadway(branches: ShapeProperties[], period: string): number | null {
  const vals = branches
    .map(d => {
      const ext = d as ExtShape;
      if (period === 'all') return ext.minStopHeadway ?? null;
      return ext.minStopHeadwayByPeriod?.[period] ?? ext.minStopHeadway ?? null;
    })
    .filter((v): v is number => v != null);
  return vals.length ? Math.min(...vals) : null;
}

function periodHeadwayFromByHour(
  byHour: Record<number, number | null> | undefined,
  periodKey: string,
): number | null {
  if (!byHour) return null;
  const p = TIME_PERIODS.find(t => t.key === periodKey);
  if (!p) return null;
  let best: number | null = null;
  for (let h = p.startHour; h < p.endHour; h++) {
    const v = byHour[h];
    if (v != null && (best === null || v < best)) best = v;
  }
  return best;
}

function medianHeadway(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

export function medianTerminalHeadway(branches: ShapeProperties[], period: TimePeriod): number | null {
  const vals = branches
    .map(d => {
      if (period !== 'all') {
        const byPeriod = d.headwayByPeriod as HeadwayByPeriod | undefined;
        const byHour = (d as { headwayByHour?: Record<number, number | null> }).headwayByHour;
        return byPeriod?.[period as keyof HeadwayByPeriod]
          ?? periodHeadwayFromByHour(byHour, period)
          ?? null;
      }
      return d.headway;
    })
    .filter((v): v is number => v != null);
  return vals.length ? medianHeadway(vals) : null;
}

/** True when combined trunk is materially better than typical destination wait. */
export function shouldShowTrunkSummary(branches: ShapeProperties[], period: TimePeriod): boolean {
  if (branches.length < 2) return false;
  const periodKey = period !== 'all' ? period : 'midday';
  const trunk = groupTrunkHeadway(branches, periodKey);
  const terminal = medianTerminalHeadway(branches, period);
  if (trunk == null || terminal == null) return false;
  return trunk <= terminal * 0.65 && terminal / trunk <= 4;
}

/** Trunk hourly curve from combined stop headways (flat within each period). */
export function trunkSparklineByHour(
  branches: ShapeProperties[],
  hours: readonly number[],
): Record<number, number | null> {
  const out: Record<number, number | null> = {};
  for (const h of hours) {
    const pk = periodKeyForHour(h);
    out[h] = pk ? groupTrunkHeadway(branches, pk) : null;
  }
  return out;
}
