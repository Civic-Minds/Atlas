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

function groupFeatures(features: GeoJSON.Feature[], dirId: number): GeoJSON.Feature[] {
  return features.filter(f => (f.properties as { directionId?: number })?.directionId === dirId);
}

/** Mean shape endpoint (headsign side in GTFS vertex order). */
export function directionGroupMeanEnd(features: GeoJSON.Feature[], dirId: number): LonLat | null {
  const ends: LonLat[] = [];
  for (const f of groupFeatures(features, dirId)) {
    const coords = lineCoords(f.geometry);
    if (coords.length < 2) continue;
    ends.push(coords[coords.length - 1]);
  }
  return ends.length === 0 ? null : centroid(ends);
}

/** Service bearing for a direction_id group: mean shape start → mean shape end. */
export function directionGroupBearing(features: GeoJSON.Feature[], dirId: number): number | null {
  const starts: LonLat[] = [];
  const ends: LonLat[] = [];
  for (const f of groupFeatures(features, dirId)) {
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
  return directionGroupMeanEnd(features, dirId)?.[0] ?? null;
}

/**
 * Bound labels for direction groups. Two groups use relative mean-end position
 * (dominant axis); single or 3+ groups fall back to start→end bearing.
 */
export function labelDirectionGroups(
  features: GeoJSON.Feature[],
  dirIds: number[],
): Map<number, string> {
  const labels = new Map<number, string>();
  const ends = dirIds
    .map(dirId => ({ dirId, end: directionGroupMeanEnd(features, dirId) }))
    .filter((x): x is { dirId: number; end: LonLat } => x.end != null);

  if (ends.length === 1) {
    const bearing = directionGroupBearing(features, ends[0].dirId);
    if (bearing != null) labels.set(ends[0].dirId, cardinalBoundLabel(bearing));
    return labels;
  }

  if (ends.length === 2) {
    const [a, b] = ends;
    const dLon = Math.abs(b.end[0] - a.end[0]);
    const dLat = Math.abs(b.end[1] - a.end[1]);
    if (dLon >= dLat) {
      const [west, east] = a.end[0] <= b.end[0] ? [a, b] : [b, a];
      labels.set(west.dirId, 'Westbound');
      labels.set(east.dirId, 'Eastbound');
    } else {
      const [south, north] = a.end[1] <= b.end[1] ? [a, b] : [b, a];
      labels.set(south.dirId, 'Southbound');
      labels.set(north.dirId, 'Northbound');
    }
    return labels;
  }

  for (const { dirId } of ends) {
    const bearing = directionGroupBearing(features, dirId);
    if (bearing != null) labels.set(dirId, cardinalBoundLabel(bearing));
  }
  return labels;
}

/** Sort direction ids west→east or south→north from mean shape ends. */
export function sortDirectionGroupIds(features: GeoJSON.Feature[], dirIds: number[]): number[] {
  const entries = dirIds.map(dirId => ({ dirId, end: directionGroupMeanEnd(features, dirId) }));
  const sample = entries.find(e => e.end != null)?.end;
  const useLon = sample
    ? entries.every(e => !e.end || Math.abs(e.end[0] - sample[0]) >= Math.abs(e.end[1] - sample[1]))
    : true;
  return [...entries]
    .sort((a, b) => {
      if (!a.end || !b.end) return a.dirId - b.dirId;
      return useLon ? a.end[0] - b.end[0] : a.end[1] - b.end[1];
    })
    .map(e => e.dirId);
}
