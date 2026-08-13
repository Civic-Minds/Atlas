import naPlaces from './data/na-places.json';

type PlaceRow = [name: string, lat: number, lon: number, country: string, region: string, population: number];

// Pre-sorted by population descending (see shared/data/README.md), so when a name is
// ambiguous (e.g. "Bellevue" exists in both Washington and Nebraska) the first match
// found is the larger/more-likely-intended city.
const PLACES = naPlaces as PlaceRow[];

export interface PlaceMatch {
  name: string;
  region: string;
  lat: number;
  lon: number;
}

const MAX_NEAREST_PLACE_KM = 40;

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/**
 * Exact (case-insensitive) place-name match against the North America city gazetteer.
 * Independent of the agency registry — a city can be typed and found even when it's
 * served by zero, one, or several agencies (unlike an agency-uniqueness match, which
 * breaks down the moment more than one agency happens to serve the same city).
 */
export function findPlaceByName(query: string): PlaceMatch | null {
  const q = query.trim().toLowerCase();
  if (!q) return null;
  const row = PLACES.find(([name]) => name.toLowerCase() === q);
  if (!row) return null;
  const [name, lat, lon, , region] = row;
  return { name, region, lat, lon };
}

/** Find the nearest gazetteer place to a map coordinate, within a reasonable city radius. */
export function findNearestPlace(lat: number, lon: number): PlaceMatch | null {
  let best: PlaceRow | null = null;
  let bestDistance = Infinity;

  for (const row of PLACES) {
    if (Math.abs(row[1] - lat) > 0.6 || Math.abs(row[2] - lon) > 0.8) continue;
    const distance = haversineKm(lat, lon, row[1], row[2]);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = row;
    }
  }

  if (!best || bestDistance > MAX_NEAREST_PLACE_KM) return null;
  const [name, , , , region] = best;
  return { name, region, lat: best[1], lon: best[2] };
}
