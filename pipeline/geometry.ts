/** Douglas-Peucker line simplification. Tolerance in degrees (~0.0001 ≈ 11m). */
export function simplifyLine(coords: number[][], tolerance: number): number[][] {
  if (coords.length <= 2) return coords;
  const [x1, y1] = coords[0];
  const [x2, y2] = coords[coords.length - 1];
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  let maxDist = 0;
  let maxIdx = 0;
  for (let i = 1; i < coords.length - 1; i++) {
    const [px, py] = coords[i];
    const dist = lenSq === 0
      ? Math.sqrt((px - x1) ** 2 + (py - y1) ** 2)
      : Math.abs(dy * px - dx * py + x2 * y1 - y2 * x1) / Math.sqrt(lenSq);
    if (dist > maxDist) {
      maxDist = dist;
      maxIdx = i;
    }
  }
  if (maxDist > tolerance) {
    const left = simplifyLine(coords.slice(0, maxIdx + 1), tolerance);
    const right = simplifyLine(coords.slice(maxIdx), tolerance);
    return [...left.slice(0, -1), ...right];
  }
  return [coords[0], coords[coords.length - 1]];
}

function nearestParamOnSegment(
  pt: [number, number],
  a: [number, number],
  b: [number, number],
  segLen: number,
): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  if (segLen === 0) return 0;
  const t = Math.max(0, Math.min(1, ((pt[0] - a[0]) * dx + (pt[1] - a[1]) * dy) / segLen));
  return t;
}

export function projectStopsOntoShape(
  stopIds: string[],
  stopsById: Map<string, { lat: number; lon: number }>,
  shapePts: [number, number][],
): { stopId: string; t: number; dev2: number }[] {
  if (shapePts.length < 2) return [];

  const segLens: number[] = [];
  const cumLen: number[] = [0];
  for (let i = 0; i < shapePts.length - 1; i++) {
    const dx = shapePts[i + 1][0] - shapePts[i][0];
    const dy = shapePts[i + 1][1] - shapePts[i][1];
    const len2 = dx * dx + dy * dy;
    segLens.push(len2);
    cumLen.push(cumLen[i] + Math.sqrt(len2));
  }
  const totalLen = cumLen[cumLen.length - 1];
  if (totalLen === 0) return [];

  const projected: { stopId: string; t: number; dev2: number }[] = [];
  for (const stopId of stopIds) {
    const stop = stopsById.get(stopId);
    if (!stop) continue;
    const pt: [number, number] = [stop.lat, stop.lon];

    let bestT = 0;
    let bestDist2 = Infinity;
    for (let i = 0; i < shapePts.length - 1; i++) {
      const segT = nearestParamOnSegment(pt, shapePts[i], shapePts[i + 1], segLens[i]);
      const nearLat = shapePts[i][0] + segT * (shapePts[i + 1][0] - shapePts[i][0]);
      const nearLon = shapePts[i][1] + segT * (shapePts[i + 1][1] - shapePts[i][1]);
      const dx = pt[0] - nearLat;
      const dy = pt[1] - nearLon;
      const d2 = dx * dx + dy * dy;
      if (d2 < bestDist2) {
        bestDist2 = d2;
        bestT = (cumLen[i] + segT * Math.sqrt(segLens[i])) / totalLen;
      }
    }
    projected.push({ stopId, t: bestT, dev2: bestDist2 });
  }

  return projected.sort((a, b) => a.t - b.t);
}

/** Clip a GeoJSON LineString to the shaped path between two stops. */
export function clipLineBetweenStops(
  coords: number[][],
  from: { lat: number; lon: number },
  to: { lat: number; lon: number },
  maxDeviation = 0.0045,
): number[][] | null {
  if (coords.length < 2) return null;

  const stops = new Map([
    ['from', from],
    ['to', to],
  ]);
  const shapePts: [number, number][] = coords.map(([lon, lat]) => [lat, lon]);
  const projected = projectStopsOntoShape(['from', 'to'], stops, shapePts);
  const fromProjection = projected.find(p => p.stopId === 'from');
  const toProjection = projected.find(p => p.stopId === 'to');
  const maxDeviation2 = maxDeviation * maxDeviation;
  if (
    !fromProjection ||
    !toProjection ||
    fromProjection.dev2 > maxDeviation2 ||
    toProjection.dev2 > maxDeviation2 ||
    toProjection.t <= fromProjection.t
  ) return null;

  const lengths: number[] = [0];
  for (let i = 0; i < coords.length - 1; i++) {
    const dx = coords[i + 1][0] - coords[i][0];
    const dy = coords[i + 1][1] - coords[i][1];
    lengths.push(lengths[i] + Math.sqrt(dx * dx + dy * dy));
  }
  const totalLength = lengths[lengths.length - 1];
  if (totalLength === 0) return null;

  const start = fromProjection.t * totalLength;
  const end = toProjection.t * totalLength;
  const clipped: number[][] = [];
  for (let i = 0; i < coords.length - 1; i++) {
    const segmentLength = lengths[i + 1] - lengths[i];
    if (lengths[i + 1] >= start && clipped.length === 0) {
      const fraction = segmentLength > 0 ? (start - lengths[i]) / segmentLength : 0;
      clipped.push([
        coords[i][0] + fraction * (coords[i + 1][0] - coords[i][0]),
        coords[i][1] + fraction * (coords[i + 1][1] - coords[i][1]),
      ]);
    }
    if (lengths[i + 1] > start && lengths[i + 1] < end) clipped.push(coords[i + 1]);
    if (lengths[i] < end && lengths[i + 1] >= end) {
      const fraction = segmentLength > 0 ? (end - lengths[i]) / segmentLength : 1;
      clipped.push([
        coords[i][0] + fraction * (coords[i + 1][0] - coords[i][0]),
        coords[i][1] + fraction * (coords[i + 1][1] - coords[i][1]),
      ]);
      break;
    }
  }

  return clipped.length >= 2 ? clipped : null;
}

/** Clip a shaped LineString between two normalized positions already projected onto it. */
export function clipLineBetweenPositions(
  coords: number[][],
  tStart: number,
  tEnd: number,
): number[][] | null {
  if (coords.length < 2 || tEnd <= tStart) return null;
  const lengths: number[] = [0];
  for (let i = 0; i < coords.length - 1; i++) {
    const dx = coords[i + 1][0] - coords[i][0];
    const dy = coords[i + 1][1] - coords[i][1];
    lengths.push(lengths[i] + Math.sqrt(dx * dx + dy * dy));
  }
  const totalLength = lengths[lengths.length - 1];
  if (totalLength === 0) return null;

  const start = tStart * totalLength;
  const end = tEnd * totalLength;
  const clipped: number[][] = [];
  for (let i = 0; i < coords.length - 1; i++) {
    const segmentLength = lengths[i + 1] - lengths[i];
    if (lengths[i + 1] >= start && clipped.length === 0) {
      const fraction = segmentLength > 0 ? (start - lengths[i]) / segmentLength : 0;
      clipped.push([
        coords[i][0] + fraction * (coords[i + 1][0] - coords[i][0]),
        coords[i][1] + fraction * (coords[i + 1][1] - coords[i][1]),
      ]);
    }
    if (lengths[i + 1] > start && lengths[i + 1] < end) clipped.push(coords[i + 1]);
    if (lengths[i] < end && lengths[i + 1] >= end) {
      const fraction = segmentLength > 0 ? (end - lengths[i]) / segmentLength : 1;
      clipped.push([
        coords[i][0] + fraction * (coords[i + 1][0] - coords[i][0]),
        coords[i][1] + fraction * (coords[i + 1][1] - coords[i][1]),
      ]);
      break;
    }
  }
  return clipped.length >= 2 ? clipped : null;
}
