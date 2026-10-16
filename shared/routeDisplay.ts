/**
 * How a route is written, on every surface: cards, list rows, search, Nearby, agency pages. One function, so the same route
 * reads the same way everywhere. It starts from the card title's cleaned names (`routeLabelParts`: arrows for "<>", first
 * and last terminus only, "via ..." stripped, leading zeros, brands) and adds the two list rules: a numeric id with a better
 * public name is hidden, and "Line 1 (Yonge-University)" splits into "Line 1" and "Yonge-University".
 * Returns plain strings; the caller applies title case (`routeLabels` in src/utils/format.ts does).
 */
import { joinRouteLabel, routeLabelParts, getRouteLabel } from './cleanHeadsign.js';

export interface RouteDisplay {
  /** The bold part. */
  primary: string;
  /** The lighter part after it, when there is one. */
  secondary?: string;
  /** primary and secondary on one line ("Line 1 — Yonge-University"). */
  text: string;
  /** The card title text: unchanged from `getRouteLabel`, so card titles do not move. */
  full: string;
}

/**
 * Hide a numeric internal id when the route has a useful public name. That is rail, subway and ferry routes (their ids are
 * internal: "30053" for the Expo Line, "1" for "Line 1 (Yonge-University)"). A tram or streetcar keeps its number (TTC 501
 * Queen), and so does a bus ("108 Metro Local Line", "99 B-Line"); only a bus with a long internal id (5 or more digits) and a
 * name ending in Line or SeaBus loses it. Without a route type (recent and suggested routes carry none) the bus rule applies.
 */
export function shouldHideNumericRouteShortName(
  shortName: string | null | undefined,
  longName: string | null | undefined,
  routeType?: number,
): boolean {
  if (!shortName || !longName || !/^\d+$/.test(shortName.trim())) return false;
  const named = /(?:line|seabus)$/i.test(longName.trim());
  const internalId = shortName.trim().length >= 5;
  if (routeType === 0) return false;
  if (routeType === undefined || routeType === 3) return internalId && named;
  return true;
}

/**
 * "Line 1 (Yonge-University)" -> "Line 1" and "Yonge-University". Also "Route 4: Sheppard" and "Ligne 5 - Bleue".
 * A hyphen between two digits never splits ("Route 10-12" stays whole).
 */
export function splitDesignator(name: string): { designator: string; rest: string } | null {
  const m = name.trim().match(/^((?:Line|Route|Ligne)\s+[A-Za-z0-9]{1,3})\s*(?:\(([^)]+)\)|([-–—:])\s*(.+))$/i);
  if (!m) return null;
  if (m[2] != null) return { designator: m[1], rest: m[2].trim() };
  // The separator sits right after the designator (or after spaces). A hyphen touching a digit on both sides is part of a number range.
  const sepIndex = name.trim().indexOf(m[3], m[1].length);
  const before = name.trim()[sepIndex - 1], after = name.trim()[sepIndex + 1];
  if (m[3] === '-' && /\d/.test(before ?? '') && /\d/.test(after ?? '')) return null;
  return { designator: m[1], rest: m[4].trim() };
}

export function routeDisplay(input: { shortName: string | null | undefined; longName: string | null | undefined; routeType?: number; agencyName?: string | null }): RouteDisplay {
  const { shortName, longName, routeType, agencyName } = input;
  const full = getRouteLabel(shortName, longName, agencyName);
  const blankShort = !shortName || !shortName.trim();
  if (longName && (blankShort || shouldHideNumericRouteShortName(shortName, longName, routeType))) {
    const cleaned = routeLabelParts(null, longName, agencyName).primary.replace(/\s+via\s+.+$/i, '').trim();
    const d = splitDesignator(cleaned);
    const primary = d ? d.designator : cleaned;
    return { primary, secondary: d?.rest, text: d ? `${d.designator} — ${d.rest}` : cleaned, full };
  }
  const parts = routeLabelParts(shortName, longName, agencyName);
  // A letter code the card title leaves out ("MI" for Milton) stays as the bold part of a list row.
  if (parts.shortCode) return { primary: parts.shortCode, secondary: parts.primary, text: joinRouteLabel({ primary: parts.shortCode, secondary: parts.primary }), full };
  // "10 Bathurst" on route "10": the card title is just "10"; the list shows the name too.
  const secondary = parts.secondary ?? parts.afterShortName;
  return { primary: parts.primary, secondary, text: joinRouteLabel({ primary: parts.primary, secondary }), full };
}
