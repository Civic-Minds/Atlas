/**
 * Which agencies Atlas Studio offers (CIV-1827 follow-up): those with a built Schedules file,
 * tmp/studio/<slug>-before-after.json (scripts/compare-feed-dates.ts), read from the folder rather than typed by hand.
 * A newly built file appears in the agency menu with no code change. The Vite dev server lists the folder at
 * STUDIO_MANIFEST_DEV_URL (vite.config.ts); nothing here is uploaded or built into a deployment.
 */

import { STUDIO_DEFAULT_AGENCY } from './rules/focus.js';
import { STUDIO_PATH } from './rules/paths.js';

/** The agency Studio opens on when the address names none (or one it has no file for): the focus list's demo agency. */
export { STUDIO_DEFAULT_AGENCY };

/** Where the Vite dev server lists the built Studio agencies: `{ agencies: string[] }`. */
export const STUDIO_MANIFEST_DEV_URL = '/dev-studio/index.json';

/** CIV-1871: where the dev server lists what each Studio file and Live coverage file says, for the coverage page: `{ studio, vehicles, coverage }`. */
export const STUDIO_COVERAGE_DEV_URL = '/dev-studio/coverage.json';

const BEFORE_AFTER = /^([\w-]+)-before-after\.json$/;

/**
 * The agencies with a Schedules file among a folder's file names, in the menu's order: the default first, then
 * the rest by slug. A buses-needed file alone doesn't add an agency: the page needs its Schedules file.
 */
export function studioAgenciesFromFiles(fileNames: readonly string[]): string[] {
  const slugs = fileNames.map(f => BEFORE_AFTER.exec(f)?.[1]).filter((s): s is string => !!s);
  return [...new Set(slugs)].sort((a, b) => (a === STUDIO_DEFAULT_AGENCY ? -1 : b === STUDIO_DEFAULT_AGENCY ? 1 : a.localeCompare(b)));
}

/**
 * The agency an address asks for (?agency=, the one source of truth). With the list loaded: the asked-for agency when
 * Studio has it, else the default when it has that, else the first. Before the list loads, the address as written.
 */
export function studioAgencyFrom(param: string | null, agencies: readonly string[] | null): string {
  // One default for every page (CIV-1898): STUDIO_DEFAULT_AGENCY where the page has it, else the page's first agency.
  if (!agencies) return param || STUDIO_DEFAULT_AGENCY;
  if (param && agencies.includes(param)) return param;
  return agencies.includes(STUDIO_DEFAULT_AGENCY) ? STUDIO_DEFAULT_AGENCY : agencies[0] ?? STUDIO_DEFAULT_AGENCY;
}

/** What a page's agency file gives: its list, an empty one when the file is missing, null while it loads (one reading for every page). */
export const studioAgencyListFrom = (file: { agencies: readonly string[] } | 'missing' | null | undefined): readonly string[] | null =>
  file && file !== 'missing' ? file.agencies : file === 'missing' ? [] : null;

/**
 * Studio's pages (CIV-1828), in the page menu's order; the first opens by default. Live is the first page (ROADMAP,
 * Ryan 2026-11-17); Fleet is a placeholder name (Ryan: "We can add Fleet as a placeholder perhaps") showing the
 * agency's buses needed; Schedules is its own page (Ryan, 2026-11-19, CIV-1922: "I said to make a page called Schedules"; its old /studio/changes addresses redirect).
 */
export const STUDIO_PAGES = ['live', 'fleet', 'schedules'] as const;
export type StudioPageKey = (typeof STUDIO_PAGES)[number];
/** The page an address asks for; Live otherwise. */
export const studioPageFrom = (param: string | null): StudioPageKey =>
  (STUDIO_PAGES as readonly string[]).includes(param ?? '') ? (param as StudioPageKey) : STUDIO_PAGES[0];

/**
 * The page to open (CIV-1828; Ryan: "I opened …/studio?agency=rtd-denver and it is showing me the city of toronto"). A
 * named page wins. With an agency and no page, the first page that has that agency, so the agency is never swapped
 * silently; an agency no page has opens the default page. Null while a list it needs is still loading.
 */
export function studioPageFor(pageParam: string | null, agencyParam: string | null, lists: Record<StudioPageKey, readonly string[] | null>): StudioPageKey | null {
  if (pageParam && (STUDIO_PAGES as readonly string[]).includes(pageParam)) return pageParam as StudioPageKey;
  if (!agencyParam) return STUDIO_PAGES[0];
  for (const k of STUDIO_PAGES) {
    const list = lists[k];
    if (!list) return null;
    if (list.includes(agencyParam)) return k;
  }
  return STUDIO_PAGES[0];
}

/**
 * Where Studio is, read from its address (CIV-1924, the Studio frame): `/studio` (no panel), `/studio/live/<agency>/<route>`
 * and `/studio/fleet/<agency>/<route>`, the agency and route each optional. Null for any other address, including Studio's
 * other pages (coverage) and unknown ones, which stay not-found.
 */
export interface StudioLocation { page: StudioPageKey | null; agency: string | null; route: string | null }

export function parseStudioPath(pathname: string): StudioLocation | null {
  const path = pathname.replace(/\/+$/, '');
  if (path === STUDIO_PATH) return { page: null, agency: null, route: null };
  if (!path.startsWith(`${STUDIO_PATH}/`)) return null;
  const parts = path.slice(STUDIO_PATH.length + 1).split('/');
  if (parts.length > 3 || parts.some(p => !p) || !(STUDIO_PAGES as readonly string[]).includes(parts[0])) return null;
  const decode = (s: string | undefined) => {
    if (!s) return null;
    try { return decodeURIComponent(s); } catch { return s; }
  };
  return { page: parts[0] as StudioPageKey, agency: decode(parts[1]), route: decode(parts[2]) };
}

/** The address for a place in Studio; a route without an agency is dropped, as the address has no place for it. */
export function studioPath({ page, agency, route }: StudioLocation): string {
  if (!page) return STUDIO_PATH;
  const seg = [page, agency, agency ? route : null].filter((s): s is string => !!s).map(encodeURIComponent);
  return `${STUDIO_PATH}/${seg.join('/')}`;
}

/** The query keys Studio's addresses used before they became paths (CIV-1924). */
export const STUDIO_LEGACY_PARAMS = ['page', 'agency', 'route', 'panel'] as const;

/**
 * An old query address (`/studio?page=live&agency=ttc&route=504`, `?panel=closed`) as its path, or null when the address
 * has none of those keys. With no page named, the page is left for Studio to pick (studioPageFor), so the agency is kept.
 */
export function studioLegacyLocation(search: string): StudioLocation | null {
  const q = new URLSearchParams(search);
  if (!STUDIO_LEGACY_PARAMS.some(k => q.has(k))) return null;
  const named = q.get('page');
  const page = q.get('panel') === 'closed' ? null : named === 'changes' ? 'schedules' : named && (STUDIO_PAGES as readonly string[]).includes(named) ? named as StudioPageKey : null;
  return { page, agency: q.get('agency'), route: page ? q.get('route') : null };
}
