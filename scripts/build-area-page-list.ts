/**
 * Writes what follows from which areas have a page (areaPageStatus: two or more agencies, Ryan 2026-11-01), so
 * nothing is a hand list:
 * - shared/data/area-page-slugs.json: the areas with a page, for the map's agency card link (small enough for the bundle);
 * - vercel.json `redirects`: each paged area with one agency sends /area/<slug> to that agency's page, permanently.
 *
 * build-agency-page-summaries runs this after writing the summaries. By hand, after editing config/areas:
 *
 *   npx tsx scripts/build-area-page-list.ts
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { agencyPagePath, areaPageStatus, type AgencyPageSummaries } from '../shared/agencyPages';
import { AREA_PATH_PREFIX } from '../shared/pagePaths';

export const AREA_PAGE_SLUGS = 'shared/data/area-page-slugs.json';
const VERCEL = 'vercel.json';

type Redirect = { source: string; destination: string; permanent: boolean };

/** The redirects for one-agency areas, with and without the trailing slash, as vercel.json holds them. */
export function areaRedirects(summaries: AgencyPageSummaries): Redirect[] {
  return [...areaPageStatus(summaries.agencies).redirects].flatMap(([area, agency]) => [
    { source: `${AREA_PATH_PREFIX}${area}`, destination: agencyPagePath(agency), permanent: true },
    { source: `${AREA_PATH_PREFIX}${area}/`, destination: agencyPagePath(agency), permanent: true },
  ]);
}

export function writeAreaPageList(summaries: AgencyPageSummaries): void {
  writeFileSync(AREA_PAGE_SLUGS, JSON.stringify([...areaPageStatus(summaries.agencies).pages].sort()) + '\n');
  const config = JSON.parse(readFileSync(VERCEL, 'utf8')) as Record<string, unknown> & { redirects?: Redirect[] };
  const other = (config.redirects ?? []).filter(r => !r.source.startsWith(AREA_PATH_PREFIX));
  const redirects = [...other, ...areaRedirects(summaries)];
  // `redirects` sits before `rewrites`, the order Vercel applies them in.
  const { headers, rewrites, redirects: _old, ...rest } = config;
  writeFileSync(VERCEL, JSON.stringify({ headers, ...(redirects.length ? { redirects } : {}), rewrites, ...rest }, null, 2) + '\n');
}

if (process.argv[1]?.endsWith('build-area-page-list.ts')) {
  const summaries = JSON.parse(readFileSync('shared/data/agency-pages.json', 'utf8')) as AgencyPageSummaries;
  writeAreaPageList(summaries);
  console.log(`Wrote ${AREA_PAGE_SLUGS} and the /area/ redirects in ${VERCEL}`);
}
