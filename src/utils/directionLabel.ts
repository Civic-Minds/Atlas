/** Bearing in degrees (0 = north, 90 = east) from point A to B. */
export function bearingDegrees(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return (((Math.atan2(y, x) * 180) / Math.PI) + 360) % 360;
}

/** Primary-cardinal label for a service direction. */
export function cardinalBoundLabel(bearing: number): string {
  const b = ((bearing % 360) + 360) % 360;
  if (b >= 315 || b < 45) return 'Northbound';
  if (b >= 45 && b < 135) return 'Eastbound';
  if (b >= 135 && b < 225) return 'Southbound';
  return 'Westbound';
}

type LonLat = [number, number];

function lineCoords(geometry: GeoJSON.Geometry | null | undefined): LonLat[] {
  if (!geometry || geometry.type !== 'LineString') return [];
  return geometry.coordinates as LonLat[];
}

function centroid(coords: LonLat[]): LonLat | null {
  if (coords.length === 0) return null;
  let lon = 0;
  let lat = 0;
  for (const [x, y] of coords) {
    lon += x;
    lat += y;
  }
  return [lon / coords.length, lat / coords.length];
}

/** Service bearing for a direction_id group: mean shape start → mean shape end. */
export function directionGroupBearing(
  features: GeoJSON.Feature[],
  dirId: number,
): number | null {
  const group = features.filter(f => (f.properties as { directionId?: number })?.directionId === dirId);
  if (group.length === 0) return null;

  const starts: LonLat[] = [];
  const ends: LonLat[] = [];
  for (const f of group) {
    const coords = lineCoords(f.geometry);
    if (coords.length < 2) continue;
    starts.push(coords[0]);
    ends.push(coords[coords.length - 1]);
  }
  if (starts.length === 0) return null;

  const start = centroid(starts)!;
  const end = centroid(ends)!;
  return bearingDegrees(start[1], start[0], end[1], end[0]);
}

/** Mean longitude of shape ends (for west-to-east group sort). */
export function directionGroupTerminalLon(features: GeoJSON.Feature[], dirId: number): number | null {
  const group = features.filter(f => (f.properties as { directionId?: number })?.directionId === dirId);
  const ends: LonLat[] = [];
  for (const f of group) {
    const coords = lineCoords(f.geometry);
    if (coords.length < 2) continue;
    ends.push(coords[coords.length - 1]);
  }
  if (ends.length === 0) return null;
  return centroid(ends)![0];
}
