/**
 * On-demand zones published to R2 instead of shipped in the app bundle (CIV-50).
 *
 *   atlas/on-demand/manifest.json                    pointer, swapped on publish and rollback
 *   atlas/on-demand/v/<version>/index.json           every service, without geometry
 *   atlas/on-demand/v/<version>/agencies/<slug>.json one service's zones and stops
 *
 * Beta-only services are written only to the staging bucket; the public bucket gets promoted ones.
 */

export const ON_DEMAND_SCHEMA_VERSION = 1;
export const ON_DEMAND_PREFIX = 'atlas/on-demand';

export interface OnDemandManifest {
  schemaVersion: number;
  version: string;
  generatedAt: string;
  /** Key of index.json relative to the on-demand prefix, e.g. "v/<version>/index.json". */
  indexKey: string;
}

/** A service area with the geometry left out; geometry lives in its agency file. */
export type OnDemandAreaMeta = Record<string, unknown> & {
  sourceUrl: string;
  sourceLabel: string;
  sourceRetrievedAt?: string;
  serviceName?: string;
};

export interface OnDemandIndexEntry {
  slug: string;
  /** Promoted to the public site. Beta-only services never appear in the public index. */
  public: boolean;
  /** [south, west, north, east] of every zone and stop, for loading geometry only when in view. */
  bbox: [number, number, number, number];
  /** Key of the geometry file relative to the version prefix, e.g. "agencies/<slug>.json". */
  geometryKey: string;
  area: OnDemandAreaMeta;
  /** Present for on-demand-only agencies that have no fixed-route catalog entry. */
  agency?: Record<string, unknown> & { slug: string; name: string };
}

export interface OnDemandIndex {
  schemaVersion: number;
  version: string;
  generatedAt: string;
  services: OnDemandIndexEntry[];
}

export interface OnDemandGeometry {
  slug: string;
  features: GeoJSON.Feature[];
  stopFeatures?: GeoJSON.Feature[];
}

/** [south, west, north, east] covering every coordinate in the features. */
export function featuresBbox(features: readonly GeoJSON.Feature[]): [number, number, number, number] {
  let s = Infinity, w = Infinity, n = -Infinity, e = -Infinity;
  const visit = (c: unknown): void => {
    if (!Array.isArray(c)) return;
    if (typeof c[0] === 'number' && typeof c[1] === 'number') {
      const [lon, lat] = c as [number, number];
      if (lat < s) s = lat; if (lat > n) n = lat;
      if (lon < w) w = lon; if (lon > e) e = lon;
      return;
    }
    for (const child of c) visit(child);
  };
  for (const f of features) if (f.geometry && 'coordinates' in f.geometry) visit(f.geometry.coordinates);
  return [s, w, n, e];
}

export function bboxIntersects(
  a: readonly [number, number, number, number],
  b: { s: number; w: number; n: number; e: number },
): boolean {
  return a[0] <= b.n && a[2] >= b.s && a[1] <= b.e && a[3] >= b.w;
}
