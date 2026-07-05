import { useMemo } from 'react';
import { routeKey } from './useIntervalStats';
import type { ShapeProperties } from './useIntervalStats';

const NEARBY_RADIUS_M = 500;
const EARTH_R = 6371000;

function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return EARTH_R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export interface NearbyRoute {
  rKey: string;
  routeShortName: string;
  routeLongName: string | null;
  agencyName: string;
  agencySlug: string;
  headway: number | null;
  tier: string | null;
  nearestStopName: string;
  distanceMeters: number;
}

export function useNearbyRoutes(
  userLocation: { lat: number; lon: number } | null,
  layers: Record<string, GeoJSON.FeatureCollection>,
  currentDay: 'Weekday' | 'Saturday' | 'Sunday',
): NearbyRoute[] {
  return useMemo(() => {
    if (!userLocation) return [];
    const { lat, lon } = userLocation;

    // Collect stops within radius across all agencies
    type NearbyStop = {
      slug: string;
      stopName: string;
      routeIds: string[];
      distanceMeters: number;
    };
    const nearbyStops: NearbyStop[] = [];

    for (const [slug, fc] of Object.entries(layers)) {
      if (slug.endsWith('-corridors')) continue;
      for (const f of fc.features) {
        if (f.geometry.type !== 'Point') continue;
        const [flon, flat] = (f.geometry as GeoJSON.Point).coordinates;
        const d = haversineMeters(lat, lon, flat, flon);
        if (d > NEARBY_RADIUS_M) continue;
        const p = f.properties as unknown as ShapeProperties;
        if (!p.stopId || !(p as any).routeIds?.length) continue;
        nearbyStops.push({
          slug,
          stopName: p.stopName ?? '',
          routeIds: (p as any).routeIds as string[],
          distanceMeters: d,
        });
      }
    }

    if (nearbyStops.length === 0) return [];

    nearbyStops.sort((a, b) => a.distanceMeters - b.distanceMeters);

    // Build route map keyed by agencySlug::routeShortName
    const routeMap = new Map<string, NearbyRoute>();

    for (const stop of nearbyStops) {
      const routeIds = new Set(stop.routeIds);
      const { slug } = stop;

      for (const f of layers[slug]?.features ?? []) {
        if (f.geometry.type === 'Point') continue;
        const p = f.properties as unknown as ShapeProperties;
        if (!p.routeId || !routeIds.has(p.routeId)) continue;
        if (p.day !== undefined && p.day !== currentDay) continue;

        const shortName = p.routeShortName || p.routeId;
        const mapKey = `${slug}::${shortName}`;
        const rk = routeKey({ ...p, agencySlug: slug } as any);

        if (!routeMap.has(mapKey)) {
          routeMap.set(mapKey, {
            rKey: rk,
            routeShortName: shortName,
            routeLongName: (p.routeLongName as string | null) ?? null,
            agencyName: p.agencyName || slug,
            agencySlug: slug,
            headway: p.headway ?? null,
            tier: (p.tier as string | null) ?? null,
            nearestStopName: stop.stopName,
            distanceMeters: stop.distanceMeters,
          });
        } else {
          const existing = routeMap.get(mapKey)!;
          if (p.headway != null && (existing.headway === null || p.headway < existing.headway)) {
            existing.headway = p.headway;
            existing.tier = (p.tier as string | null) ?? null;
          }
          if (stop.distanceMeters < existing.distanceMeters) {
            existing.distanceMeters = stop.distanceMeters;
            existing.nearestStopName = stop.stopName;
          }
        }
      }
    }

    return Array.from(routeMap.values()).sort((a, b) => {
      if (a.headway !== null && b.headway !== null) return a.headway - b.headway;
      if (a.headway !== null) return -1;
      if (b.headway !== null) return 1;
      return a.routeShortName.localeCompare(b.routeShortName, undefined, { numeric: true });
    });
  }, [userLocation, layers, currentDay]);
}
