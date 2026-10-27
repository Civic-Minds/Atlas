import type { Agency } from '../App';
import type { AgencyLayers } from '../hooks/useAgencyData';
import { getTierColor, type ColorVisionMode } from './colors';
import { agencyNameParts, agencyNames, placeAlreadyInName, routeLabels } from './format';
import { buildRouteFacts } from './routeFacts';
import { buildRouteKey, splitRouteKey } from './routeKey';

/**
 * One row of the route chooser (the list shown when a map click hits several routes): the route's label, agency and
 * colour from its loaded feature. With no loaded feature its route ID is the last resort, never the whole key (CIV-984).
 */
export function chooserRouteRow(key: string, layers: AgencyLayers, agencies: Agency[], colorMode: ColorVisionMode) {
  // A key with a branch never equals route facts' key (agency and route only): match it with the feature's own branch (CIV-984).
  const { agencySlug: keySlug, routeId: keyRouteId } = splitRouteKey(key);
  for (const [slug, fc] of Object.entries(layers)) {
    const f = fc.features.find(feat => {
      const p = feat.properties as any;
      return buildRouteFacts(p, slug).key === key || buildRouteKey(slug, String(p.routeId), p.routeBranch) === key;
    });
    if (f) {
      const p = f.properties as any;
      const facts = buildRouteFacts(p, slug);
      const agency = agencies.find(a => a.slug === slug);
      const agencyName = agencyNames(facts.agencyName).short;
      // The place beside the agency's name in the chooser's heading, unless the name already says it (CIV-971).
      const place = agency ? agencyNameParts({ name: agency.name, cities: agency.cities, displayArea: agency.displayArea }).secondary : undefined;
      const agencyPlace = place && !placeAlreadyInName(agencyName, place) ? place : undefined;
      // The chooser's own key (with its branch), so picking a row opens the route it listed.
      return { key, shortName: facts.shortName, label: facts.label, longName: facts.longName ?? '', agencyName, agencyPlace, agencySlug: slug, routeType: facts.routeType, color: getTierColor(p.tier, colorMode) };
    }
  }
  // No loaded feature at all: the route ID is the last resort, never the whole key.
  return { key, shortName: key, label: routeLabels({ shortName: keyRouteId || key, longName: '' }), longName: '', agencyName: '', agencySlug: keySlug || undefined, routeType: undefined as number | undefined, color: 'var(--text-dim)' };
}
