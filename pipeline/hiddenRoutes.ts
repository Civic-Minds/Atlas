import type { GeoJsonFeature } from './geojson-types.js';
import { isHiddenByIrregularFilter } from '../shared/irregularRoutes.js';

export interface HiddenRouteRecord {
  key: string;
  agencySlug: string;
  agencyName: string;
  region: string | null;
  routeShortName: string;
  routeLongName: string | null;
}

export interface HiddenRoutesFile {
  generatedAt: string;
  routeCount: number;
  routes: HiddenRouteRecord[];
}

interface AgencySummary { slug: string; name: string; region?: string | null }

export function buildHiddenRoutesForAgency(
  agency: AgencySummary,
  geojson: string | { features?: GeoJsonFeature[] },
): HiddenRouteRecord[] {
  const featureCollection = typeof geojson === 'string' ? JSON.parse(geojson) : geojson;
  const byRoute = new Map<string, {
    routeShortName: string;
    routeLongName: string | null;
    hasVisibleFeature: boolean;
  }>();
  for (const feature of featureCollection.features ?? []) {
    const p = feature.properties ?? {};
    const shortName = typeof p.routeShortName === 'string' ? p.routeShortName.trim() : '';
    if (!shortName || p.isCorridor) continue;
    const longName = typeof p.routeLongName === 'string' ? p.routeLongName.trim() || null : null;
    const key = `${agency.slug}::${shortName}::${longName ?? ''}`;
    const current = byRoute.get(key) ?? {
      routeShortName: shortName,
      routeLongName: longName,
      hasVisibleFeature: false,
    };
    if (!isHiddenByIrregularFilter(p)) current.hasVisibleFeature = true;
    byRoute.set(key, current);
  }
  return [...byRoute.entries()]
    .map(([key, route]) => {
      if (route.hasVisibleFeature) return null;
      return {
        key,
        agencySlug: agency.slug,
        agencyName: agency.name,
        region: agency.region ?? null,
        routeShortName: route.routeShortName,
        routeLongName: route.routeLongName,
      };
    })
    .filter((route): route is HiddenRouteRecord => route !== null);
}

export function mergeHiddenRoutes(
  existing: HiddenRoutesFile | null,
  updates: Array<{ agencySlug: string; routes: HiddenRouteRecord[] }>,
  liveAgencySlugs?: Set<string>,
): HiddenRoutesFile {
  const byKey = new Map<string, HiddenRouteRecord>();
  for (const route of existing?.routes ?? []) {
    if (!liveAgencySlugs || liveAgencySlugs.has(route.agencySlug)) byKey.set(route.key, route);
  }
  for (const update of updates) {
    for (const key of [...byKey.keys()]) if (key.startsWith(`${update.agencySlug}::`)) byKey.delete(key);
    for (const route of update.routes) byKey.set(route.key, route);
  }
  const routes = [...byKey.values()].sort((a, b) =>
    (a.region ?? 'Other').localeCompare(b.region ?? 'Other') || a.agencyName.localeCompare(b.agencyName)
    || a.routeShortName.localeCompare(b.routeShortName, undefined, { numeric: true }) || a.key.localeCompare(b.key));
  return { generatedAt: new Date().toISOString(), routeCount: routes.length, routes };
}
