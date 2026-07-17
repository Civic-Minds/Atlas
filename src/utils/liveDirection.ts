import type { LiveVehicle } from '../context/LiveVehiclesMapOverlay';

const EARTH_RADIUS_M = 6_371_000;
const MAX_MATCH_DISTANCE_M = 1_200;
const BEARING_WEIGHT_M = 250;

export interface LiveDirectionMatch {
  directionId: number | null;
  headsign: string | null;
}

interface Candidate {
  directionId: number | null;
  headsign: string | null;
  score: number;
}

function distanceToSegmentM(
  lat: number,
  lon: number,
  a: [number, number],
  b: [number, number],
): { distanceM: number; bearing: number } {
  const refLat = ((a[1] + b[1]) / 2) * Math.PI / 180;
  const cosLat = Math.cos(refLat);
  const scale = Math.PI / 180 * EARTH_RADIUS_M;
  const bx = (b[0] - a[0]) * scale * cosLat;
  const by = (b[1] - a[1]) * scale;
  const px = (lon - a[0]) * scale * cosLat;
  const py = (lat - a[1]) * scale;
  const lengthSq = bx * bx + by * by;
  const t = lengthSq > 0 ? Math.max(0, Math.min(1, (px * bx + py * by) / lengthSq)) : 0;
  const distanceM = Math.hypot(px - t * bx, py - t * by);
  const bearing = (Math.atan2(bx, by) * 180 / Math.PI + 360) % 360;
  return { distanceM, bearing };
}

function bearingDifference(a: number, b: number): number {
  const difference = Math.abs(a - b) % 360;
  return Math.min(difference, 360 - difference);
}

function candidateForFeature(
  vehicle: LiveVehicle,
  feature: GeoJSON.Feature,
): Candidate | null {
  const geometry = feature.geometry;
  if (!geometry || (geometry.type !== 'LineString' && geometry.type !== 'MultiLineString')) return null;
  const parts = geometry.type === 'LineString'
    ? [geometry.coordinates as [number, number][]]
    : geometry.coordinates as [number, number][][];
  let best = { distanceM: Infinity, bearing: 0 };
  for (const coordinates of parts) {
    for (let i = 0; i < coordinates.length - 1; i++) {
      const match = distanceToSegmentM(vehicle.lat, vehicle.lon, coordinates[i], coordinates[i + 1]);
      if (match.distanceM < best.distanceM) best = match;
    }
  }
  if (best.distanceM > MAX_MATCH_DISTANCE_M) return null;

  const properties = feature.properties as Record<string, unknown> | null;
  const directionId = properties?.directionId == null ? null : Number(properties.directionId);
  const headsign = typeof properties?.headsign === 'string' && properties.headsign.trim()
    ? properties.headsign
    : null;
  const headingPenalty = vehicle.bearing == null
    ? 0
    : bearingDifference(vehicle.bearing, best.bearing) / 180 * BEARING_WEIGHT_M;
  return { directionId, headsign, score: best.distanceM + headingPenalty };
}

/** Infer missing live direction metadata from the static directional route shapes. */
export function inferLiveDirection(
  vehicle: LiveVehicle,
  features: GeoJSON.Feature[],
): LiveDirectionMatch {
  const candidates = features
    .map(feature => candidateForFeature(vehicle, feature))
    .filter((candidate): candidate is Candidate => candidate !== null)
    .filter(candidate => vehicle.directionId == null || candidate.directionId === vehicle.directionId)
    .filter(candidate => !vehicle.headsign || candidate.headsign === vehicle.headsign)
    .sort((a, b) => a.score - b.score);
  if (candidates.length === 0) {
    return { directionId: vehicle.directionId, headsign: vehicle.headsign };
  }

  const best = candidates[0];
  const second = candidates.find(candidate =>
    candidate.directionId !== best.directionId || candidate.headsign !== best.headsign,
  );
  // Do not label a vehicle when two directional shapes are effectively tied.
  if (second && second.score - best.score < 75) {
    return { directionId: vehicle.directionId, headsign: vehicle.headsign };
  }
  return {
    directionId: vehicle.directionId ?? best.directionId,
    headsign: vehicle.headsign ?? best.headsign,
  };
}
