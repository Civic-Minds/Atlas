export interface IrregularRouteProperties {
  tier?: unknown;
  serviceClass?: unknown;
  routeHasIrregularDirection?: unknown;
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
