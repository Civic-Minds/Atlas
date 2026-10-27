import { cleanHeadsign } from '../../shared/cleanHeadsign';
import { formatRemDisplay, getRouteLabel } from '../../shared/routeDisplay';
import { routeDisplay, shouldHideNumericRouteShortName } from '../../shared/routeDisplay';
import { directionBranchFallback, isRedundantWithRouteName } from '../../shared/headsignDisplay';
import { headwayAbout, headwayAboutRange, headwayAmount } from './headwayText';
export { cleanHeadsign, formatRemDisplay, getRouteLabel };

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

/** Top offset in px for the floating sidebar panel in Compare, or null to keep the normal slot under the search bar. */
export function comparePanelTop(compareActive: boolean, searchFocused: boolean, query: string): number | null {
  return compareActive && !searchOverlayHidesPanel(searchFocused, query) ? COMPARE_PANEL_TOP : null;
}

/**
 * The one list of real abbreviations Atlas keeps in capitals (CIV-935): stop names, destinations and route names.
 * Keys are the word as titleCase first writes it ("Lbj"), values how it reads ("LBJ"). A word that is also an
 * ordinary word or surname in place names ("Max", "Marc", "Path", "Ne") is in ROUTE_NAME_ONLY_ACRONYMS below instead.
 */
const NAME_ACRONYMS: Record<string, string> = {
  Go: 'GO',
  Dc: 'DC',
  Yrt: 'YRT',
  Ttc: 'TTC',
  Hsr: 'HSR',
  Grt: 'GRT',
  Brt: 'BRT',
  Healthline: 'HealthLine',
  Metrohealth: 'MetroHealth',
  Lrt: 'LRT',
  Nfta: 'NFTA',
  Ltc: 'LTC',
  Ktc: 'KTC',
  // GO Transit's 2-char line codes (LW, LE, KI, MI, BR) are deliberately NOT listed
  // here: as a standalone routeShortName ("LW — Lakeshore West") they're already
  // uppercased by the ≤3-char whole-string rule above, and no real GO long name
  // needs the mid-string substitution below. Adding them here previously matched
  // "Le"/"Ki" as ordinary words inside French headsigns ("Le Haillan Rostand" →
  // "LE Haillan Rostand") — the same class of false positive "St" was already
  // excluded for, just not caught until France expansion made it common.
  // St intentionally excluded — "St" in stop names means Street/Saint, not the GO Stouffville line
  Rh: 'RH',
  // Brantford Transit publishes the Northwest Industrial Area as NWIA.
  Nwia: 'NWIA',
  // Bay Area / Staged expansion acronyms
  Bart: 'BART',
  Weta: 'WETA',
  Sfmta: 'SFMTA',
  Sfu: 'SFU',
  Ac: 'AC',
  Vta: 'VTA',
  Samtrans: 'SamTrans',
  Calitp: 'CalITP',
  Sacrt: 'SacRT',
  Rt: 'RT',
  Ltd: 'LTD',
  Ctran: 'C-TRAN',
  Wsf: 'WSF',
  Owl: 'OWL',
  Moa: 'MOA',
  Msp: 'MSP',
  Ts: 'TS',
  Fun: 'FUN',
  // Route-name acronyms found in all-caps feeds (universities, airports, agencies, directions); ordinary words and
  // surnames that are also acronyms (MAX, NE, SE, LA, US) are deliberately left out.
  Mvx: 'MVX',
  Wsu: 'WSU',
  Slc: 'SLC',
  Ogx: 'OGX',
  Mlk: 'MLK',
  Unc: 'UNC',
  Dtc: 'DTC',
  Ucla: 'UCLA',
  Ucsd: 'UCSD',
  Ucsc: 'UCSC',
  Utc: 'UTC',
  Sfo: 'SFO',
  Jfk: 'JFK',
  Dtla: 'DTLA',
  Yul: 'YUL',
  Cta: 'CTA',
  Iu: 'IU',
  Und: 'UND',
  Uh: 'UH',
  Ku: 'KU',
  Ewu: 'EWU',
  Wwu: 'WWU',
  Ccri: 'CCRI',
  Mtc: 'MTC',
  Gtc: 'GTC',
  Vvtc: 'VVTC',
  Wcc: 'WCC',
  Chus: 'CHUS',
  Nas: 'NAS',
  Rta: 'RTA',
  Ftc: 'FTC',
  Mdc: 'MDC',
  Psta: 'PSTA',
  Smv: 'SMV',
  Ppsc: 'PPSC',
  Lcc: 'LCC',
  Rem: 'REM',
  Nw: 'NW',
  Sw: 'SW',
  Nntc: 'NNTC',
  Ups: 'UPS',
  Uc: 'UC',
  Ut: 'UT',
  Sf: 'SF',
  // Agencies, campuses, airports and places, moved here from the route-name list so stops and destinations get them too.
  Wce: 'WCE',
  Mbta: 'MBTA',
  Wmata: 'WMATA',
  Septa: 'SEPTA',
  Marta: 'MARTA',
  Stm: 'STM',
  Ets: 'ETS',
  Ubc: 'UBC',
  Utsc: 'UTSC',
  Utm: 'UTM',
  Mit: 'MIT',
  Lax: 'LAX',
  Lga: 'LGA',
  Ewr: 'EWR',
  Yvr: 'YVR',
  Yyz: 'YYZ',
  Bwi: 'BWI',
  Nyc: 'NYC',
  Nj: 'NJ',
  Patco: 'PATCO',
  Cbd: 'CBD',
  // DART destinations ("LBJ / Central", "DFW") and other initialisms found in published stop names and headsigns.
  Lbj: 'LBJ',
  Dfw: 'DFW',
  Eb: 'EB',
  Wb: 'WB',
  Nb: 'NB',
  Sb: 'SB',
  Ymca: 'YMCA',
  Ywca: 'YWCA',
  Cvs: 'CVS',
  Dmv: 'DMV',
  Suny: 'SUNY',
  Usc: 'USC',
  Vfw: 'VFW',
  Ikea: 'IKEA',
};

/**
 * Capitals kept only in route names: these are also ordinary words or surnames in stop and place names
 * ("Max", "Marc", "Path", "Up") or compass letters a stop name spells as a word.
 */
const ROUTE_NAME_ONLY_ACRONYMS = [
  'AM', 'PM', 'MAX', 'UP', 'TC', 'PATH', 'MARC', 'STO', 'SU',
  'N', 'S', 'E', 'W', 'NE', 'SE', 'US',
];

// Articles/prepositions that stay lowercase unless they open the string
const KEEP_LOWER = /^(of|to|the|a|an|and|or|in|at|by|for|via)$/i;

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

export function titleCase(s: string): string {
  if (!s) return s;

  // Preserve camel-case branding supplied by the feed (e.g. RedLine,
  // PurpleLine, BusPlus) instead of applying a global agency-specific list.
  const camelCaseWords = new Map<string, string>();
  s.replace(/\b[\p{L}]+\b/gu, word => {
    if (/[\p{Ll}][\p{Lu}]/u.test(word)) camelCaseWords.set(word.toLowerCase(), word);
    return word;
  });

  // Clean backslashes into standard slashes
  s = s.replace(/\\/g, '/');

  // If there is an em-dash divider, keep the shortName (before divider) untouched
  const parts = s.split(' — ');
  if (parts.length > 1) {
    const short = parts[0].trim();
    const long = parts.slice(1).join(' — ').trim();
    return `${short} — ${titleCase(long)}`;
  }

  // Preserve short route codes (e.g. "GO", "LW", "1X") as uppercase. Three-letter
  // service names such as MARTA's "RED" should still title-case; known three-letter
  // acronyms are restored by the NAME_ACRONYMS table below.
  if (s.length <= 2 && /^[A-Z0-9a-z]+$/i.test(s)) {
    return s.toUpperCase();
  }

  // Build the acronym matching regex dynamically from the keys of NAME_ACRONYMS
  const acronymKeys = Object.keys(NAME_ACRONYMS).join('|');
  const acronymRegex = new RegExp(`\\b(${acronymKeys})\\b`, 'gi');

  return s
    .toLowerCase()
    // Not \b: it is ASCII-only, so it split "île" after the accented first letter ("îLe").
    .replace(/(?<![\p{L}\p{N}])(\p{L}+)/gu, (fullWord, word, offset, str) => {
      if (word.length === 1 && str[offset + word.length] === '.') {
        return word.toUpperCase();
      }
      if (offset > 0 && KEEP_LOWER.test(word)) {
        return word;
      }
      return camelCaseWords.get(word) ?? word.replace(/^\p{L}/u, (c: string) => c.toUpperCase());
    })
    .replace(acronymRegex, (m, _g1, offset, str) => {
      // Don't convert "St." (Saint abbreviation) — only the standalone GO line-code "ST"
      if (m === 'St' && str[offset + m.length] === '.') return m;
      return NAME_ACRONYMS[m] ?? NAME_ACRONYMS[m.toLowerCase()] ?? m;
    })
    .replace(/'(\p{L})/gu, (_, c) => "'" + c.toLowerCase())
    // Mc surnames in all-caps feeds: "MCKNIGHT" -> "McKnight"
    .replace(/\bMc(\p{L})/gu, (_, c: string) => 'Mc' + c.toUpperCase())
    // "O'CONNOR" -> "O'Connor"
    .replace(/\bO'(\p{L})/gu, (_, c: string) => "O'" + c.toUpperCase())
    .replace(/l'orme/gi, "l'Orme")
    .replace(/à-l'/gi, "à-l'");
}

/**
 * The one capitals rule for stop and destination names (CIV-935): cased only when the feed sent the name all in
 * capitals ("MOODY CENTER" → "Moody Center", "LBJ/CENTRAL STATION" → "LBJ/Central Station", abbreviations from the
 * list route names share). A name that already has lower-case letters is the feed's own spelling and stays exactly
 * as written ("McDonald Ave", "Lower Jarvis St at The Esplanade"), the same rule routeLabelCase uses for route names.
 */
export function stopNameCase(name: string): string {
  return !name || /\p{Ll}/u.test(name) ? name : titleCase(name);
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
 * Real acronyms and initialisms that keep their capitals inside a route name a feed sends in capitals ("BART TO AIRPORT",
 * "UBC EXCHANGE"). This list is the ONLY exemption: no word is kept in capitals because of its length. Built from the route
 * names in the repo's agency config and pipeline fixtures; anything not on it ("WEST", "PARK", "MAIN", "VIVA") is a word.
 */
export const ROUTE_NAME_ACRONYMS: ReadonlySet<string> = new Set([
  // The shared list (stops and destinations get these too), then the route-name-only words.
  ...Object.values(NAME_ACRONYMS).filter(word => word === word.toUpperCase()),
  ...ROUTE_NAME_ONLY_ACRONYMS,
]);

/**
 * Case for one part of a route label. A name that is entirely capitals ("PARK ST", "WEST", "MAIN") is ALWAYS title-cased, whatever
 * its length; only the words on ROUTE_NAME_ACRONYMS and tokens with a digit ("SL1", "34E", "1X", "J14") keep their capitals. A name
 * that already has lower-case letters ("Granville-YVR", "Kendall/MIT Station", "Île-des-Soeurs") is the feed's own spelling and is
 * left alone. This is the one place route names are cased; every route-name surface goes through it (directly or via routeLabels).
 */
export function routeLabelCase(part: string): string {
  if (!part || /\p{Ll}/u.test(part)) return part;
  // "O'BRIEN": titleCase lowercases the letter after an apostrophe ("O'brien"); an Irish O' name keeps the capital.
  return titleCase(part)
    .replace(/(^|[^\p{L}])O'(\p{L})/gu, (_, pre: string, c: string) => `${pre}O'${c.toUpperCase()}`)
    .replace(/[\p{L}\p{N}]+/gu, (tok: string) => {
      const up = tok.toUpperCase();
      if (ROUTE_NAME_ACRONYMS.has(up)) return up;
      if (/^\d+(st|nd|rd|th)$/i.test(tok)) return tok.toLowerCase();
      // A route code with a digit ("sl1" after titleCase lowered it) is a code, not a word.
      return /\d/.test(tok) ? up : tok;
    });
}

/**
 * A route's label for any surface: `{ primary, secondary, text }` (see shared/routeDisplay.ts). Lists, search, Nearby and agency
 * pages show primary bold and secondary lighter; cards and one-line lists show `text` (both, joined by " — "). One text everywhere.
 */
export function routeLabels(input: Parameters<typeof routeDisplay>[0]) {
  const d = routeDisplay(input);
  // The route's own code in capitals ("SSSF", "RWXP", "CRSN") is never title-cased; it would read "Sssf".
  const ownCode = !!input.shortName && d.primary === input.shortName.trim() && /^[\p{Lu}\p{N}]+$/u.test(d.primary);
  const primary = ownCode ? d.primary : routeLabelCase(d.primary);
  const secondary = d.secondary ? routeLabelCase(d.secondary) : undefined;
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
  return withToPrefix(stopNameCase(raw));
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
