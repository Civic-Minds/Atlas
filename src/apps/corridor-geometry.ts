/** GeoJSON [lon, lat] line clipped between two stop indices on a shape. */
export function clipLinestring(coords: number[][], tStart: number, tEnd: number): number[][] | null {
  if (tEnd <= tStart || coords.length < 2) return null;

  const lens: number[] = [0];
  for (let i = 0; i < coords.length - 1; i++) {
    const dx = coords[i + 1][0] - coords[i][0];
    const dy = coords[i + 1][1] - coords[i][1];
    lens.push(lens[i] + Math.sqrt(dx * dx + dy * dy));
  }
  const total = lens[lens.length - 1];
  if (total === 0) return null;

  const targetStart = tStart * total;
  const targetEnd = tEnd * total;
  const result: number[][] = [];

  for (let i = 0; i < lens.length - 1; i++) {
    const segLen = lens[i + 1] - lens[i];
    if (lens[i + 1] >= targetStart && result.length === 0) {
      const frac = segLen > 0 ? (targetStart - lens[i]) / segLen : 0;
      result.push([
        coords[i][0] + frac * (coords[i + 1][0] - coords[i][0]),
        coords[i][1] + frac * (coords[i + 1][1] - coords[i][1]),
      ]);
    }
    if (lens[i + 1] > targetStart && lens[i + 1] < targetEnd) {
      result.push(coords[i + 1]);
    }
    if (lens[i] < targetEnd && lens[i + 1] >= targetEnd) {
      const frac = segLen > 0 ? (targetEnd - lens[i]) / segLen : 1;
      result.push([
        coords[i][0] + frac * (coords[i + 1][0] - coords[i][0]),
        coords[i][1] + frac * (coords[i + 1][1] - coords[i][1]),
      ]);
      break;
    }
  }
  return result.length >= 2 ? result : null;
}

export function clipBetweenStopIndices(
  coords: number[][],
  stopPositions: number[],
  fromIdx: number,
  toIdx: number,
): number[][] | null {
  if (fromIdx < 0 || toIdx <= fromIdx || stopPositions.length < 2) return null;
  const tStart = fromIdx > 0
    ? (stopPositions[fromIdx] + stopPositions[fromIdx - 1]) / 2
    : stopPositions[fromIdx];
  const tEnd = toIdx < stopPositions.length - 1
    ? (stopPositions[toIdx] + stopPositions[toIdx + 1]) / 2
    : stopPositions[toIdx];
  return clipLinestring(coords, tStart, tEnd);
}

export function formatRouteColor(routeColor: string | null | undefined, fallback = '#555555'): string {
  if (!routeColor) return fallback;
  const hex = routeColor.replace('#', '').trim();
  return hex.length >= 6 ? `#${hex.slice(0, 6)}` : fallback;
}
