import type { Agency } from '../App';
import type { AgencyLayers } from '../hooks/useAgencyData';
import type { TimePeriod } from '../hooks/useIntervalStats';
import { routeFilterHeadway, routePassesHeadwayFilter } from '../../shared/routeHeadwayFilter';
import { headwayToTierColor, type ColorVisionMode } from './colors';
import { routeLabels } from './format';
import { agencyNames, placeAlreadyInName } from './agencyName';
import { buildRouteFacts } from './routeFacts';
import { buildRouteKey, splitRouteKey } from './routeKey';

/**
 * One row of the route chooser (the list shown when a map click hits several routes): the route's label, agency and
 * colour from its loaded feature. With no loaded feature its route ID is the last resort, never the whole key (CIV-984).
 * The dot is the map line's colour for the day and period on screen (#1246): the same routeFilterHeadway the line and the
 * route card's dot read, never the stored tier (a stricter whole-day grade that disagrees with the line on most routes).
 */
export function chooserRouteRow(key: string, layers: AgencyLayers, agencies: Agency[], colorMode: ColorVisionMode, day?: string, period: TimePeriod = 'all') {
  // A key with a branch never equals route facts' key (agency and route only): match it with the feature's own branch (CIV-984).
  const { agencySlug: keySlug, routeId: keyRouteId } = splitRouteKey(key);
  for (const [slug, fc] of Object.entries(layers)) {
    const matches = fc.features.filter(feat => {
      const p = feat.properties as any;
      return buildRouteFacts(p, slug).key === key || buildRouteKey(slug, String(p.routeId), p.routeBranch) === key;
    });
    const f = matches[0];
    if (f) {
      const p = f.properties as any;
      const facts = buildRouteFacts(p, slug);
      const agency = agencies.find(a => a.slug === slug);
      const agencyName = agencyNames(facts.agencyName).name;
      // The place beside the agency's name in the chooser's heading, unless the name already says it (CIV-971).
      const place = agency ? agencyNames({ name: agency.name, cities: agency.cities, displayArea: agency.displayArea }).list.secondary : undefined;
      const agencyPlace = place && !placeAlreadyInName(agencyName, place) ? place : undefined;
      // The chooser's own key (with its branch), so picking a row opens the route it listed.
      // The route's features on the day shown; a route passes on any of them, so its best value is the colour drawn.
      // No dot where the map draws nothing: no feature on the day, or no service in the period (the card shows no badge
      // there either). A route that runs with no value is drawn grey, as the card's "limited" dot is.
      const onDay = matches.filter(feat => day == null || (feat.properties as any).day == null || (feat.properties as any).day === day);
      const onDayProps = onDay.map(feat => feat.properties as object);
      const runs = onDayProps.length > 0 && routePassesHeadwayFilter(onDayProps, period, undefined, Infinity);
      const values = onDayProps.map(props => routeFilterHeadway(props, period)).filter((value): value is number => value != null);
      const color = runs ? headwayToTierColor(values.length > 0 ? Math.min(...values) : null, colorMode) : undefined;
      return { key, shortName: facts.shortName, label: facts.label, longName: facts.longName ?? '', agencyName, agencyPlace, agencySlug: slug, routeType: facts.routeType, color };
    }
  }
  // No loaded feature at all: the route ID is the last resort, never the whole key.
  return { key, shortName: key, label: routeLabels({ shortName: keyRouteId || key, longName: '' }), longName: '', agencyName: '', agencySlug: keySlug || undefined, routeType: undefined as number | undefined, color: undefined as string | undefined };
}
