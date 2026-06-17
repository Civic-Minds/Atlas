import type { GtfsData, GtfsShape } from '../../types/gtfs';

type ShapeGeom = readonly [number, number][];

export interface NrtMergedPair {
  dayShort: string;
  eveShort: string;
  longName: string;
  dayRouteId: string;
  eveRouteId: string;
}

function roundCoord(n: number): number {
  return Math.round(n * 100000) / 100000;
}

function normalizeHeadsign(headsign: string): string {
  return headsign.trim().toUpperCase().replace(/\./g, '').replace(/\s+/g, ' ');
}

function headsignsCompatible(a: string, b: string): boolean {
  const na = normalizeHeadsign(a);
  const nb = normalizeHeadsign(b);
  if (!na || !nb) return true;
  if (na === nb) return true;
  return na.includes(nb) || nb.includes(na);
}

function dayGeomsForDirection(
  dayShapes: Map<string, Set<string>>,
  geoms: Map<string, ShapeGeom>,
  dir: string,
  eveHead: string,
): ShapeGeom[] {
  const preferredKeys = [...dayShapes.keys()].filter(k => {
    const [dayDir, dayHead] = k.split('|');
    return dayDir === dir && headsignsCompatible(dayHead, eveHead);
  });
  const preferredIds = preferredKeys.flatMap(k => [...(dayShapes.get(k) ?? [])]);
  const allDirIds = [...dayShapes.entries()]
    .filter(([k]) => k.startsWith(`${dir}|`))
    .flatMap(([, ids]) => [...ids]);
  const ids = preferredIds.length > 0 ? preferredIds : allDirIds;
  return [...new Set(ids)].map(id => geoms.get(id)).filter((g): g is ShapeGeom => !!g);
}

function shapeById(shapes: GtfsShape[] | undefined): Map<string, ShapeGeom> {
  const map = new Map<string, ShapeGeom>();
  for (const shape of shapes ?? []) {
    if (shape.points.length >= 2) map.set(shape.id, shape.points);
  }
  return map;
}

function endpointsClose(a: [number, number], b: [number, number]): boolean {
  return roundCoord(a[0]) === roundCoord(b[0]) && roundCoord(a[1]) === roundCoord(b[1]);
}

/** Compare polylines — NRT duplicates shapes under new shape_ids for 4xx routes. */
export function shapesCompatible(a: ShapeGeom, b: ShapeGeom): boolean {
  if (a.length < 2 || b.length < 2) return false;
  if (
    a.length === b.length &&
    a.every((p, i) => endpointsClose(p, b[i]))
  ) {
    return true;
  }
  const aStart = a[0];
  const aEnd = a[a.length - 1];
  const bStart = b[0];
  const bEnd = b[b.length - 1];
  return (
    (endpointsClose(aStart, bStart) && endpointsClose(aEnd, bEnd)) ||
    (endpointsClose(aStart, bEnd) && endpointsClose(aEnd, bStart))
  );
}

function shapesForRoute(
  gtfs: GtfsData,
  routeId: string,
): Map<string, Set<string>> {
  const byDirHead = new Map<string, Set<string>>();
  for (const trip of gtfs.trips ?? []) {
    if (trip.route_id !== routeId || !trip.shape_id) continue;
    const key = `${trip.direction_id?.trim() || '0'}|${normalizeHeadsign(trip.trip_headsign ?? '')}`;
    if (!byDirHead.has(key)) byDirHead.set(key, new Set());
    byDirHead.get(key)!.add(trip.shape_id);
  }
  return byDirHead;
}

/**
 * Warn-only audit: for each merged 3xx/4xx pair, check that evening shapes
 * match a daytime counterpart on the same direction (geometry-based).
 */
export function auditNrtMergedPairShapes(gtfs: GtfsData, pairs: NrtMergedPair[]): string[] {
  const geoms = shapeById(gtfs.shapes);
  const warnings: string[] = [];

  for (const pair of pairs) {
    const dayShapes = shapesForRoute(gtfs, pair.dayRouteId);
    const eveShapes = shapesForRoute(gtfs, pair.eveRouteId);

    for (const [eveKey, eveShapeIds] of eveShapes) {
      const [dir, eveHead] = eveKey.split('|');
      const dayGeoms = dayGeomsForDirection(dayShapes, geoms, dir, eveHead);

      for (const eveShapeId of eveShapeIds) {
        const eveGeom = geoms.get(eveShapeId);
        if (!eveGeom) continue;
        if (dayGeoms.some(dayGeom => shapesCompatible(dayGeom, eveGeom))) continue;
        warnings.push(
          `${pair.dayShort}/${pair.eveShort} dir${dir}: evening shape ${eveShapeId} does not match any daytime geometry`,
        );
      }
    }
  }

  return warnings;
}
