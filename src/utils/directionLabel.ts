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

function dist2(a: LonLat, b: LonLat): number {
  const dx = a[0] - b[0];
  const dy = a[1] - b[1];
  return dx * dx + dy * dy;
}

/** Mean terminal point + bearing from route centroid for one direction_id group. */
export function directionGroupBearing(
  features: GeoJSON.Feature[],
  dirId: number,
): number | null {
  const group = features.filter(f => (f.properties as { directionId?: number })?.directionId === dirId);
  if (group.length === 0) return null;

  const allCoords = group.flatMap(f => lineCoords(f.geometry));
  const center = centroid(allCoords);
  if (!center) return null;

  const terminals: LonLat[] = [];
  for (const f of group) {
    const coords = lineCoords(f.geometry);
    if (coords.length < 2) continue;
    const start = coords[0];
    const end = coords[coords.length - 1];
    terminals.push(dist2(start, center) >= dist2(end, center) ? start : end);
  }
  if (terminals.length === 0) return null;

  const terminal = centroid(terminals)!;
  return bearingDegrees(center[1], center[0], terminal[1], terminal[0]);
}

export function directionGroupTerminalLon(features: GeoJSON.Feature[], dirId: number): number | null {
  const group = features.filter(f => (f.properties as { directionId?: number })?.directionId === dirId);
  const allCoords = group.flatMap(f => lineCoords(f.geometry));
  const center = centroid(allCoords);
  if (!center) return null;

  const terminals: LonLat[] = [];
  for (const f of group) {
    const coords = lineCoords(f.geometry);
    if (coords.length < 2) continue;
    const start = coords[0];
    const end = coords[coords.length - 1];
    terminals.push(dist2(start, center) >= dist2(end, center) ? start : end);
  }
  if (terminals.length === 0) return null;
  return centroid(terminals)![0];
}
