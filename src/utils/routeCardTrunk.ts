import type { HeadwayByPeriod } from '../hooks/useAgencyData';
import type { ShapeProperties, TimePeriod } from '../hooks/useIntervalStats';
import { TIME_PERIODS, periodKeyForHour } from '../../shared/config';

type ExtShape = ShapeProperties & { minStopHeadway?: number };

export function dirIdNum(dirId: number | string | undefined | null): number {
  const n = Number(dirId);
  return Number.isFinite(n) ? n : 0;
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
