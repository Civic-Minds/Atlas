/**
 * How a route is written, on every surface: cards, list rows, search, Nearby, agency pages. One function, so the same route
 * reads the same way everywhere. It starts from the card title's cleaned names (`routeLabelParts`: arrows for "<>", first
 * and last terminus only, "via ..." stripped, leading zeros, brands) and adds the two list rules: a numeric id with a better
 * public name is hidden, and "Line 1 (Yonge-University)" splits into "Line 1" and "Yonge-University".
 * The card title, list rows, search, Nearby and agency pages all show this: bold `primary`, lighter `secondary`, or `text` on one line.
 * Returns plain strings; the caller applies title case (`routeLabels` in src/utils/format.ts does).
 */
import { effectiveMode } from './modes.js';

// The card title's naming rules (moved here from cleanHeadsign.ts, CIV-984 #3), so every route-name rule lives in this file.

/**
 * For REM, turn cryptic "A3-A1" + long name into something readable.
 * Example: "A3-A1 Anse-à-l'Orme – Brossard"
 */
export function formatRemDisplay(shortName: string | null | undefined, longName: string | null | undefined): string {
  if (!shortName) return '';
  if (!/^A[0-9]/.test(shortName) || !longName) return shortName;

  // longName e.g. "A3 - Anse-à-l'Orme / A1 - Brossard"
  const parts = longName.split(/\s*\/\s*/);
  if (parts.length === 2) {
    const t1 = parts[0].replace(/^A[0-9]\s*-\s*/, '').trim();
    const t2 = parts[1].replace(/^A[0-9]\s*-\s*/, '').trim();
    return `${shortName} — ${t1} / ${t2}`;
  }
  // fallback
  const cleaned = longName.replace(/A[0-9]\s*-\s*/g, '').replace(/\s*\/\s*/g, ' / ');
  return `${shortName} — ${cleaned}`;
}

/** A route's label as a bold primary part and an optional lighter secondary part ("495" and "4FUN"; "Line 1" and "Yonge-University"). */
export interface RouteLabelParts {
  primary: string;
  secondary?: string;
  /**
   * Set when the long name starts with the short name ("10 Bathurst" on route "10"). The card title drops the long name then,
   * but a list row can still show what follows the number, so it is kept here.
   */
  afterShortName?: string;
  /** Set when the short name is a code that the card title leaves out ("MI" for Milton). A list row can keep it as the bold part. */
  shortCode?: string;
}

/** The text a card title shows for parts: primary, then " — " and the secondary part when there is one. */
export const joinRouteLabel = (parts: RouteLabelParts) => (parts.secondary ? `${parts.primary} — ${parts.secondary}` : parts.primary);

/**
 * Splits a route into the pieces its card title is made of. `getRouteLabel` is these pieces joined, so every surface that
 * shows a route (cards, lists, search, Nearby, agency pages) starts from the same cleaned names.
 */
export function routeLabelParts(shortName: string | null | undefined, longName: string | null | undefined, agencyName?: string | null): RouteLabelParts {
  // Some French feeds (e.g. Divia/Dijon) encode bidirectional termini in route_long_name
  // as literal "<>" ("Longvic <> Toison D'or") — render as a proper arrow, not raw brackets.
  if (longName) longName = longName.replace(/\s*<>\s*/g, ' ↔ ');

  // A route with 3+ termini (2+ arrows) reliably overflows the card title's 2-line clamp
  // and gets cut off mid-word (STAR Rennes 12: "...↔ Saint-Grégoire ↔ Rennes (La..."). Keep
  // just the first and last terminus — the through-route endpoints — and drop the middle
  // via-point(s) from the title; the full stop-by-stop path is still on the map itself.
  if (longName && longName.split(' ↔ ').length > 2) {
    const parts = longName.split(' ↔ ');
    longName = `${parts[0]} ↔ ${parts[parts.length - 1]}`;
  }

  // SMART Train (Sonoma-Marin): long name is just "Main Line", combine with agency name
  if (agencyName && /smart/i.test(agencyName) && longName && /Main Line/i.test(longName)) {
    return { primary: 'SMART Train' };
  }

  if (!shortName) return { primary: longName || '' };

  // Clean leading zeros from shortName
  const cleanShort = shortName.length > 1 && shortName.startsWith('0') && /^\d+$/.test(shortName)
    ? shortName.replace(/^0+/, '')
    : shortName;

  const rem = formatRemDisplay(cleanShort, longName);
  if (rem && rem !== cleanShort) {
    const at = rem.indexOf(' — ');
    return at < 0 ? { primary: rem } : { primary: rem.slice(0, at), secondary: rem.slice(at + 3) };
  }

  if (!longName) return { primary: cleanShort };

  // Branded corridor list: "4FUN: Shakopee-Savage-Burnsville-MOA-MSP" → "495 — 4FUN"
  const brandPrefix = longName.match(/^([A-Za-z0-9]+):\s*.+$/);
  if (brandPrefix && brandPrefix[1].toUpperCase() === brandPrefix[1] && brandPrefix[1].length <= 8) {
    return { primary: cleanShort, secondary: brandPrefix[1] };
  }

  // HRT 757X etc.: public brand in long_name; short_name is internal (967).
  const brand = longName.match(/^(\d{3}X)\b/i);
  if (brand && /^\d+$/.test(cleanShort)) {
    // The words after the brand ("757X - Norfolk to NNTC") tell the routes apart in a list.
    const rest = longName.replace(/^\d{3}X\b\s*[-–—:]?\s*/i, '').trim();
    return { primary: brand[1].toUpperCase(), ...(rest ? { afterShortName: rest } : {}) };
  }

  let cleanedLong = longName;

  // STM metro: "Ligne 5 - Bleue" → "Bleue"
  if ((agencyName && /stm/i.test(agencyName)) || /^Ligne\s+\d/i.test(longName)) {
    cleanedLong = longName.replace(/^Ligne\s+\d+\s*-\s*/i, '').trim();
  }

  // Strip trailing " Via [location]" routing qualifiers — not part of the route name.
  // "Royal Oak Exch / Downtown Via Royal Oak" → "Royal Oak Exch / Downtown"
  cleanedLong = cleanedLong.replace(/\s+via\s+.+$/i, '').trim();

  // Suppress longName if it basically repeats the shortName or says "Route X"
  const lowerLong = cleanedLong.toLowerCase();
  const lowerShort = cleanShort.toLowerCase();
  // Normalize dashes so "G Line" matches "G-Line Rapid Ride"
  const normLong = lowerLong.replace(/-/g, ' ').replace(/\s+/g, ' ').trim();
  const normShort = lowerShort.replace(/-/g, ' ').replace(/\s+/g, ' ').trim();
  if (lowerLong === `route ${lowerShort}` || lowerLong === lowerShort || normLong.startsWith(normShort + ' ') || lowerLong.includes(lowerShort + ' ')) {
    // "10 Bathurst" on route "10": the title is just the number, but the words after it are the route's name.
    const exactRepeat = lowerLong === `route ${lowerShort}` || lowerLong === lowerShort;
    const prefixed = cleanedLong.match(new RegExp(`^\\s*(?:route\\s+)?${cleanShort.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:\\s+[-–—]\\s+|:\\s*|\\s+)(.+)$`, 'i'))?.[1]?.trim();
    // Otherwise the long name only mentions the short one ("Green Line E" on route "E"): a list shows all of it.
    const after = exactRepeat ? undefined : prefixed ?? cleanedLong;
    return { primary: cleanShort, ...(after ? { afterShortName: after } : {}) };
  }

  if (!cleanedLong) return { primary: cleanShort };

  // Pure-letter short names (e.g. "LW", "LE", "KI") are acronyms of the long name — redundant to show both
  if (/^[A-Za-z]+$/.test(cleanShort)) return { primary: cleanedLong, shortCode: cleanShort };

  return { primary: cleanShort, secondary: cleanedLong };
}

export function getRouteLabel(shortName: string | null | undefined, longName: string | null | undefined, agencyName?: string | null): string {
  return joinRouteLabel(routeLabelParts(shortName, longName, agencyName));
}

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
 * its number the same way on every surface. Rail, subway, ferry and the other non-bus modes hide an id of three or more
 * digits (internal: "30053" for the Expo Line, "701" for UTA's Blue Line) and keep a short one, which is the public name (NYC
 * subway "2", O-Train "1"); "1" with "Line 1 (Yonge-University)" is handled by routeDisplay. A streetcar keeps its number (TTC 501 Queen), and so does a
 * bus ("108 Metro Local Line", "99 B-Line"); only a bus with a long internal id (5 or more digits) and a name ending in Line or
 * SeaBus loses it. Demand-responsive services (extended types 15xx) follow the bus rule. With no mode known the bus rule applies.
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
  // Demand-responsive extended types (15xx) are named like buses: their zone numbers are public (exo-laurentides 303).
  if (mode === undefined || mode === 3 || mode === 11 || (mode >= 1500 && mode < 1600)) return internalId && named;
  // Rail, subway and ferry: a short number is the public name (NYC subway 1-7, O-Train 1, 2 and 4); a number of three or
  // more digits is an internal id (UTA 701 Blue Line, Calgary 201 Red Line, HRT 800 Light Rail Tide, HRT 090 ferry).
  return shortName.trim().length >= 3;
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
  // A number repeats with or without leading zeros ("1" and "Route 01", "3" and "03 - Mason").
  const short = /^\d+$/.test(primary.trim()) ? `0*${escapeRe(primary.trim().replace(/^0+(?=\d)/, ''))}` : escapeRe(primary.trim());
  // "Route 01" on route 1 says nothing more than the number ("Line 2" on route 2 stays the name, as before).
  if (/^\d+$/.test(primary.trim()) && new RegExp(`^${DESIGNATOR_WORD}0+${escapeRe(primary.trim().replace(/^0+(?=\d)/, ''))}$`, 'i').test(secondary.trim())) return { primary };
  if (new RegExp(`${DESIGNATOR_WORD}${short}$`, 'i').test(secondary.trim())) return { primary: secondary.trim() };
  // A one-letter code followed straight by a hyphen is part of the name ("G-Line"), not a separator.
  const sep = /^[A-Za-z]$/.test(primary.trim()) ? '(?:\\s+[-–—:./]?\\s*|[:./]\\s*)' : '\\s*[-–—:./]?\\s*';
  const prefix = secondary.trim().match(new RegExp(`^(?:${DESIGNATOR_WORD})?${short}(?![\\p{L}\\p{N}])${sep}(.*)$`, 'iu'));
  const rest = prefix ? prefix[1].trim() : secondary.trim();
  if (!rest || rest.toLowerCase() === primary.trim().toLowerCase() || GENERIC_NAME.test(rest)) return { primary };
  return { primary, secondary: rest };
}

/**
 * A long name that ends with the short name plus "Line" names the line: "SILVER LINE" on route SILVER, and "DART LIGHT RAIL -
 * GREEN LINE" on route GREEN. Returns "<short> Line", or null. Words before it are dropped only when a separator ends them
 * ("... - GREEN LINE") or they start with the agency's own name ("Valley Metro Rail A Line", "Bustang North Line"); other
 * words can be part of the name ("Gold Coast Line" on route Coast, "Rapid A Line"), so those stay. A number never counts
 * ("5 Line" on route 5 keeps the number rules).
 */
export function lineNamedByShortName(
  shortName: string | null | undefined,
  longName: string | null | undefined,
  agency: (string | null | undefined)[] = [],
): string | null {
  const short = shortName?.trim();
  if (!short || !longName || /^\d+$/.test(short)) return null;
  const m = longName.trim().match(new RegExp(`^(?:(.*\\S)\\s+)?(${escapeRe(short)}\\s+line)$`, 'iu'));
  if (!m) return null;
  if (!m[1] || /[-–—:]$/.test(m[1])) return m[2];
  const norm = (x: string) => x.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
  // "Valley Metro (Phoenix)" and "dart": the name, the part in brackets, and the slug.
  const names = agency.flatMap(a => (a ? [a, a.replace(/\s*\(.*\)\s*/g, ' '), a.match(/\(([^)]+)\)/)?.[1] ?? ''] : []))
    .map(norm).filter(n => n.length >= 3);
  return names.some(n => norm(m[1]).startsWith(n)) ? m[2] : null;
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
  const { shortName, longName } = input;
  // The agency-specific name rules (SMART's "Main Line", STM's "Ligne") key on the agency; a site that has only the slug
  // (agency card, single-agency stop rows) must name the route the same way as one that has the agency's name.
  const agencyName = input.agencyName ?? input.agencySlug ?? null;
  const mode = input.mode ?? (input.routeType == null || input.routeType === '' ? undefined
    : effectiveMode({ routeType: input.routeType, routeShortName: shortName, routeLongName: longName, agencySlug: input.agencySlug }));
  const blankShort = !shortName || !shortName.trim();
  // "1" with "Line 1 (Yonge-University)": the long name already names the line, so the number is not shown twice (any mode).
  const lineNamedByLongName = !!longName && !!shortName && /^\d+$/.test(shortName.trim()) && (() => {
    const d = splitDesignator(longName);
    return !!d && /^(?:Line|Ligne)\s+/i.test(d.designator) && d.designator.replace(/^\S+\s+/, '').toLowerCase() === shortName.trim().replace(/^0+(?=\d)/, '').toLowerCase();
  })();
  if (longName && (blankShort || lineNamedByLongName || shouldHideNumericRouteShortName(shortName, longName, mode))) {
    // With no short name, "via ..." is what tells two routes apart (Orillia "West Ridge Via Old Barrie Road" and "... Via
    // Coldwater Road"), so it stays; a hidden id has a short name to fall back on.
    const named = routeLabelParts(null, longName, agencyName).primary;
    const cleaned = (blankShort ? named : named.replace(/\s+via\s+.+$/i, '')).trim();
    const d = splitDesignator(cleaned);
    const primary = d ? d.designator : cleaned;
    return { primary, secondary: d?.rest, text: d ? `${d.designator} — ${d.rest}` : cleaned };
  }
  const lineName = lineNamedByShortName(shortName, longName, [input.agencyName, input.agencySlug]);
  if (lineName) return { primary: lineName, text: lineName };
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
