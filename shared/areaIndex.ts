/**
 * The map's `?area=<slug>` link: the same slugs as config/areas and the /area/<slug> pages.
 * shared/data/area-index.json is a trimmed copy of config/areas (agencies and bounds only),
 * small enough for the map bundle; scripts/build-areas.ts writes it.
 */
import areaIndexJson from './data/area-index.json';

export interface AreaIndexEntry {
  /** The city people search for: "Montréal". */
  name?: string;
  /** Main cities in the area, matched by area search. */
  cities?: string[];
  /** Whether the area has its own page (the same regions /agencies lists). */
  page?: boolean;
  agencies: string[];
  /** [south, west, north, east] */
  bbox: [number, number, number, number];
}
export type AreaIndex = Readonly<Record<string, AreaIndexEntry>>;

export const AREA_INDEX = areaIndexJson as unknown as AreaIndex;
export const AREA_PARAM = 'area';

/** The area named by a slug, or null for anything unknown (including inherited object keys). */
export function lookupArea(slug: string | null | undefined, index: AreaIndex = AREA_INDEX): AreaIndexEntry | null {
  if (!slug) return null;
  const key = slug.trim().toLowerCase();
  return Object.prototype.hasOwnProperty.call(index, key) ? index[key] : null;
}

/** Starting zoom for a view of these bounds, before the map has a size to fit them to. */
export function areaFitZoom(bbox: readonly [number, number, number, number]): number {
  const [s, w, n, e] = bbox;
  const lat = (s + n) / 2;
  const span = Math.max(n - s, (e - w) * Math.cos((lat * Math.PI) / 180));
  return span > 3 ? 7 : span > 1.5 ? 8 : span > 0.7 ? 9 : span > 0.35 ? 10 : 11;
}

/**
 * The area whose agencies, among those in the catalog (so beta-only agencies drop out on public),
 * are exactly the selection. If several areas match, the first slug in order wins.
 */
export function areaMatchingSelection(
  selected: ReadonlySet<string>,
  catalogSlugs: readonly string[],
  index: AreaIndex = AREA_INDEX,
): string | null {
  if (selected.size === 0) return null;
  const inCatalog = new Set(catalogSlugs);
  let best: string | null = null;
  for (const slug of Object.keys(index).sort()) {
    const visible = index[slug].agencies.filter(a => inCatalog.has(a));
    if (visible.length !== selected.size || !visible.every(a => selected.has(a))) continue;
    best = slug;
    break;
  }
  return best;
}
