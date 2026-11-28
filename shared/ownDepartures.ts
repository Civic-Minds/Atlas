/**
 * A row's own departures in a period (CIV-1074), shared by the pipeline's noOwnServiceByPeriod and the stop card (#1904).
 * Fewer than MIN_OWN_DEPARTURES of its own in a period means the row does not run there itself.
 */
import { MINUTES_PER_DAY, PERIOD_MINUTES, type PeriodKey } from './config.js';

export const MIN_OWN_DEPARTURES = 3;

/** A row's own departures in a period, from its departures per hour; hours past midnight count in late and overnight. */
export function ownDeparturesInPeriod(departuresByHour: Record<string, number>, period: PeriodKey): number {
  const { start, end } = PERIOD_MINUTES[period];
  let n = 0;
  for (const [hour, count] of Object.entries(departuresByHour)) {
    const h = Number(hour) * 60;
    if ((h >= start && h < end) || (h + MINUTES_PER_DAY >= start && h + MINUTES_PER_DAY < end)) n += count;
  }
  return n;
}

/**
 * #1904: a main or tail row (one that reads its stretch, so the pipeline never marks it noOwnServiceByPeriod) whose own
 * trips don't run in the period. A period whose edge is read on a stretch the row covers counts as run (CIV-1248).
 */
export function stretchRowWithoutOwnTrips(p: {
  stretchRole?: string;
  departuresByHour?: Record<string, number>;
  stretchPeriodEdge?: Partial<Record<PeriodKey, { stretch?: 'main' | number }>>;
  stretchCovers?: ('main' | number)[];
}, period: PeriodKey): boolean {
  if ((p.stretchRole !== 'main' && p.stretchRole !== 'tail') || !p.departuresByHour) return false;
  const edgeStretch = p.stretchPeriodEdge?.[period]?.stretch;
  if (edgeStretch != null && p.stretchCovers?.includes(edgeStretch)) return false;
  return ownDeparturesInPeriod(p.departuresByHour, period) < MIN_OWN_DEPARTURES;
}
