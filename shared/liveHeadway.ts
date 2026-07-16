import { buildShape, projectOntoShape, type Shape } from './shapeProjection.js';

export interface HeadwayVehicle {
  id: string;
  lat: number;
  lon: number;
  speedKmh?: number | null;
  directionId?: number | null;
}

export interface HeadwayShape {
  coordinates: [number, number][];
}

const MIN_SPEED_KMH = 12;

/** Approximate the time gap to the next vehicle on the same directional shape (pre-built shape). */
export function vehicleHeadwayGapMinFromShape(
  vehicle: HeadwayVehicle,
  peers: HeadwayVehicle[],
  shape: Shape,
): number | null {
  const along = (v: HeadwayVehicle) => projectOntoShape(shape, v.lat, v.lon)?.along ?? 0;
  const position = along(vehicle);
  const sameDirection = peers.filter(peer =>
    peer.id !== vehicle.id &&
    (vehicle.directionId == null || peer.directionId == null || vehicle.directionId === peer.directionId),
  );
  const ahead = sameDirection
    .map(peer => along(peer) - position)
    .filter(gap => gap > 0 && gap < 20_000)
    .sort((a, b) => a - b)[0];
  if (ahead == null) return null;

  const speedKmh = Math.max(Number(vehicle.speedKmh) || 0, MIN_SPEED_KMH);
  return Math.round((ahead / 1000 / speedKmh * 60) * 10) / 10;
}

/** Approximate the time gap to the next vehicle on the same directional shape. */
export function vehicleHeadwayGapMin(
  vehicle: HeadwayVehicle,
  peers: HeadwayVehicle[],
  shape: HeadwayShape,
): number | null {
  return vehicleHeadwayGapMinFromShape(vehicle, peers, buildShape(shape.coordinates));
}
