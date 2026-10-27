import type { OnDemandServiceDetails } from '../../shared/onDemandAvailability';
import { cleanRouteShortName, routeLabels, agencyNames, agencyNameParts } from './format';
import { onDemandCardName, onDemandSelectionZoneId, resolveSelectedOnDemandSlug } from './onDemandSelection';
import { splitRouteKey } from './routeKey';

// The stop card's back link goes to the previous screen and names it: "← TTC", "← Route 504",
// "← Map" (CIV-832). The map snapshots what was open on every pointerdown; when a stop opens,
// that snapshot says what "back" returns to.

/** What was open on the map at the moment of a pointerdown. */
export interface StopBackSnapshot {
  route: string | null;
  agencySlug: string | null;
  /** The on-demand selection: "slug" or "slug::zoneId". */
  onDemand: string | null;
  /** Search was open: a stop picked from search results goes back to the map. */
  searchFocused: boolean;
}

export type StopBackTarget =
  | { kind: 'map' }
  | { kind: 'route'; route: string }
  | { kind: 'agency'; agencySlug: string }
  | { kind: 'onDemand'; selection: string };

export interface StopBackAgency {
  slug: string;
  name: string;
  cities?: string[];
  displayArea?: string;
  onDemandOnly?: boolean;
  onDemandServiceArea?: OnDemandServiceDetails;
}

/** The fields the route card's title is built from. */
export interface StopBackRoute {
  routeShortName?: string | null;
  routeLongName?: string | null;
  routeType?: number;
}

export interface StopBack {
  to: string;
  target: StopBackTarget;
}

const MAP: StopBack = { to: 'Map', target: { kind: 'map' } };

/** Which card was open when the stop was clicked. No snapshot (keyboard, a shared link) means the map. */
export function stopBackTarget(snapshot: StopBackSnapshot | null): StopBackTarget {
  if (!snapshot || snapshot.searchFocused) return { kind: 'map' };
  if (snapshot.route) return { kind: 'route', route: snapshot.route };
  if (snapshot.onDemand) return { kind: 'onDemand', selection: snapshot.onDemand };
  if (snapshot.agencySlug) return { kind: 'agency', agencySlug: snapshot.agencySlug };
  return { kind: 'map' };
}

/** "Route 504" for a route with a short name; otherwise the route card's own title. */
export function stopBackRouteName(route: StopBackRoute, agencySlug: string, agencyName: string): string {
  const shortName = cleanRouteShortName(route.routeShortName?.trim());
  if (shortName) return `Route ${shortName}`;
  return routeLabels({
    shortName: route.routeShortName,
    longName: route.routeLongName,
    routeType: route.routeType,
    agencySlug,
    agencyName,
  }).text;
}

/**
 * The back link's words and where it goes. Each name matches the card it reopens: the short agency
 * name the route card's "← TTC" link uses, the on-demand card's heading, or "Route 504".
 * Anything that can no longer be found (agency unloaded, route gone) falls back to the map.
 */
export function resolveStopBack(
  target: StopBackTarget | null,
  agencies: ReadonlyArray<StopBackAgency>,
  findRoute: (routeKey: string) => StopBackRoute | null,
): StopBack {
  if (!target || target.kind === 'map') return MAP;

  if (target.kind === 'route') {
    const { agencySlug } = splitRouteKey(target.route);
    const route = findRoute(target.route);
    if (!route) return MAP;
    const agency = agencies.find(a => a.slug === agencySlug);
    const agencyName = agencyNames(agency?.name ?? agencySlug).short;
    const to = stopBackRouteName(route, agencySlug, agencyName);
    return to ? { to, target } : MAP;
  }

  if (target.kind === 'onDemand') {
    const slug = target.selection.split('::', 1)[0];
    const agency = agencies.find(a => a.slug === slug);
    if (!agency) return MAP;
    const to = agency.onDemandServiceArea
      ? onDemandCardName(agency.onDemandServiceArea, onDemandSelectionZoneId(target.selection), agencyNameParts({ name: agency.name, cities: agency.cities, displayArea: agency.displayArea }).primary)
      : agencyNames(agency.name).backLink;
    return to ? { to, target } : MAP;
  }

  const agency = agencies.find(a => a.slug === target.agencySlug);
  if (!agency) return MAP;
  // An on-demand-only agency opens the on-demand card, so the link uses that card's heading.
  const opensOnDemandCard = resolveSelectedOnDemandSlug(null, agency.slug, agencies) === agency.slug && agency.onDemandServiceArea;
  const to = opensOnDemandCard
    ? onDemandCardName(agency.onDemandServiceArea!, null, agencyNameParts({ name: agency.name, cities: agency.cities, displayArea: agency.displayArea }).primary)
    : agencyNames(agency.name).backLink;
  return to ? { to, target } : MAP;
}

/**
 * The back target in the link (CIV-919), so a reload keeps "← Route 504": `from=route:<route key>`,
 * `from=agency:<slug>` or `from=ondemand:<selection>`. The map needs no param.
 */
export const STOP_BACK_PARAM = 'from';

export function encodeStopBackTarget(target: StopBackTarget | null): string | null {
  if (!target) return null;
  switch (target.kind) {
    case 'route': return `route:${target.route}`;
    case 'agency': return `agency:${target.agencySlug}`;
    case 'onDemand': return `ondemand:${target.selection}`;
    default: return null;
  }
}

export function parseStopBackTarget(raw: string | null | undefined): StopBackTarget | null {
  if (!raw) return null;
  const sep = raw.indexOf(':');
  if (sep < 0) return null;
  const kind = raw.slice(0, sep);
  const value = raw.slice(sep + 1).trim();
  if (!value) return null;
  if (kind === 'route') return value.includes('::') ? { kind: 'route', route: value } : null;
  if (kind === 'agency') return /^[a-z0-9-]+$/.test(value) ? { kind: 'agency', agencySlug: value } : null;
  if (kind === 'ondemand') return /^[a-z0-9-]+(::.+)?$/.test(value) ? { kind: 'onDemand', selection: value } : null;
  return null;
}
