/**
 * agencyIndex.ts — derive a small public agency directory from index.json,
 * for export as atlas/agencies.json.
 *
 * index.json itself is the pipeline's source of truth and carries fields
 * external consumers have no business seeing (feedUrl, mdbFeedUrl, override
 * notes, etc.). This is the read-only subset: enough for a consumer to
 * discover an agency's slug and derive its own artifact URLs from it,
 * without hardcoding a per-agency slug map (see Civic-Minds/Transit-Stats#152).
 */

export interface AgencyIndexSourceEntry {
  slug: string;
  name: string;
  center?: [number, number];
  region?: string;
  bbox?: [number, number, number, number];
  staged?: boolean;
  hiddenInProduction?: boolean;
}

export interface AgencyIndexEntry {
  slug: string;
  name: string;
  region: string | null;
  center: [number, number] | null;
  bbox: [number, number, number, number] | null;
}

export interface AgencyIndexFile {
  generatedAt: string;
  agencyCount: number;
  agencies: AgencyIndexEntry[];
}

/**
 * Pure: build the public agency directory. Staged agencies (not yet live —
 * see the `staged` flag cleared on first successful refresh) are excluded,
 * as are agencies explicitly hidden from production (e.g. Mexico coverage
 * pending validation, #222) — matching what the map itself shows.
 */
export function buildAgencyIndex(source: AgencyIndexSourceEntry[]): AgencyIndexFile {
  const agencies = source
    .filter(a => !a.staged && !a.hiddenInProduction)
    .map(a => ({
      slug: a.slug,
      name: a.name,
      region: a.region ?? null,
      center: a.center ?? null,
      bbox: a.bbox ?? null,
    }))
    .sort((a, b) => a.slug.localeCompare(b.slug));

  return {
    generatedAt: new Date().toISOString(),
    agencyCount: agencies.length,
    agencies,
  };
}
