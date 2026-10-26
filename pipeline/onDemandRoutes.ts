/**
 * #1119: routes an agency's config lists as running on demand (`onDemandRoutes`, by route short name). Their feed
 * timetable is a placeholder (WVU PRT: every 30 minutes on paper, on demand in practice), so nothing measured from it is
 * published: every timetable value is removed from the route's features, its running times are dropped, and the feature
 * is irregular, limited service (the class whose filter text already reads "School runs, a few trips a day, on-demand"),
 * flagged onDemand. Surfaces then read it with their usual handling of a route with no values, and the frequency filter
 * never passes it.
 */

/** Feature properties measured from the timetable (and the beta section fields built from them). */
const TIMETABLE_FIELD = /headway|Headway|Gap|Coverage|Sustained|Tiers|nightService|Night\d|NightPartial|FrequentService|frequentService|MiddayWait|AllDay|MiddayCap|RunsByPeriod|PeriodOneGap|PeriodRange|PeriodEdge|PeriodGap|RouteLimited|StopPeriodValues|fullLine|fullStop/;

type Props = Record<string, unknown>;

export function isTimetableField(key: string): boolean {
  return TIMETABLE_FIELD.test(key);
}

/**
 * Applies the on-demand treatment in place. Returns how many features changed. Only features whose routeShortName is
 * listed are touched; with no list, nothing is.
 */
export function applyOnDemandRoutes(
  features: ReadonlyArray<{ properties?: Props | null }>,
  runningTimes: Record<string, unknown>,
  onDemandRoutes: readonly string[] | undefined,
): number {
  if (!onDemandRoutes?.length) return 0;
  const listed = new Set(onDemandRoutes);
  const routeIds = new Set<string>();
  let changed = 0;
  for (const f of features) {
    const p = f.properties;
    if (!p || p.stopId != null || !listed.has(String(p.routeShortName ?? ''))) continue;
    for (const key of Object.keys(p)) if (isTimetableField(key)) delete p[key];
    // The stretch rows' period values (beta section colours) come from the same timetable.
    const meta = p.stretchMeta as { main?: Props | null; tails?: Props[] } | undefined;
    for (const entry of meta ? [meta.main, ...(meta.tails ?? [])] : []) {
      if (entry) { delete entry.period; delete entry.noRegular; delete entry.notCounted; delete entry.trips; }
    }
    p.headway = null;
    p.tier = 'span';
    p.serviceClass = 'irregular';
    p.onDemand = true;
    if (p.routeId != null) routeIds.add(String(p.routeId));
    changed++;
  }
  // Running times are keyed route::direction::day; the route's are measured from the same placeholder trips.
  for (const key of Object.keys(runningTimes)) {
    if (routeIds.has(key.split('::')[0])) delete runningTimes[key];
  }
  return changed;
}
