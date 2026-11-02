/**
 * Writes what follows from which areas have a page (areaPageStatus: two or more agencies, Ryan 2026-11-01), so
 * nothing is a hand list:
 * - shared/data/area-page-slugs.json: the areas with a page, for the map's agency card link (small enough for the bundle);
 * - vercel.json `redirects`: each paged area with one agency sends /area/<slug> to that agency's page, permanently;
 *   and each agency's `formerSlugs` (config/agencies/<slug>.json) send /agency/<old> to its page, permanently;
 * - shared/data/former-slugs.json: {oldSlug: {slug, idPrefix?}}, so map links that name an old slug (and its route ids,
 *   now prefixed when that feed became a supplemental with supplementalIdPrefixes) open the agency's same route.
 *
 * build-agency-page-summaries runs this after writing the summaries. By hand, after editing config/areas:
 *
 *   npx tsx scripts/build-area-page-list.ts
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { agencyPagePath, areaPageStatus, type AgencyPageSummaries } from '../shared/agencyPages';
import { AGENCY_PATH_PREFIX, AREA_PATH_PREFIX } from '../shared/pagePaths';

export const AREA_PAGE_SLUGS = 'shared/data/area-page-slugs.json';
export const FORMER_SLUGS = 'shared/data/former-slugs.json';
const AGENCY_CONFIG_DIR = 'config/agencies';
const VERCEL = 'vercel.json';

type Redirect = { source: string; destination: string; permanent: boolean };

/** The redirects for one-agency areas, with and without the trailing slash, as vercel.json holds them. */
export function areaRedirects(summaries: AgencyPageSummaries): Redirect[] {
  return [...areaPageStatus(summaries.agencies).redirects].flatMap(([area, agency]) => [
    { source: `${AREA_PATH_PREFIX}${area}`, destination: agencyPagePath(agency), permanent: true },
    { source: `${AREA_PATH_PREFIX}${area}/`, destination: agencyPagePath(agency), permanent: true },
  ]);
}

/** Where an old agency slug now lives: the agency, and the prefix its route ids now carry (NJ Transit rail: "rail:"). */
export interface FormerSlug { slug: string; idPrefix?: string }

/**
 * {oldSlug: {slug, idPrefix?}} from every agency config's `formerSlugs` (a slug, or {slug, idPrefix}): an agency
 * renamed, or several merged into one (NJ Transit: njt-bus and njt-rail are now njt). An old slug that is still an
 * agency, or that two agencies claim, fails.
 */
export function readFormerSlugs(dir = AGENCY_CONFIG_DIR): Record<string, FormerSlug> {
  const configs = readdirSync(dir).filter(f => f.endsWith('.json') && f !== 'order.json')
    .map(f => JSON.parse(readFileSync(`${dir}/${f}`, 'utf8')) as { slug?: string; formerSlugs?: Array<string | { slug: string; idPrefix?: string }> })
    .filter(c => typeof c.slug === 'string');
  const slugs = new Set(configs.map(c => c.slug!));
  const out: Record<string, FormerSlug> = {};
  for (const c of configs) {
    for (const entry of c.formerSlugs ?? []) {
      const old = typeof entry === 'string' ? entry : entry.slug;
      if (slugs.has(old)) throw new Error(`formerSlugs: ${old} (on ${c.slug}) is still an agency`);
      if (out[old]) throw new Error(`formerSlugs: ${old} is claimed by ${out[old].slug} and ${c.slug}`);
      out[old] = { slug: c.slug!, ...(typeof entry !== 'string' && entry.idPrefix ? { idPrefix: entry.idPrefix } : {}) };
    }
  }
  return Object.fromEntries(Object.entries(out).sort(([a], [b]) => a.localeCompare(b)));
}

/** The redirects for former agency slugs, with and without the trailing slash. */
export function agencyRedirects(formerSlugs: Record<string, FormerSlug>): Redirect[] {
  return Object.entries(formerSlugs).flatMap(([old, { slug }]) => [
    { source: `${AGENCY_PATH_PREFIX}${old}`, destination: agencyPagePath(slug), permanent: true },
    { source: `${AGENCY_PATH_PREFIX}${old}/`, destination: agencyPagePath(slug), permanent: true },
  ]);
}

export function writeAreaPageList(summaries: AgencyPageSummaries, formerSlugs: Record<string, FormerSlug> = readFormerSlugs()): void {
  writeFileSync(AREA_PAGE_SLUGS, JSON.stringify([...areaPageStatus(summaries.agencies).pages].sort()) + '\n');
  writeFileSync(FORMER_SLUGS, JSON.stringify(formerSlugs, null, 2) + '\n');
  const config = JSON.parse(readFileSync(VERCEL, 'utf8')) as Record<string, unknown> & { redirects?: Redirect[] };
  const other = (config.redirects ?? []).filter(r => !r.source.startsWith(AREA_PATH_PREFIX) && !r.source.startsWith(AGENCY_PATH_PREFIX));
  const redirects = [...other, ...areaRedirects(summaries), ...agencyRedirects(formerSlugs)];
  // `redirects` sits before `rewrites`, the order Vercel applies them in.
  const { headers, rewrites, redirects: _old, ...rest } = config;
  writeFileSync(VERCEL, JSON.stringify({ headers, ...(redirects.length ? { redirects } : {}), rewrites, ...rest }, null, 2) + '\n');
}

if (process.argv[1]?.endsWith('build-area-page-list.ts')) {
  const summaries = JSON.parse(readFileSync('shared/data/agency-pages.json', 'utf8')) as AgencyPageSummaries;
  writeAreaPageList(summaries);
  console.log(`Wrote ${AREA_PAGE_SLUGS}, ${FORMER_SLUGS} and the /area/ and /agency/ redirects in ${VERCEL}`);
}
