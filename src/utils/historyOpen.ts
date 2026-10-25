import { splitRouteKey } from './routeKey';

/**
 * Which agency the History tab opens on (#1012). History opens on the agency chooser unless the
 * user has shown which city they mean: an agency they selected, or the one History agency left in
 * view after they moved or zoomed the map. A fresh load, the default Toronto view, a restored or
 * shared view never count as a choice, so History never jumps to an agency nobody picked (9b0c3440).
 */
export function historyAgencyToOpen({
  selectedAgencySlug,
  viewportSlugs,
  historySlugs,
  userMovedMap,
}: {
  /** The agency the user selected on the map (only ever set by a user action). */
  selectedAgencySlug: string | null;
  /** Agencies in the map's current view. */
  viewportSlugs: readonly string[];
  /** Agencies with History; null when History is off. */
  historySlugs: ReadonlySet<string> | null;
  /** The user has panned or zoomed the map since the page loaded. */
  userMovedMap: boolean;
}): string | null {
  if (!historySlugs) return null;
  if (selectedAgencySlug && historySlugs.has(selectedAgencySlug)) return selectedAgencySlug;
  if (!userMovedMap) return null;
  const inView = [...new Set(viewportSlugs)].filter(slug => historySlugs.has(slug));
  return inView.length === 1 ? inView[0] : null;
}

/**
 * The History route a regular map link names (#1028 item 24): `route=agency::routeId` is the map's
 * route key; History lists routes by number, so the key is read through the agency's loaded map
 * routes. Null when the agency's routes don't include that route id.
 */
export function historyRouteFromRouteKey(
  key: string,
  features: readonly { properties?: { routeId?: unknown; routeShortName?: unknown } | null }[],
): { slug: string; routeShortName: string } | null {
  // A branch part after the route id doesn't change which History route it is.
  const { agencySlug: slug, routeId } = splitRouteKey(key);
  if (!slug || !routeId) return null;
  const match = features.find(f => String(f.properties?.routeId ?? '') === routeId && f.properties?.routeShortName != null);
  return match ? { slug, routeShortName: String(match.properties!.routeShortName) } : null;
}

/** Letters whose spoken name starts with a vowel sound ("ef", "aitch", "em"...). */
const VOWEL_SOUND_LETTERS = 'AEFHILMNORSX';

/**
 * "an" before a name that starts with a vowel sound, "a" otherwise. A name read letter by letter (all
 * capitals, and three letters or fewer or no vowel in its first two) goes by its first letter's name:
 * "an NFTA", "an MBTA", "a TTC". Any other name goes by its first letter: "a MARTA", "an IndyGo",
 * except a "you" or "yoo" sound ("a Unitrans", "a Utah").
 */
export function indefiniteArticle(name: string): 'a' | 'an' {
  const word = name.trim().split(/[\s-]/)[0] ?? '';
  if (!word) return 'a';
  const readAsLetters = /^[A-Z0-9]+$/.test(word) && /[A-Z]/.test(word) && (word.length <= 3 || !/[AEIOU]/.test(word.slice(0, 2)));
  if (readAsLetters) return VOWEL_SOUND_LETTERS.includes(word[0]) ? 'an' : 'a';
  if (/^(uni|eu|one\b|u[^aeiou][aeiou])/i.test(word)) return 'a';
  return /^[aeiou]/i.test(word) ? 'an' : 'a';
}

/**
 * The top search bar's hint while a History agency is open: it searches that agency's routes, so it
 * names the agency ("Find a MARTA route…", "Find an NFTA route…").
 */
export function historyRouteSearchPlaceholder(agencyName: string): string {
  return `Find ${indefiniteArticle(agencyName)} ${agencyName} route…`;
}

/**
 * The chooser's region sections with the agencies in view first: sections holding an in-view
 * agency move to the top (keeping their order), and in-view agencies lead their section.
 */
export function inViewFirst<T extends { slug: string }>(
  sections: ReadonlyArray<readonly [string, T[]]>,
  inView: ReadonlySet<string>,
): [string, T[]][] {
  if (inView.size === 0) return sections.map(([region, agencies]) => [region, agencies]);
  const ordered = sections.map(([region, agencies]): [string, T[]] => [
    region,
    [...agencies.filter(a => inView.has(a.slug)), ...agencies.filter(a => !inView.has(a.slug))],
  ]);
  const hasInView = ([, agencies]: [string, T[]]) => agencies.some(a => inView.has(a.slug));
  return [...ordered.filter(hasInView), ...ordered.filter(section => !hasInView(section))];
}
