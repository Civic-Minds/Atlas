import { cleanHeadsign } from '../../shared/cleanHeadsign';
import { formatRemDisplay, getRouteLabel } from '../../shared/routeDisplay';
import { routeDisplay, shouldHideNumericRouteShortName } from '../../shared/routeDisplay';
import { directionBranchFallback, isRedundantWithRouteName } from '../../shared/headsignDisplay';
import { headwayAbout, headwayAboutRange, headwayAmount } from './headwayText';
import { nameCase } from './nameCase';
export { cleanHeadsign, formatRemDisplay, getRouteLabel };
// Name casing lives in nameCase.ts (CIV-1001); these keep the older import path working.
export { nameCase, ROUTE_NAME_ACRONYMS, writtenInCapitals, type NameCaseMode } from './nameCase';

/**
 * Single source of truth for "an active search should hide this sidebar overlay panel".
 * Every panel that floats over the same sidebar slot (route card, stop card, agency card,
 * live overview) must gate on this exact check — a one-off reimplementation is how these
 * panels have repeatedly ended up stacked/overlapping instead of yielding to search.
 */
export function searchOverlayHidesPanel(searchFocused: boolean, query: string): boolean {
  return searchFocused || query.trim() !== '';
}

/**
 * Compare pushes the sidebar's cards (route, stop, agency) down to this top so they clear the A map's
 * label and chips. The search suggestions and results are not cards: they hang straight under the
 * search bar, like outside Compare.
 */
export const COMPARE_PANEL_TOP = 160;
/** ...and to map A's own left corner, at the phone slot's inset (left-6), not beside the logo: on tablets the logo
 * offset put the card in the middle of the screen, against the divider (CIV-844). */
export const COMPARE_PANEL_LEFT = 24;

/** Top offset in px for the floating sidebar panel in Compare, or null to keep the normal slot under the search bar. */
export function comparePanelTop(compareActive: boolean, searchFocused: boolean, query: string): number | null {
  return compareActive && !searchOverlayHidesPanel(searchFocused, query) ? COMPARE_PANEL_TOP : null;
}


/**
 * Headway wording lives in headwayText.ts. These two keep the older names working:
 * fmtHeadway is "every N min" (or the bare "N min" with style 'compact').
 */
export function fmtHeadway(minutes: number | null | undefined, style: 'narrative' | 'compact' = 'narrative'): string {
  return style === 'compact' ? headwayAmount(minutes) : headwayAbout(minutes);
}

export function fmtHeadwayRange(low: number, high: number): string {
  return headwayAboutRange(low, high);
}


export function cleanRouteShortName(shortName: string | null | undefined): string {
  if (!shortName) return '';
  // Strip leading zeros for digits only (e.g. "01" -> "1", but leave "0" alone)
  if (shortName.length > 1 && shortName.startsWith('0') && /^\d+$/.test(shortName)) {
    return shortName.replace(/^0+/, '');
  }
  return shortName;
}

export function cleanRouteDisplayName(displayName: string, shortName: string): string {
  const cleanedShort = cleanRouteShortName(shortName);
  if (cleanedShort !== shortName) {
    let name = displayName;
    // Replace "Route 01" -> "Route 1"
    name = name.replace(new RegExp(`\\bRoute\\s+0+${cleanedShort}\\b`, 'i'), `Route ${cleanedShort}`);
    // Replace standalone occurrences of "01" -> "1"
    name = name.replace(new RegExp(`\\b0+${cleanedShort}\\b`, 'g'), cleanedShort);
    return name;
  }
  return displayName;
}

const UUID_LIKE = /^[0-9a-f]{8}-[0-9a-f]{4}-/i;

/** Companion name for RouteListRow — omit when redundant with shortName (e.g. "Route 1" + "1"). */
export function routeListCompanionName(
  displayName: string | undefined | null,
  shortName: string
): string | undefined {
  if (!displayName) return undefined;
  const cleaned = cleanRouteShortName(shortName);
  if (displayName === cleaned) return undefined;
  const m = displayName.match(/^Route\s+(.+)$/i);
  if (m && cleanRouteShortName(m[1]) === cleaned) return undefined;
  return displayName;
}

export { shouldHideNumericRouteShortName };


/**
 * A route's label for any surface: `{ primary, secondary, text }` (see shared/routeDisplay.ts). Lists, search, Nearby and agency
 * pages show primary bold and secondary lighter; cards and one-line lists show `text` (both, joined by " — "). One text everywhere.
 */
export function routeLabels(input: Parameters<typeof routeDisplay>[0]) {
  const d = routeDisplay(input);
  // The route's own code in capitals ("SSSF", "RWXP", "CRSN") is never title-cased; it would read "Sssf".
  const ownCode = !!input.shortName && d.primary === input.shortName.trim() && /^[\p{Lu}\p{N}]+$/u.test(d.primary);
  const primary = ownCode ? d.primary : nameCase(d.primary, 'route');
  const secondary = d.secondary ? nameCase(d.secondary, 'route') : undefined;
  return { primary, secondary, text: secondary ? `${primary} — ${secondary}` : primary };
}

/** Vehicle word for a GTFS route_type (0 tram, 1 metro, 2 rail, 3 bus, 4 ferry). */
export function vehicleModeWord(routeType: number | null | undefined): string {
  switch (routeType) {
    case 0: return 'Streetcar';
    case 1:
    case 2: return 'Train';
    case 4: return 'Ferry';
    default: return 'Bus';
  }
}

/** Sidebar label for a live vehicle row when headsign is unavailable. */
export function liveVehicleRowLabel(
  v: { headsign: string | null; id: string; vehicleLabel?: string | null },
  index: number,
  modeWord: string = 'Bus'
): string {
  if (v.headsign) return v.headsign;
  const fleet = v.vehicleLabel?.trim();
  if (fleet && !UUID_LIKE.test(fleet)) return `${modeWord} ${fleet}`;
  const id = v.id.trim();
  if (/^\d{3,7}$/.test(id)) return `${modeWord} ${id}`;
  if (!UUID_LIKE.test(id)) {
    const tail = id.match(/\d{4,}$/)?.[0];
    if (tail) return `${modeWord} ${tail}`;
  }
  return `Vehicle ${index + 1}`;
}


/** Destination label for route/stop cards — matches route card `to …` convention. */
function withToPrefix(label: string): string {
  if (!label) return '';
  return /^to\s/i.test(label) || / to /i.test(label) ? label : `to ${label}`;
}

export function formatBranchLabel(
  headsign: string | null | undefined,
  shortName: string,
  longName: string,
  fallback = '',
): string {
  if (!headsign?.trim()) return withToPrefix(fallback);
  const raw = /^A[0-9]/.test(shortName)
    ? headsign.trim()
    : cleanHeadsign(headsign.trim(), shortName, longName);
  if (!raw || isRedundantWithRouteName(raw, shortName, longName)) return withToPrefix(fallback);
  return withToPrefix(nameCase(raw, 'stop'));
}

/** Format YYYYMMDD or YYYY-MM-DD for display (UTC). */
export function formatStoredDate(value: string): string {
  const ymd = value.length === 8
    ? { y: value.slice(0, 4), m: value.slice(4, 6), d: value.slice(6, 8) }
    : value.length === 10 && value[4] === '-'
      ? { y: value.slice(0, 4), m: value.slice(5, 7), d: value.slice(8, 10) }
      : null;
  if (!ymd) return '';
  const date = new Date(Date.UTC(parseInt(ymd.y, 10), parseInt(ymd.m, 10) - 1, parseInt(ymd.d, 10)));
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}

/** Unified branch label for route and stop cards. */
export function resolveBranchLabel(opts: {
  headsign: string | null | undefined;
  shortName: string;
  longName: string;
  directionId?: number;
  boundLabel?: string;
  multipleDirections?: boolean;
  /** When the card already shows NORTHBOUND/SOUTHBOUND etc., omit row labels that repeat it. */
  sectionBoundLabel?: string;
}): string {
  const hasSection = !!opts.sectionBoundLabel;
  const fallback = opts.multipleDirections && opts.directionId != null && !hasSection
    ? directionBranchFallback(opts.directionId, opts.boundLabel)
    : '';
  let label = formatBranchLabel(opts.headsign, opts.shortName, opts.longName, fallback);
  if (hasSection && label) {
    const dest = label.replace(/^to\s+/i, '').trim().toLowerCase();
    if (dest === opts.sectionBoundLabel!.trim().toLowerCase()) label = '';
  }
  return label;
}
