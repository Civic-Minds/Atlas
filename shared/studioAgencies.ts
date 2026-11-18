/**
 * Which agencies Atlas Studio offers (CIV-1827 follow-up): those with a built Schedule Changes file,
 * tmp/studio/<slug>-before-after.json (scripts/compare-feed-dates.ts), read from the folder rather than typed by hand.
 * A newly built file appears in the agency menu with no code change. The Vite dev server lists the folder at
 * STUDIO_MANIFEST_DEV_URL (vite.config.ts); nothing here is uploaded or built into a deployment.
 */

import { STUDIO_DEFAULT_AGENCY } from './rules/focus.js';

/** The agency Studio opens on when the address names none (or one it has no file for): the focus list's demo agency. */
export { STUDIO_DEFAULT_AGENCY };

/** Where the Vite dev server lists the built Studio agencies: `{ agencies: string[] }`. */
export const STUDIO_MANIFEST_DEV_URL = '/dev-studio/index.json';

/** CIV-1871: where the dev server lists what each Studio file and Live coverage file says, for the coverage page: `{ studio, vehicles, coverage }`. */
export const STUDIO_COVERAGE_DEV_URL = '/dev-studio/coverage.json';

const BEFORE_AFTER = /^([\w-]+)-before-after\.json$/;

/**
 * The agencies with a Schedule Changes file among a folder's file names, in the menu's order: the default first, then
 * the rest by slug. A buses-needed file alone doesn't add an agency: the page needs its Schedule Changes file.
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
  if (!agencies) return param || STUDIO_DEFAULT_AGENCY;
  if (param && agencies.includes(param)) return param;
  return agencies.includes(STUDIO_DEFAULT_AGENCY) ? STUDIO_DEFAULT_AGENCY : agencies[0] ?? STUDIO_DEFAULT_AGENCY;
}
