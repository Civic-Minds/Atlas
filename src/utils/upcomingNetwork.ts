/**
 * CIV-1252 network change preview: the upcoming network an agency has published ahead of its start date, read from
 * atlas/upcoming/ on the beta bucket (written by the pipeline from a held future-dated feed, never part of the public
 * release). The index lists which agencies have one; each route file has the same shape as atlas/{slug}.json,
 * processed at the feed's first week.
 */

/** Which network a compare side shows. Map A is always the current one. */
export type CompareDataset = 'current' | 'upcoming';

/** One entry of atlas/upcoming/index.json's `agencies` list, as Atlas Data writes it. */
export interface UpcomingNetworkEntry {
  slug: string;
  feedStart: string;
  feedExpiry?: string | null;
  feedVersion?: string | null;
  sourceKey?: string | null;
  referenceDate?: string | null;
  serviceWeekStart?: string | null;
  routes?: number | null;
  stops?: number | null;
}

/** "2027-09-06" or "20270906" → "20270906"; null for anything else. */
export function compactDate(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const digits = raw.trim().replace(/-/g, '');
  return /^\d{8}$/.test(digits) ? digits : null;
}

/** Today's date on the viewer's clock, as "YYYYMMDD". */
export function todayCompact(now: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;
}

/**
 * The index entries still to come: an entry whose feed starts today or earlier is hidden, since that network is (or is
 * about to be) the current one. Entries with no readable slug or start date are dropped, and so are agencies the
 * catalog doesn't show, when a catalog is given.
 */
export function upcomingEntries(index: unknown, today: string, catalogSlugs?: ReadonlySet<string>): UpcomingNetworkEntry[] {
  // Atlas Data writes { generatedAt, agencies: [...] }; a bare list reads the same.
  const wrapped = (index as { agencies?: unknown } | null)?.agencies;
  const list = Array.isArray(index) ? index : Array.isArray(wrapped) ? wrapped : [];
  const seen = new Set<string>();
  const entries: UpcomingNetworkEntry[] = [];
  for (const raw of list) {
    const entry = raw as Partial<UpcomingNetworkEntry> | null;
    const slug = typeof entry?.slug === 'string' ? entry.slug : '';
    const start = compactDate(entry?.feedStart);
    if (!slug || !/^[\w-]+$/.test(slug) || !start || start <= today || seen.has(slug)) continue;
    if (catalogSlugs && !catalogSlugs.has(slug)) continue;
    seen.add(slug);
    entries.push(entry as UpcomingNetworkEntry);
  }
  return entries;
}

export function upcomingIndexUrl(base: string): string {
  return `${base}/atlas/upcoming/index.json`;
}

export function upcomingRoutesUrl(base: string, slug: string): string {
  return `${base}/atlas/upcoming/${slug}.json`;
}

/**
 * The dataset a side actually shows: 'upcoming' only when asked for and at least one agency has an upcoming network.
 * A link naming 'upcoming' after the last entry started (or with the feature off) falls back to the current network.
 */
export function effectiveDataset(requested: CompareDataset | undefined, available: boolean): CompareDataset {
  return requested === 'upcoming' && available ? 'upcoming' : 'current';
}

/**
 * Map B's layers on the upcoming network: the agencies with an upcoming file swap their current routes for it, every
 * other agency keeps its current routes. Agencies whose upcoming file hasn't loaded keep their current routes too, so
 * the map never draws them blank while the file loads.
 */
export function layersWithUpcoming<L extends Record<string, GeoJSON.FeatureCollection>>(
  layers: L,
  upcoming: Readonly<Record<string, GeoJSON.FeatureCollection>>,
): L {
  const slugs = Object.keys(upcoming);
  if (slugs.length === 0) return layers;
  return { ...layers, ...upcoming };
}

/**
 * The tile filter clause that keeps the release tiles from drawing an agency shown from its upcoming file, so map B
 * never draws the current and upcoming lines on top of each other.
 */
export function excludeAgenciesClause(slugs: readonly string[]): unknown[] | null {
  if (slugs.length === 0) return null;
  return ['!', ['in', ['get', 'agencySlug'], ['literal', [...slugs]]]];
}
