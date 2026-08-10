export interface IrregularRouteProperties {
  tier?: unknown;
  routeHasIrregularDirection?: unknown;
}

/** The single predicate used by the map and the hidden-route inventory. */
export function isHiddenByIrregularFilter(properties: IrregularRouteProperties): boolean {
  return properties.tier === 'span' || properties.routeHasIrregularDirection === true;
}
