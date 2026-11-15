import type { LiveVehicle } from '../context/LiveVehiclesMapOverlay';
import { projectOntoSegment } from '../../shared/geoDistance';

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
  const { offM, eastM, northM } = projectOntoSegment({ lat, lon }, a, b);
  return { distanceM: offM, bearing: (Math.atan2(eastM, northM) * 180 / Math.PI + 360) % 360 };
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
  const tied = candidates.filter(candidate =>
    candidate.score - best.score < 75
    && (candidate.directionId !== best.directionId || candidate.headsign !== best.headsign),
  );
  // Do not label a vehicle when two directional shapes are effectively tied.
  if (tied.some(candidate => candidate.directionId !== best.directionId)) {
    return { directionId: vehicle.directionId, headsign: vehicle.headsign };
  }
  // Same direction, different destination (a full route and its short turn share track): the direction is
  // certain, the destination is not, so keep the direction and leave the destination for the route's main one.
  if (tied.length > 0) {
    return { directionId: vehicle.directionId ?? best.directionId, headsign: vehicle.headsign };
  }
  return {
    directionId: vehicle.directionId ?? best.directionId,
    headsign: vehicle.headsign ?? best.headsign,
  };
}
