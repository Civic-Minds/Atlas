export interface IrregularRouteProperties {
  tier?: unknown;
  serviceClass?: unknown;
  routeHasIrregularDirection?: unknown;
  routeHasLimitedDirection?: unknown;
  routeAllDayHeadway?: unknown;
}

/**
 * Limited service (the hide-limited toggle). A route-day the stretch selector stamped (it carries
 * routeAllDayHeadway) is limited only when a direction's main stretch does not run at midday
 * (routeHasLimitedDirection, frequency focus step 6), whatever phase 2 classes its rows: TTC 134
 * runs every 15 at midday though some of its patterns read time-limited. Other route-days keep the
 * row's class.
 */
export function isLimitedService(properties: IrregularRouteProperties): boolean {
  if (properties.routeAllDayHeadway != null) return properties.routeHasLimitedDirection === true;
  return properties.serviceClass === 'time-limited' || properties.routeHasLimitedDirection === true;
}

/** True only for genuinely exceptional/irregular service. Legacy artifacts fall back to span. */
export function isIrregularService(properties: IrregularRouteProperties): boolean {
  return properties.serviceClass === 'irregular'
    || (properties.serviceClass == null && properties.tier === 'span');
}

/** The single predicate used by the map and the hidden-route inventory. */
export function isHiddenByIrregularFilter(properties: IrregularRouteProperties): boolean {
  return isIrregularService(properties) || properties.routeHasIrregularDirection === true;
}
