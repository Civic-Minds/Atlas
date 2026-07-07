import type { Agency } from '../App';
import { DEFAULT_MAP_CENTER, DEFAULT_MAP_ZOOM } from '../../shared/config';
const VIEW_KEY = 'atlas_view';

export interface SavedView { lat: number; lon: number; zoom: number }

export function getSavedView(): SavedView | null {
  try {
    const raw = localStorage.getItem(VIEW_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw);
    if (typeof v.lat === 'number' && typeof v.lon === 'number' && typeof v.zoom === 'number') return v;
    return null;
  } catch { return null; }
}

export function saveView(lat: number, lon: number, zoom: number): void {
  try { localStorage.setItem(VIEW_KEY, JSON.stringify({ lat, lon, zoom })); } catch {}
}

/** Initial center and zoom for MapContainer. Uses the last saved view when available,
 *  otherwise falls back to the GTHA core default. The reset button uses fitBounds. */
export function getRegionalView(_agencies: Agency[]): { center: [number, number]; zoom: number } {
  const saved = getSavedView();
  if (saved) return { center: [saved.lat, saved.lon], zoom: saved.zoom };
  return { center: DEFAULT_MAP_CENTER, zoom: DEFAULT_MAP_ZOOM };
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
