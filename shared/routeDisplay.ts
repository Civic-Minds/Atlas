/**
 * How a route is written, on every surface: cards, list rows, search, Nearby, agency pages. One function, so the same route
 * reads the same way everywhere. It starts from the card title's cleaned names (`routeLabelParts`: arrows for "<>", first
 * and last terminus only, "via ..." stripped, leading zeros, brands) and adds the two list rules: a numeric id with a better
 * public name is hidden, and "Line 1 (Yonge-University)" splits into "Line 1" and "Yonge-University".
 * The card title, list rows, search, Nearby and agency pages all show this: bold `primary`, lighter `secondary`, or `text` on one line.
 * Returns plain strings; the caller applies title case (`routeLabels` in src/utils/format.ts does).
 */
import { joinRouteLabel, routeLabelParts } from './cleanHeadsign.js';
import { effectiveMode } from './modes.js';

export interface RouteDisplay {
  /** The bold part. */
  primary: string;
  /** The lighter part after it, when there is one. */
  secondary?: string;
  /** primary and secondary on one line ("Line 1 — Yonge-University"). */
  text: string;
}

/**
 * Hide a numeric internal id when the route has a useful public name. `mode` is the route's effective mode (shared/modes.ts:
 * the feed's route_type with the agency's listed corrections), the same value the agency pages use, so a route hides or shows
 * its number the same way on every surface. Rail, subway, ferry and the other non-bus modes hide it (their ids are internal:
 * "30053" for the Expo Line, "1" for "Line 1 (Yonge-University)"). A streetcar keeps its number (TTC 501 Queen), and so does a
 * bus ("108 Metro Local Line", "99 B-Line"); only a bus with a long internal id (5 or more digits) and a name ending in Line or
 * SeaBus loses it. With no mode known the bus rule applies.
 */
export function shouldHideNumericRouteShortName(
  shortName: string | null | undefined,
  longName: string | null | undefined,
  mode?: number,
): boolean {
  if (!shortName || !longName || !/^\d+$/.test(shortName.trim())) return false;
  const named = /(?:line|seabus)$/i.test(longName.trim());
  const internalId = shortName.trim().length >= 5;
  if (mode === 0) return false;
  if (mode === undefined || mode === 3 || mode === 11) return internalId && named;
  return true;
}

/**
 * "Line 1 (Yonge-University)" -> "Line 1" and "Yonge-University". Also "Route 4: Sheppard", "Ligne 5 - Bleue" and
 * "Line 5 Eglinton". A hyphen between two digits never splits ("Route 10-12" stays whole).
 */
export function splitDesignator(name: string): { designator: string; rest: string } | null {
  const t = name.trim();
  const m = t.match(/^((?:Line|Route|Ligne)\s+[A-Za-z0-9]{1,3})(?:\s*\(([^)]+)\)|\s*([-–—:])\s*(.+)|\s+(.+))$/i);
  if (!m) return null;
  if (m[2] != null) return { designator: m[1], rest: m[2].trim() };
  if (m[5] != null) return { designator: m[1], rest: m[5].trim() };
  // The separator sits right after the designator (or after spaces). A hyphen touching a digit on both sides is part of a number range.
  const sepIndex = t.indexOf(m[3], m[1].length);
  const before = t[sepIndex - 1], after = t[sepIndex + 1];
  if (m[3] === '-' && /\d/.test(before ?? '') && /\d/.test(after ?? '')) return null;
  return { designator: m[1], rest: m[4].trim() };
}

const DESIGNATOR_WORD = '(?:line|ligne|route|rte|rt|bus)\\.?\\s*';
const GENERIC_NAME = /^(?:route|routes|line|bus|shuttle|service|local)$/i;
const escapeRe = (x: string) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Never show the short name twice. A long name that starts with it as a designator ("1-North Lamar", "Rt 1 Blue - Walton Way",
 * "Line 5 Eglinton" on route 5) keeps only what follows; one that ends with it ("Green Line E" on route E) already is the name and
 * stands alone; and a remainder that says nothing ("Route", "Shuttle") is dropped, leaving the short name alone.
 */
export function withoutRepeatedShortName(primary: string, secondary: string | undefined): { primary: string; secondary?: string } {
  if (!secondary) return { primary };
  const short = escapeRe(primary.trim());
  if (new RegExp(`${DESIGNATOR_WORD}${short}$`, 'i').test(secondary.trim())) return { primary: secondary.trim() };
  // A one-letter code followed straight by a hyphen is part of the name ("G-Line"), not a separator.
  const sep = /^[A-Za-z]$/.test(primary.trim()) ? '(?:\\s+[-–—:./]?\\s*|[:./]\\s*)' : '\\s*[-–—:./]?\\s*';
  const prefix = secondary.trim().match(new RegExp(`^(?:${DESIGNATOR_WORD})?${short}(?![\\p{L}\\p{N}])${sep}(.*)$`, 'iu'));
  const rest = prefix ? prefix[1].trim() : secondary.trim();
  if (!rest || rest.toLowerCase() === primary.trim().toLowerCase() || GENERIC_NAME.test(rest)) return { primary };
  return { primary, secondary: rest };
}

export function routeDisplay(input: {
  shortName: string | null | undefined;
  longName: string | null | undefined;
  /** The feed's raw route_type. With `agencySlug` it gives the effective mode (the same one the agency pages use). */
  routeType?: number | string | null;
  /** An effective mode already worked out (agency pages store it). Wins over routeType. */
  mode?: number;
  agencySlug?: string;
  agencyName?: string | null;
}): RouteDisplay {
  const { shortName, longName, agencyName } = input;
  const mode = input.mode ?? (input.routeType == null || input.routeType === '' ? undefined
    : effectiveMode({ routeType: input.routeType, routeShortName: shortName, routeLongName: longName, agencySlug: input.agencySlug }));
  const blankShort = !shortName || !shortName.trim();
  // "1" with "Line 1 (Yonge-University)": the long name already names the line, so the number is not shown twice (any mode).
  const lineNamedByLongName = !!longName && !!shortName && /^\d+$/.test(shortName.trim()) && (() => {
    const d = splitDesignator(longName);
    return !!d && /^(?:Line|Ligne)\s+/i.test(d.designator) && d.designator.replace(/^\S+\s+/, '').toLowerCase() === shortName.trim().replace(/^0+(?=\d)/, '').toLowerCase();
  })();
  if (longName && (blankShort || lineNamedByLongName || shouldHideNumericRouteShortName(shortName, longName, mode))) {
    const cleaned = routeLabelParts(null, longName, agencyName).primary.replace(/\s+via\s+.+$/i, '').trim();
    const d = splitDesignator(cleaned);
    const primary = d ? d.designator : cleaned;
    return { primary, secondary: d?.rest, text: d ? `${d.designator} — ${d.rest}` : cleaned };
  }
  const parts = routeLabelParts(shortName, longName, agencyName);
  // A letter code the card title leaves out ("MI" for Milton) stays as the bold part of a list row.
  if (parts.shortCode) {
    const t = withoutRepeatedShortName(parts.shortCode, parts.primary);
    return { ...t, text: joinRouteLabel(t) };
  }
  // "10 Bathurst" on route "10": the old card title was just "10"; every surface now shows the name too.
  const t = withoutRepeatedShortName(parts.primary, parts.secondary ?? parts.afterShortName);
  return { ...t, text: joinRouteLabel(t) };
}
