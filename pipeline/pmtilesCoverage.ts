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
export function tilesForAgency(agency: CoverageAgency, zoom: number): Array<{ x: number; y: number }> {
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

  if (width * height <= MAX_TILES_PER_AGENCY) {
    for (let x = xMin; x <= xMax; x++) {
      for (let y = yMin; y <= yMax; y++) addTile({ x, y });
    }
  } else {
    const gridDim = Math.max(1, Math.floor(Math.sqrt(MAX_TILES_PER_AGENCY)));
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
