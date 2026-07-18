/**
 * incrementalPmtilesSafety.ts — pure safety-check logic for
 * build-pmtiles-incremental.ts.
 *
 * Deliberately free of any fs/network/tippecanoe calls so it can be unit
 * tested cheaply (see pipeline/__tests__/incrementalPmtilesSafety.test.ts).
 * The incremental build script imports these and supplies the actual data
 * (deployed-PMTiles slug scan, index.json contents).
 *
 * Two checks, both "refuse when in doubt":
 *
 * 1. Already-present detection — incremental tile-join can only ADD a
 *    brand-new agency. Replacing an existing agency's tiles would duplicate
 *    features (old + new versions both present) since incremental tile-join
 *    never removes anything; that's a genuinely harder problem and is out of
 *    scope here (see assertAgencyNotAlreadyPublished).
 *
 * 2. Bbox overlap detection — the stops layer is built with tippecanoe
 *    --drop-densest-as-needed, which makes density-based feature-dropping
 *    decisions relative to everything else sharing a tile. Tile-joining in a
 *    new agency whose stops share tiles with an existing agency's stops would
 *    leave that shared area with dropped-stop decisions made independently
 *    per input, not jointly — different (and wrong) from what a full rebuild
 *    would produce. This only checks bbox rectangles, not real geometry, and
 *    is deliberately conservative (see assertNoBboxOverlap).
 */

/** [south, west, north, east] */
export type Bbox = [number, number, number, number];

export interface AgencyBboxSource {
  slug: string;
  center: [number, number]; // [lat, lon]
  bbox?: Bbox;
}

/**
 * Derive an agency's bbox: its explicit config bbox if present, otherwise a
 * fallback rectangle padded around its center. Callers should pass the same
 * padding as the rest of the app's "no explicit bbox" fallback (shared/config.ts
 * AGENCY_BBOX_PAD) — this is the same fallback verify-pmtiles-coverage.ts
 * samples against, so an agency without an explicit bbox is treated
 * consistently everywhere.
 */
export function deriveAgencyBbox(agency: AgencyBboxSource, pad: { lat: number; lon: number }): Bbox {
  if (agency.bbox) return agency.bbox;
  const [lat, lon] = agency.center;
  return [lat - pad.lat, lon - pad.lon, lat + pad.lat, lon + pad.lon];
}

/** Simple axis-aligned rectangle overlap test on [south, west, north, east] boxes. */
export function bboxesOverlap(a: Bbox, b: Bbox): boolean {
  const [aS, aW, aN, aE] = a;
  const [bS, bW, bN, bE] = b;
  const disjoint = aN < bS || aS > bN || aE < bW || aW > bE;
  return !disjoint;
}

export interface BboxOverlap {
  slug: string;
  bbox: Bbox;
}

/**
 * Every other agency whose (derived) bbox overlaps the target agency's
 * (derived) bbox. Empty result means it's safe to tile-join the target in
 * without touching any other agency's stops density decisions.
 */
export function findBboxOverlaps(
  targetSlug: string,
  agencies: AgencyBboxSource[],
  pad: { lat: number; lon: number },
): BboxOverlap[] {
  const target = agencies.find(a => a.slug === targetSlug);
  if (!target) {
    throw new Error(`Agency "${targetSlug}" not found in the supplied agency list.`);
  }
  const targetBbox = deriveAgencyBbox(target, pad);
  return agencies
    .filter(a => a.slug !== targetSlug)
    .map(a => ({ slug: a.slug, bbox: deriveAgencyBbox(a, pad) }))
    .filter(a => bboxesOverlap(targetBbox, a.bbox));
}

export class AgencyAlreadyPublishedError extends Error {
  constructor(slug: string) {
    super(
      `Agency "${slug}" already has route features in the deployed atlas.pmtiles. ` +
      `Incremental build only supports ADDING a brand-new agency, not replacing an ` +
      `existing one's tiles — that would duplicate features (old + new both present), ` +
      `since incremental tile-join never removes anything. Removing the old version ` +
      `first is a harder problem and is out of scope for this script. ` +
      `Use \`npm run build-pmtiles\` (the full rebuild) instead.`,
    );
    this.name = 'AgencyAlreadyPublishedError';
  }
}

/** Throws AgencyAlreadyPublishedError if `slug` is already present in the deployed PMTiles. */
export function assertAgencyNotAlreadyPublished(slug: string, foundSlugs: ReadonlySet<string>): void {
  if (foundSlugs.has(slug)) {
    throw new AgencyAlreadyPublishedError(slug);
  }
}

export class AgencyBboxOverlapError extends Error {
  constructor(slug: string, overlaps: BboxOverlap[]) {
    const names = overlaps.map(o => o.slug).join(', ');
    super(
      `Agency "${slug}"'s bbox overlaps ${overlaps.length} other agenc${overlaps.length === 1 ? 'y' : 'ies'} ` +
      `(${names}). The stops layer is built with tippecanoe --drop-densest-as-needed, which makes ` +
      `density-based feature-dropping decisions relative to everything sharing a tile — incrementally ` +
      `tile-joining a new agency whose stops share tiles with an existing agency's stops would produce ` +
      `wrong/inconsistent density decisions for that shared area instead of what a full rebuild would ` +
      `produce. Use \`npm run build-pmtiles\` (the full rebuild, which retippecanoes everything together) instead.`,
    );
    this.name = 'AgencyBboxOverlapError';
  }
}

/** Throws AgencyBboxOverlapError if the target agency's bbox overlaps any other agency's bbox. */
export function assertNoBboxOverlap(
  targetSlug: string,
  agencies: AgencyBboxSource[],
  pad: { lat: number; lon: number },
): void {
  const overlaps = findBboxOverlaps(targetSlug, agencies, pad);
  if (overlaps.length > 0) {
    throw new AgencyBboxOverlapError(targetSlug, overlaps);
  }
}
