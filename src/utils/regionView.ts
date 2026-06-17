import type { Agency } from '../App';

const DEFAULT_CENTER: [number, number] = [43.65, -79.45];
const DEFAULT_ZOOM = 8;

/** Center and zoom that frame every agency in the registry. */
export function getRegionalView(agencies: Agency[]): { center: [number, number]; zoom: number } {
  if (agencies.length === 0) {
    return { center: DEFAULT_CENTER, zoom: DEFAULT_ZOOM };
  }

  const lats = agencies.map(a => a.center[0]);
  const lons = agencies.map(a => a.center[1]);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLon = Math.min(...lons);
  const maxLon = Math.max(...lons);

  const center: [number, number] = [(minLat + maxLat) / 2, (minLon + maxLon) / 2];
  const maxSpan = Math.max(maxLat - minLat, maxLon - minLon);

  let zoom = DEFAULT_ZOOM;
  if (maxSpan < 1.5) zoom = 9;
  else if (maxSpan < 3) zoom = 8;
  else if (maxSpan < 5) zoom = 7;
  else zoom = 6.5;

  return { center, zoom };
}

export function getAgencyBounds(agencies: Agency[]): [[number, number], [number, number]] | null {
  if (agencies.length === 0) return null;
  const lats = agencies.map(a => a.center[0]);
  const lons = agencies.map(a => a.center[1]);
  return [
    [Math.min(...lats), Math.min(...lons)],
    [Math.max(...lats), Math.max(...lons)],
  ];
}
