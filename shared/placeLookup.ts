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
