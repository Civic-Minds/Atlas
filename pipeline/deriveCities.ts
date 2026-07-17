import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export interface GazetteerPlace {
  name: string;
  lat: number;
  lon: number;
  country: string;
  region: string;
}

let cachedPlaces: GazetteerPlace[] | null = null;

function loadPlaces(): GazetteerPlace[] {
  if (cachedPlaces) return cachedPlaces;
  const path = resolve(import.meta.dirname, 'data/na-places.json');
  const rows = JSON.parse(readFileSync(path, 'utf8')) as [string, number, number, string, string][];
  cachedPlaces = rows.map(([name, lat, lon, country, region]) => ({ name, lat, lon, country, region }));
  return cachedPlaces;
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

const MAX_MATCH_KM = 40;

/** Nearest gazetteer city (population >= 50,000) to a coordinate, or null if none within MAX_MATCH_KM. */
export function nearestCity(lat: number, lon: number): GazetteerPlace | null {
  const places = loadPlaces();
  let best: GazetteerPlace | null = null;
  let bestD = Infinity;
  for (const p of places) {
    // Cheap bounding-box pre-filter before the real (trig-heavy) distance calc.
    if (Math.abs(p.lat - lat) > 0.6 || Math.abs(p.lon - lon) > 0.8) continue;
    const d = haversineKm(lat, lon, p.lat, p.lon);
    if (d < bestD) { bestD = d; best = p; }
  }
  return bestD <= MAX_MATCH_KM ? best : null;
}

/**
 * Derive the cities an agency serves from its stop coordinates: nearest gazetteer
 * city per stop, ranked by stop count, top `limit` returned as "City, Region".
 * Stops with no gazetteer city within range are ignored (small/rural agencies may
 * return an empty list — that's expected, not an error).
 */
export function deriveCitiesFromStops(
  stops: Array<{ lat: number; lon: number }>,
  limit = 10,
): string[] {
  const counts = new Map<string, number>();
  for (const s of stops) {
    const c = nearestCity(s.lat, s.lon);
    if (!c) continue;
    const key = c.region ? `${c.name}, ${c.region}` : c.name;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([name]) => name);
}
