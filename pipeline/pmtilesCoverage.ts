export interface CoverageAgency {
  center: [number, number]; // [lat, lon]
  bbox?: [number, number, number, number]; // [s, w, n, e]
}

// Matches the app's fallback bbox padding (shared/config.ts AGENCY_BBOX_PAD).
const FALLBACK_PAD = { lat: 0.4, lon: 0.5 };
const MAX_TILES_PER_AGENCY = 100;

export function lonLatToTile(lon: number, lat: number, zoom: number): { x: number; y: number } {
  const n = 2 ** zoom;
  const latRad = (lat * Math.PI) / 180;
  const x = Math.floor(((lon + 180) / 360) * n);
  const y = Math.floor(
    ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n,
  );
  return {
    x: Math.min(Math.max(x, 0), n - 1),
    y: Math.min(Math.max(y, 0), n - 1),
  };
}

/**
 * Every tile spanned by an agency's bbox at the sampling zoom, up to the cap.
 * The center tile is always included so small agencies cannot disappear from
 * the check when a large fallback area is sampled with a sparse grid.
 */
export function tilesForAgency(agency: CoverageAgency, zoom: number, maxTiles = MAX_TILES_PER_AGENCY): Array<{ x: number; y: number }> {
  const [centerLat, centerLon] = agency.center;
  const [s, w, n, e] = agency.bbox ?? [
    centerLat - FALLBACK_PAD.lat,
    centerLon - FALLBACK_PAD.lon,
    centerLat + FALLBACK_PAD.lat,
    centerLon + FALLBACK_PAD.lon,
  ];
  const topLeft = lonLatToTile(w, n, zoom);
  const bottomRight = lonLatToTile(e, s, zoom);
  const xMin = Math.min(topLeft.x, bottomRight.x);
  const xMax = Math.max(topLeft.x, bottomRight.x);
  const yMin = Math.min(topLeft.y, bottomRight.y);
  const yMax = Math.max(topLeft.y, bottomRight.y);
  const width = xMax - xMin + 1;
  const height = yMax - yMin + 1;
  const centerTile = lonLatToTile(centerLon, centerLat, zoom);
  const tiles: Array<{ x: number; y: number }> = [];
  const addTile = (tile: { x: number; y: number }) => {
    if (!tiles.some(existing => existing.x === tile.x && existing.y === tile.y)) tiles.push(tile);
  };

  if (width * height <= maxTiles) {
    for (let x = xMin; x <= xMax; x++) {
      for (let y = yMin; y <= yMax; y++) addTile({ x, y });
    }
  } else {
    const gridDim = Math.max(1, Math.floor(Math.sqrt(maxTiles)));
    for (let i = 0; i < gridDim; i++) {
      for (let j = 0; j < gridDim; j++) {
        addTile({
          x: xMin + Math.round((i / Math.max(1, gridDim - 1)) * (width - 1)),
          y: yMin + Math.round((j / Math.max(1, gridDim - 1)) * (height - 1)),
        });
      }
    }
  }
  addTile(centerTile);
  return tiles;
}

type RouteArtifact = {
  features?: Array<{
    geometry?: { type?: string } | null;
    properties?: Record<string, unknown> | null;
  }>;
} | null | undefined;

/**
 * Whether a published route artifact is schedule-only: it has route features, but none of them is
 * a line. Feeds without usable shapes publish their routes as Points (noRouteShape), and PMTiles
 * keep lines only, so such an agency legitimately has zero route features in the archive. It must
 * not fail the coverage gate (that would block every release); an agency that does have lines and
 * is still missing from the archive is a real gap and keeps failing.
 */
export function isScheduleOnlyRouteArtifact(artifact: RouteArtifact): boolean {
  const routes = (artifact?.features ?? []).filter(f => f?.properties?.routeId != null && f.properties.stopId == null);
  if (routes.length === 0) return false;
  return routes.every(f => f.geometry?.type !== 'LineString' && f.geometry?.type !== 'MultiLineString');
}

export interface TileInclusionAgency {
  pmtilesPending?: boolean;
  hiddenInProduction?: boolean;
  staged?: boolean;
  lastFeedExpiry?: string | null;
  lastRefreshedAt?: string | null;
}

/**
 * Whether build-pmtiles puts this agency into the tiles. Hidden, staged and
 * pending agencies stay out (their R2 artifacts may still be updated), so the
 * coverage gate must expect them to be missing. One predicate for the build,
 * the coverage gate and the release smoke sample keeps the three in step.
 */
export function isBuiltIntoTiles(agency: TileInclusionAgency): boolean {
  return !agency.pmtilesPending
    && !agency.hiddenInProduction
    && !agency.staged
    && (!!agency.lastFeedExpiry || !!agency.lastRefreshedAt);
}

/** An agency the coverage gate fails on when it has no route features in the archive. */
export function mustAppearInTiles(agency: TileInclusionAgency): boolean {
  return isBuiltIntoTiles(agency) && !!agency.lastFeedExpiry;
}
