/**
 * Which agencies Atlas Studio offers (CIV-1827 follow-up): those with a built Schedule Changes file,
 * tmp/studio/<slug>-before-after.json (scripts/compare-feed-dates.ts), read from the folder rather than typed by hand.
 * A newly built file appears in the agency menu with no code change. The Vite dev server lists the folder at
 * STUDIO_MANIFEST_DEV_URL (vite.config.ts); nothing here is uploaded or built into a deployment.
 */

/** The agency Studio opens on when the address names none (or one it has no file for). */
export const STUDIO_DEFAULT_AGENCY = 'kingston';

/** Where the Vite dev server lists the built Studio agencies: `{ agencies: string[] }`. */
export const STUDIO_MANIFEST_DEV_URL = '/dev-studio/index.json';

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
export function studioAgencyFrom(param: string | null, agencies: readonly string[] | null, preferred: string = STUDIO_DEFAULT_AGENCY): string {
  if (!agencies) return param || preferred;
  if (param && agencies.includes(param)) return param;
  return agencies.includes(preferred) ? preferred : agencies[0] ?? preferred;
}

/**
 * Studio's pages (CIV-1828), in the page menu's order; the first opens by default. Live is the first page (ROADMAP,
 * Ryan 2026-11-17); Fleet is a placeholder name (Ryan: "We can add Fleet as a placeholder perhaps") showing the
 * buses-needed and schedule work until the second page is decided.
 */
export const STUDIO_PAGES = ['live', 'fleet'] as const;
export type StudioPageKey = (typeof STUDIO_PAGES)[number];
/** The page an address asks for (?page=); Live otherwise. */
export const studioPageFrom = (param: string | null): StudioPageKey =>
  (STUDIO_PAGES as readonly string[]).includes(param ?? '') ? (param as StudioPageKey) : STUDIO_PAGES[0];
