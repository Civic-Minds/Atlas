import type { Agency } from '../App';
import { DEFAULT_MAP_CENTER, DEFAULT_MAP_ZOOM } from '../../shared/config';
import { MAP_URL, readLink } from './urlSchema';
const VIEW_KEY = 'atlas_view';

export interface SavedView { lat: number; lon: number; zoom: number }

/** A latitude outside -90..90 throws inside MapLibre and leaves a dead map (#846). */
export function isValidLatitude(lat: number): boolean {
  return Number.isFinite(lat) && lat >= -90 && lat <= 90;
}

/** The ?lat, ?lon and ?z share-link values, or undefined when any is missing or unusable. */
export function parseUrlView(params: URLSearchParams): { lat: number; lon: number; zoom: number } | undefined {
  const { lat, lon, zoom } = readLink(params, { lat: MAP_URL.lat, lon: MAP_URL.lon, zoom: MAP_URL.zoom });
  if (lat != null && lon != null && zoom != null && isValidLatitude(lat)) return { lat, lon, zoom };
  return undefined;
}

/**
 * #1519: the decimal places a shared map view's lat and lon keep at a zoom, enough to put the same
 * place in the middle of the screen and no more. After "locate me" the view is the visitor's own
 * position, and the address bar goes out in shared links, the feedback email and page analytics:
 * five places (about 1 m) pinned a home. Two places (about 1 km) below zoom 11, three (about 110 m)
 * below zoom 15, four (about 11 m) from 15, where a screen pixel is a few metres and three places
 * would move the view by dozens of pixels.
 */
export function urlViewDecimals(zoom: number): number {
  return zoom < 11 ? 2 : zoom < 15 ? 3 : 4;
}

/** The view as written to the address bar: lat and lon rounded to urlViewDecimals, zoom to 2 places. */
export function urlView(lat: number, lon: number, zoom: number): SavedView {
  const round = (value: number, places: number) => Number(value.toFixed(places));
  const places = urlViewDecimals(zoom);
  return { lat: round(lat, places), lon: round(lon, places), zoom: round(zoom, 2) };
}

export function getSavedView(): SavedView | null {
  try {
    const raw = localStorage.getItem(VIEW_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw);
    if (typeof v.lat === 'number' && typeof v.lon === 'number' && typeof v.zoom === 'number' && isValidLatitude(v.lat) && Number.isFinite(v.lon) && Number.isFinite(v.zoom)) return v;
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
