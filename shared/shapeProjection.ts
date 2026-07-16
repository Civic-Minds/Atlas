/**
 * Shared point-to-shape projection used by both the live per-vehicle headway
 * path (api/live-vehicles.ts, shared/liveHeadway.ts) and the offline
 * streetcar-headways measurement script. Projects onto the nearest *segment*
 * (not nearest vertex), so GPS noise near closely-spaced vertices — e.g.
 * opposite-direction tracks on the same street — doesn't cause the
 * distance-along-shape value to jump or go non-monotonic between samples.
 */

const EARTH_RADIUS_M = 6_371_000;

export interface Shape {
  pts: [number, number][]; // [lon, lat]
  cum: number[]; // cumulative distance (m) at each vertex
  total: number;
}

export function haversineM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(a));
}

/** Build a shape from raw coordinates, optionally decimating vertices closer than `decimateM` apart. */
export function buildShape(coordinates: [number, number][], decimateM = 0): Shape {
  const pts: [number, number][] = [];
  const cum: number[] = [];
  let total = 0;
  let last: [number, number] | null = null;
  for (const [lon, lat] of coordinates) {
    if (last) {
      const d = haversineM(last[1], last[0], lat, lon);
      if (d < decimateM) continue;
      total += d;
    }
    pts.push([lon, lat]);
    cum.push(total);
    last = [lon, lat];
  }
  return { pts, cum, total };
}

/** Split a LineString or MultiLineString geometry into one shape candidate per part. */
export function shapesFromGeometry(
  geometry: { type: string; coordinates: unknown } | null | undefined,
  decimateM = 0,
): Shape[] {
  if (!geometry) return [];
  if (geometry.type === 'LineString') {
    return [buildShape(geometry.coordinates as [number, number][], decimateM)];
  }
  if (geometry.type === 'MultiLineString') {
    return (geometry.coordinates as [number, number][][]).map(part => buildShape(part, decimateM));
  }
  return [];
}

export interface ShapeProjection {
  along: number;
  perpDistM: number;
}

/**
 * Project a point onto a shape by nearest *segment* (with interpolation),
 * not nearest vertex. Returns the distance along the shape and the
 * perpendicular distance from it, or null if the shape has fewer than 2 points.
 */
export function projectOntoShape(shape: Shape, lat: number, lon: number): ShapeProjection | null {
  if (shape.pts.length < 2) return null;
  let bestPerp = Infinity;
  let bestAlong = 0;
  for (let i = 0; i < shape.pts.length - 1; i++) {
    const [lon1, lat1] = shape.pts[i];
    const [lon2, lat2] = shape.pts[i + 1];
    const refLat = (lat1 + lat2) / 2;
    const cosLat = Math.cos(refLat * Math.PI / 180);
    const bx = (lon2 - lon1) * Math.PI / 180 * EARTH_RADIUS_M * cosLat;
    const by = (lat2 - lat1) * Math.PI / 180 * EARTH_RADIUS_M;
    const px = (lon - lon1) * Math.PI / 180 * EARTH_RADIUS_M * cosLat;
    const py = (lat - lat1) * Math.PI / 180 * EARTH_RADIUS_M;
    const segLenSq = bx * bx + by * by;
    let t = segLenSq > 0 ? (px * bx + py * by) / segLenSq : 0;
    t = Math.max(0, Math.min(1, t));
    const perp = Math.hypot(px - t * bx, py - t * by);
    if (perp < bestPerp) {
      bestPerp = perp;
      const segLen = shape.cum[i + 1] - shape.cum[i];
      bestAlong = shape.cum[i] + t * segLen;
    }
  }
  return { along: bestAlong, perpDistM: bestPerp };
}

/**
 * Pick whichever shape candidate a set of sample points best matches
 * (lowest average perpendicular distance), instead of assuming the
 * longest candidate is the one vehicles actually run on.
 */
export function pickBestShape<T>(
  candidates: T[],
  toShape: (candidate: T) => Shape,
  samples: Array<{ lat: number; lon: number }>,
  maxDistM: number,
): T | null {
  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0];
  let best: T | null = null;
  let bestScore = Infinity;
  for (const candidate of candidates) {
    const shape = toShape(candidate);
    let sum = 0;
    let matched = 0;
    for (const s of samples) {
      const proj = projectOntoShape(shape, s.lat, s.lon);
      if (proj && proj.perpDistM <= maxDistM) {
        sum += proj.perpDistM;
        matched++;
      }
    }
    if (matched === 0) continue;
    const avg = sum / matched;
    // Prefer whichever shape matches the most samples; break ties by lowest average distance.
    const score = -matched * 1_000_000 + avg;
    if (score < bestScore) {
      bestScore = score;
      best = candidate;
    }
  }
  return best ?? candidates[0];
}
