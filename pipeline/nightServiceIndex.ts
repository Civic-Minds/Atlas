/**
 * nightServiceIndex.ts — derive the cross-agency Night Service directory from
 * each agency's already-processed route features, for export as
 * atlas/night-service.json.
 *
 * Night Service needs to answer "which agencies/routes qualify" across all
 * ~600 agencies at once, unlike Corridors/History which are scoped to one
 * agency the user has already picked. Fetching every agency's full GeoJSON
 * client-side to answer that would be wasteful, so this builds one small
 * aggregate file at refresh time instead — mirrors agencyIndex.ts's
 * "public directory" pattern.
 */

import type { RouteIndexProperties } from '../shared/routeIndexProperties.js';
import { rowPassesNightGrade } from '../shared/nightService.js';
import { STRETCH_NIGHT_END_MIN, STRETCH_NIGHT_START_MIN } from '../shared/rules/periods.js';

type RouteFeatureProperties = RouteIndexProperties;

interface RouteFeature {
  properties: RouteFeatureProperties;
}

export interface NightServiceRouteEntry {
  agencySlug: string;
  agencyName: string;
  region: string | null;
  routeShortName: string | null;
  routeLongName: string | null;
  routeColor: string | null;
  directionId: number | null;
  headsign: string | null;
  day: string | null;
  nightService30: boolean;
  nightService60: boolean;
  /** CIV-1329: the 90 tier, offered on the Night Service page only. */
  nightService90: boolean;
}

export interface NightServiceIndexFile {
  generatedAt: string;
  criteria: string;
  agencyCount: number;
  routeCount: number;
  routes: NightServiceRouteEntry[];
}

/** A GTFS minute-of-day as the criteria text says it: 1560 -> "2am". */
const clockWord = (min: number): string => {
  const h = (min / 60) % 24;
  return `${h % 12 || 12}${h < 12 ? 'am' : 'pm'}`;
};

export const NIGHT_SERVICE_CRITERIA =
  `At least one departure every 30, 60 or 90 minutes, ${clockWord(STRETCH_NIGHT_START_MIN)}-${clockWord(STRETCH_NIGHT_END_MIN)} local time, with no gap at the start or end of the core overnight window.`;

/**
 * Pure: pull the qualifying routes out of one agency's already-processed feature
 * collection. Called once per agency during refresh, before that agency's own
 * GeoJSON is uploaded.
 */
export function extractNightServiceRoutes(
  agencySlug: string,
  agencyName: string,
  region: string | null,
  features: RouteFeature[],
): NightServiceRouteEntry[] {
  return features
    // CIV-1329: the Night Service page lists every grade up to 90 (the Overnight view stops at 60).
    .filter(f => rowPassesNightGrade(f.properties, 90))
    .map(f => ({
      agencySlug,
      agencyName,
      region,
      routeShortName: f.properties.routeShortName ?? null,
      routeLongName: f.properties.routeLongName ?? null,
      routeColor: f.properties.routeColor ?? null,
      directionId: f.properties.directionId ?? null,
      headsign: f.properties.headsign ?? null,
      day: f.properties.day ?? null,
      nightService30: f.properties.nightService30 === true,
      nightService60: f.properties.nightService60 === true || f.properties.nightService === true,
      nightService90: rowPassesNightGrade(f.properties, 90),
    }));
}

/** Pure: aggregate every agency's extracted routes into the published index file. */
export function buildNightServiceIndex(allRoutes: NightServiceRouteEntry[]): NightServiceIndexFile {
  const routes = [...allRoutes].sort((a, b) => {
    const agencyCmp = a.agencySlug.localeCompare(b.agencySlug);
    if (agencyCmp !== 0) return agencyCmp;
    return (a.routeShortName ?? '').localeCompare(b.routeShortName ?? '', undefined, { numeric: true });
  });

  return {
    generatedAt: new Date().toISOString(),
    criteria: NIGHT_SERVICE_CRITERIA,
    agencyCount: new Set(routes.map(r => r.agencySlug)).size,
    routeCount: routes.length,
    routes,
  };
}

/**
 * Merge a refresh run into the existing aggregate. Agencies that were actually
 * processed replace their old entries; agencies skipped by refresh retain the
 * entries from the last complete artifact so the directory cannot lose them.
 */
export function mergeNightServiceIndex(
  existing: NightServiceIndexFile | null,
  refreshedRoutes: NightServiceRouteEntry[],
  refreshedAgencySlugs: ReadonlySet<string>,
): NightServiceIndexFile {
  const preservedRoutes = (existing?.routes ?? []).filter(
    route => !refreshedAgencySlugs.has(route.agencySlug),
  );
  return buildNightServiceIndex([...preservedRoutes, ...refreshedRoutes]);
}
