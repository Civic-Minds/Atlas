/**
 * #1699: the cities `list_agencies near` measures from, from shared/data/na-places.json (GeoNames, the same file the
 * pipeline names agencies' cities from). "Washington DC" found nothing once WMATA, whose area centre stood in for the
 * city, was left out, and "Bethesda" measured from Maryland Transit Administration's area centre.
 */
import naPlaces from '../../shared/data/na-places.json';
import { REGION_TILES } from '../../src/data/regionTileGrid';

export interface Place { name: string; lat: number; lon: number; region: string; population: number }

const PLACES: Place[] = (naPlaces as [string, number, number, string, string, number][]).map(([name, lat, lon, , region, population]) => ({ name, lat, lon, region, population }));

/** Lowercase, without accents or dots ("Montréal" → "montreal", "D.C." → "dc"). */
export const plainText = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\./g, '').replace(/\s+/g, ' ').trim().toLowerCase();

/** A region's other names (the places file's and the agency configs' differ; #1701: "District of Columbia", "DC"). */
const SAME_REGION: string[][] = [['District of Columbia', 'Washington DC', 'Washington D.C.'], ['Newfoundland and Labrador', 'Newfoundland']];
/** A region's names, plain: its own, its other names and its short form ("DC", "ON"). */
function regionNames(region: string): string[] {
  const names = SAME_REGION.find(g => g.some(n => plainText(n) === plainText(region))) ?? [region];
  const abbr = [region, ...names].map(n => REGION_TILES[n]?.abbr).find(Boolean);
  return [...new Set([region, ...names, ...(abbr ? [abbr] : [])].map(plainText))];
}
/** #1701: whether an agency's region is the one asked for, by its full name, another name or its short form. */
export const sameRegion = (region: string | null | undefined, asked: string): boolean => !!region && regionNames(region).includes(plainText(asked));

/**
 * The places a name finds, largest first: "Arlington", "Arlington, Virginia", "Arlington VA", "Washington DC".
 * A region given after the name narrows it; a name alone finds every place with that name.
 */
export function placesNamed(query: string): Place[] {
  const q = plainText(query.replace(/,/g, ' , '));
  const tries: Array<[string, string | null]> = [[q.replace(/ , /g, ' ').replace(/ ,$/, ''), null]];
  const comma = q.indexOf(' , ');
  if (comma > 0) tries.unshift([q.slice(0, comma), q.slice(comma + 3).replace(/ , /g, ' ')]);
  else {
    // No comma: the last one to three words may be the region ("washington dc", "st john's newfoundland and labrador").
    const words = q.split(' ');
    for (let n = Math.min(4, words.length - 1); n >= 1; n--) tries.push([words.slice(0, -n).join(' '), words.slice(-n).join(' ')]);
  }
  for (const [name, region] of tries) {
    const hits = PLACES.filter(p => plainText(p.name) === name && (region == null || regionNames(p.region).includes(region)));
    if (hits.length) return hits.sort((a, b) => b.population - a.population);
  }
  return [];
}
