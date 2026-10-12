/**
 * Share-URL encoding for the agency selection and the transit-mode filter (CIV-72).
 *
 * Agencies: with ~500 agencies the URL has to stay short, so:
 *   - everything on (the default)          -> nothing in the URL
 *   - a few on                             -> ?agencies=a.b.c   (include list)
 *   - most on, a few hidden                -> ?hide=x.y         (exclude list)
 *   - whichever of the two is shorter wins; if even that is over AGENCY_URL_MAX_SLUGS
 *     slugs, the selection is left out of the URL entirely.
 * Slugs are [a-z0-9-], so `.` is used as the separator: URLSearchParams leaves it
 * unencoded (a `,` would become `%2C`). Commas are still accepted when reading.
 *
 * A URL rule is kept as a rule (include/exclude), not resolved to a set at mount, because
 * the agency catalog loads after the map mounts. Unknown or removed slugs simply never
 * match, so they are ignored.
 */
import { FEATURES } from '../../shared/config';
import { FILTER_MODES, ON_DEMAND_MODE } from '../../shared/modes';

export const AGENCY_URL_MAX_SLUGS = 60;
export const AGENCIES_PARAM = 'agencies';
export const HIDE_AGENCIES_PARAM = 'hide';
export const MODES_PARAM = 'm';
const SEP = '.';

/** Modes offered in the filter UI. On-demand is internal-only. */
export const AVAILABLE_FILTER_MODES: ReadonlyArray<{ id: number; label: string }> = FEATURES.onDemand
  ? [...FILTER_MODES, { id: ON_DEMAND_MODE, label: 'On-demand' }]
  : FILTER_MODES;

export type AgencyUrlRule =
  | { kind: 'include'; slugs: ReadonlySet<string> }
  | { kind: 'exclude'; slugs: ReadonlySet<string> };

function splitList(raw: string): string[] {
  return raw.split(/[.,]/).map(s => s.trim().toLowerCase()).filter(Boolean);
}

function toSearchParams(search: string | URLSearchParams): URLSearchParams {
  return typeof search === 'string' ? new URLSearchParams(search.startsWith('?') ? search.slice(1) : search) : search;
}

/** Read the agency rule from a query string. `agencies` wins if both params are present. */
export function parseAgencyUrlRule(search: string | URLSearchParams): AgencyUrlRule | null {
  const sp = toSearchParams(search);
  const include = sp.get(AGENCIES_PARAM);
  if (include != null) {
    const slugs = splitList(include);
    if (slugs.length > 0) return { kind: 'include', slugs: new Set(slugs) };
  }
  const exclude = sp.get(HIDE_AGENCIES_PARAM);
  if (exclude != null) {
    const slugs = splitList(exclude);
    if (slugs.length > 0) return { kind: 'exclude', slugs: new Set(slugs) };
  }
  return null;
}

/**
 * Whether an agency starts off. A URL rule, when present, overrides the stored off-list.
 */
export function isAgencyOff(slug: string, rule: AgencyUrlRule | null, savedOff: ReadonlySet<string>): boolean {
  if (!rule) return savedOff.has(slug);
  return rule.kind === 'include' ? !rule.slugs.has(slug) : rule.slugs.has(slug);
}

/**
 * Once the catalog is known, drop an include rule that matches no real agency (every slug
 * unknown or removed) so the link falls back to the viewer's own selection instead of an
 * empty map. An exclude rule with unknown slugs is harmless and kept.
 */
export function settleAgencyUrlRule(rule: AgencyUrlRule | null, catalogSlugs: readonly string[]): AgencyUrlRule | null {
  if (!rule || rule.kind === 'exclude') return rule;
  return catalogSlugs.some(s => rule.slugs.has(s)) ? rule : null;
}

/**
 * The stored selection is only rewritten when no URL rule is in effect, or the viewer has
 * changed the selection themselves. Opening a shared link must not replace their own prefs.
 */
export function shouldPersistAgencySelection(rule: AgencyUrlRule | null, userChanged: boolean): boolean {
  return !rule || userChanged;
}

/** URL params for the current selection. Both null = leave it out of the URL. */
export function encodeAgencySelection(
  selected: ReadonlySet<string>,
  catalogSlugs: readonly string[],
): { agencies: string | null; hide: string | null } {
  const none = { agencies: null, hide: null };
  if (catalogSlugs.length === 0) return none;
  const on: string[] = [];
  const off: string[] = [];
  for (const slug of catalogSlugs) (selected.has(slug) ? on : off).push(slug);
  if (off.length === 0) return none;
  // Nothing on is not a view worth sharing (and can't be written as an include list).
  if (on.length === 0) return none;
  on.sort();
  off.sort();
  const includeStr = on.join(SEP);
  const excludeStr = off.join(SEP);
  const useInclude = includeStr.length <= excludeStr.length;
  const count = useInclude ? on.length : off.length;
  if (count > AGENCY_URL_MAX_SLUGS) return none;
  return useInclude ? { agencies: includeStr, hide: null } : { agencies: null, hide: excludeStr };
}

/** Mode filter from the URL. Unknown ids are dropped; empty means no restriction. */
export function parseModesParam(
  search: string | URLSearchParams,
  allowed: ReadonlyArray<{ id: number }> = AVAILABLE_FILTER_MODES,
): Set<number> {
  const raw = toSearchParams(search).get(MODES_PARAM);
  if (!raw) return new Set();
  const ok = new Set(allowed.map(m => m.id));
  const out = new Set<number>();
  for (const part of raw.split(/[.,]/)) {
    if (!/^-?\d+$/.test(part.trim())) continue;
    const id = Number(part);
    if (ok.has(id)) out.add(id);
  }
  return out;
}

export function encodeModesParam(modes: ReadonlySet<number>): string | null {
  if (modes.size === 0) return null;
  return [...modes].sort((a, b) => a - b).join(SEP);
}
