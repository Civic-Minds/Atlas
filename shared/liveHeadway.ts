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

const EARTH_RADIUS_M = 6_371_000;
const MIN_SPEED_KMH = 12;

function distanceM(a: [number, number], b: [number, number]): number {
  const lat1 = a[1] * Math.PI / 180;
  const lat2 = b[1] * Math.PI / 180;
  const dLat = lat2 - lat1;
  const dLon = (b[0] - a[0]) * Math.PI / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}

function project(shape: HeadwayShape, point: [number, number]): number {
  let along = 0;
  let bestDistance = Infinity;
  let bestAlong = 0;
  for (let i = 0; i < shape.coordinates.length; i++) {
    const vertex = shape.coordinates[i];
    if (i > 0) along += distanceM(shape.coordinates[i - 1], vertex);
    const d = distanceM(point, vertex);
    if (d < bestDistance) {
      bestDistance = d;
      bestAlong = along;
    }
  }
  return bestAlong;
}

/** Approximate the time gap to the next vehicle on the same directional shape. */
export function vehicleHeadwayGapMin(
  vehicle: HeadwayVehicle,
  peers: HeadwayVehicle[],
  shape: HeadwayShape,
): number | null {
  const position = project(shape, [vehicle.lon, vehicle.lat]);
  const sameDirection = peers.filter(peer =>
    peer.id !== vehicle.id &&
    (vehicle.directionId == null || peer.directionId == null || vehicle.directionId === peer.directionId),
  );
  const ahead = sameDirection
    .map(peer => project(shape, [peer.lon, peer.lat]) - position)
    .filter(gap => gap > 0 && gap < 20_000)
    .sort((a, b) => a - b)[0];
  if (ahead == null) return null;

  const speedKmh = Math.max(Number(vehicle.speedKmh) || 0, MIN_SPEED_KMH);
  return Math.round((ahead / 1000 / speedKmh * 60) * 10) / 10;
}
