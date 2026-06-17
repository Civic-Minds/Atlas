import type { Agency } from '../App';

// GTHA core — good starting view for the full 20-agency network.
// The reset button uses fitBounds to show all agencies; this is just the initial load state.
const DEFAULT_CENTER: [number, number] = [43.65, -79.45];
const DEFAULT_ZOOM = 11;

/** Initial center and zoom for MapContainer. Always returns the GTHA core default —
 *  outlier agencies like Kingston and London drag a computed midpoint too far east/west.
 *  The reset button (getAgencyBounds + fitBounds) handles "show everything." */
export function getRegionalView(_agencies: Agency[]): { center: [number, number]; zoom: number } {
  return { center: DEFAULT_CENTER, zoom: DEFAULT_ZOOM };
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
