import type { PeriodKey } from '../shared/config.js';

/**
 * #1514 (Ryan, 2026-11-15, option 1 after two failed shared-rule attempts): a named route-period whose figure is
 * overstated because a real, slower branch is never read. Its trains each skip a different stop or two, so the
 * branch splits into small patterns that are never regular (MBTA Providence weekday PM read the shared trunk, every
 * 25, while Providence trains run every 66). The setting names only where: the value is computed, never typed in,
 * by the branch pooling the rule would use (directionStretches with poolBranchSkippers), for that direction and day.
 */
export interface BranchReadCorrection {
  /** The route's group key as the stretches name it (routeShortName, or `id:<route_id>` for a route with none). */
  routeShortName: string;
  /** The direction whose branch is overstated; every direction of the route-day when left out. */
  directionId?: number;
  day: 'Weekday' | 'Saturday' | 'Sunday';
  period: PeriodKey;
  /** Why, with the departures that show it (shown in review, not on the map). */
  reason: string;
}

/** The corrections that name this direction key (`route::dir::day`). */
export function correctionsFor(corrections: readonly BranchReadCorrection[] | undefined, key: string): BranchReadCorrection[] {
  if (!corrections?.length) return [];
  const [route, dir, day] = key.split('::');
  return corrections.filter(c => c.routeShortName === route && c.day === day && (c.directionId == null || String(c.directionId) === dir));
}

type Figures = Partial<Record<PeriodKey, number | null>>;
interface Props { routeFilterHeadwayByPeriod?: Figures; directionFilterHeadwayByPeriod?: Figures }

/**
 * Applies the corrections to the route-days' features. `honest(key, period)` is the branch-read filter value for
 * a direction key. The guard (it can never hide or improve service): a figure only ever gets longer, to a computed
 * number; a figure that is none stays none, and a computed value that is none or shorter changes nothing. The
 * route figure takes the corrected direction's value where it is longer (the slower branch decides). Returns what
 * changed, for the run log.
 */
export function applyBranchReadCorrections<F extends { properties: Props }>(
  features: readonly F[],
  corrections: readonly BranchReadCorrection[] | undefined,
  slotOf: (feature: F) => { group: string; dirId: string; day: string } | null,
  honest: (key: string, period: PeriodKey) => number | null | undefined,
): Array<{ key: string; period: PeriodKey; before: number; after: number }> {
  const changed: Array<{ key: string; period: PeriodKey; before: number; after: number }> = [];
  if (!corrections?.length) return changed;
  const longer = (current: number | null | undefined, value: number | null | undefined): value is number =>
    typeof current === 'number' && typeof value === 'number' && Number.isFinite(value) && value > current;
  for (const c of corrections) {
    const rows = features.filter(f => { const s = slotOf(f); return s != null && s.group === c.routeShortName && s.day === c.day; });
    const dirs = [...new Set(rows.map(f => slotOf(f)!.dirId))].filter(d => c.directionId == null || d === String(c.directionId));
    let routeValue: number | null = null;
    for (const dirId of dirs) {
      const key = `${c.routeShortName}::${dirId}::${c.day}`;
      const value = honest(key, c.period);
      for (const f of rows.filter(r => slotOf(r)!.dirId === dirId)) {
        const figures = f.properties.directionFilterHeadwayByPeriod;
        const current = figures?.[c.period];
        if (!figures || !longer(current, value)) continue;
        if (!changed.some(x => x.key === key && x.period === c.period)) changed.push({ key, period: c.period, before: current as number, after: value });
        figures[c.period] = value;
        routeValue = Math.max(routeValue ?? 0, value);
      }
    }
    if (routeValue == null) continue;
    for (const f of rows) {
      const figures = f.properties.routeFilterHeadwayByPeriod;
      if (figures && longer(figures[c.period], routeValue)) figures[c.period] = routeValue;
    }
  }
  return changed;
}
