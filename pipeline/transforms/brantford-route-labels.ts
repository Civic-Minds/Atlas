import type { GtfsData } from '../../types/gtfs.js';

/**
 * Brantford's manual feed includes a display separator at the start of the
 * route long names. Atlas supplies its own separator between the short and
 * long names, so keep the stored route names free of that leading punctuation.
 */
export function normalizeBrantfordRouteLabels(gtfs: GtfsData): GtfsData {
  return {
    ...gtfs,
    routes: (gtfs.routes ?? []).map(route => {
      const longName = route.route_long_name?.trim();
      if (!longName || !/^[-–—]\s*/.test(longName)) return route;
      return {
        ...route,
        route_long_name: longName.replace(/^[-–—]\s*/, '').trim(),
      };
    }),
  };
}
