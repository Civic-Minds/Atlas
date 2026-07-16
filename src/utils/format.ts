import { cleanHeadsign, formatRemDisplay, getRouteLabel } from '../../shared/cleanHeadsign';
import { directionBranchFallback, isRedundantWithRouteName } from '../../shared/headsignDisplay';
export { cleanHeadsign, formatRemDisplay, getRouteLabel };

const TRANSIT_ACRONYMS: Record<string, string> = {
  Go: 'GO',
  Dc: 'DC',
  Yrt: 'YRT',
  Ttc: 'TTC',
  Hsr: 'HSR',
  Grt: 'GRT',
  Brt: 'BRT',
  Busplus: 'BusPlus',
  Lrt: 'LRT',
  Nfta: 'NFTA',
  Ltc: 'LTC',
  Ktc: 'KTC',
  // GO Transit line codes (2-char codes handled by the ≤3-char uppercase rule when standalone)
  Lw: 'LW',
  Le: 'LE',
  Ki: 'KI',
  Mi: 'MI',
  Br: 'BR',
  // St intentionally excluded — "St" in stop names means Street/Saint, not the GO Stouffville line
  Rh: 'RH',
  // Bay Area / Staged expansion acronyms
  Bart: 'BART',
  Weta: 'WETA',
  Sfmta: 'SFMTA',
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
};

// Articles/prepositions that stay lowercase unless they open the string
const KEEP_LOWER = /^(of|to|the|a|an|and|or|in|at|by|for|via)$/i;

export function fmtHeadway(minutes: number | null | undefined, style: 'narrative' | 'compact' = 'narrative'): string {
  if (minutes == null) return style === 'compact' ? '—' : '—';
  if (style === 'compact') {
    if (minutes >= 60) return `${Math.round(minutes / 60)}h`;
    return `${Math.round(minutes)} min`;
  }
  if (minutes <= 60) return `every ${minutes} min`;
  const hrs = Math.round(minutes / 30) / 2;
  return `every ~${hrs}h`;
}

// "every 6–12 min" when both fit in minutes; fall back to two separate strings otherwise.
export function fmtHeadwayRange(low: number, high: number): string {
  if (low <= 60 && high <= 60) return `every ${low}–${high} min`;
  return `${fmtHeadway(low)} – ${fmtHeadway(high)}`;
}

export function titleCase(s: string): string {
  if (!s) return s;

  // Clean backslashes into standard slashes
  s = s.replace(/\\/g, '/');

  // If there is an em-dash divider, keep the shortName (before divider) untouched
  const parts = s.split(' — ');
  if (parts.length > 1) {
    const short = parts[0].trim();
    const long = parts.slice(1).join(' — ').trim();
    return `${short} — ${titleCase(long)}`;
  }

  // If it's a short string (<= 3 chars) and contains only letters/numbers,
  // preserve it as uppercase (e.g. "GO", "LW", "VTA"). 4-char strings like "LOOP"
  // fall through so they title-case correctly; real 4-char acronyms (BART, etc.)
  // are handled by the TRANSIT_ACRONYMS table below.
  if (s.length <= 3 && /^[A-Z0-9a-z]+$/i.test(s)) {
    return s.toUpperCase();
  }

  // Build the acronym matching regex dynamically from the keys of TRANSIT_ACRONYMS
  const acronymKeys = Object.keys(TRANSIT_ACRONYMS).join('|');
  const acronymRegex = new RegExp(`\\b(${acronymKeys})\\b`, 'g');

  return s
    .toLowerCase()
    .replace(/\b(\p{L}+)/gu, (fullWord, word, offset, str) => {
      if (word.length === 1 && str[offset + word.length] === '.') {
        return word.toUpperCase();
      }
      if (offset > 0 && KEEP_LOWER.test(word)) {
        return word;
      }
      return word.replace(/^\p{L}/u, (c: string) => c.toUpperCase());
    })
    .replace(acronymRegex, (m, _g1, offset, str) => {
      // Don't convert "St." (Saint abbreviation) — only the standalone GO line-code "ST"
      if (m === 'St' && str[offset + m.length] === '.') return m;
      return TRANSIT_ACRONYMS[m] ?? m;
    })
    .replace(/'(\p{L})/gu, (_, c) => "'" + c.toLowerCase())
    .replace(/l'orme/gi, "l'Orme")
    .replace(/à-l'/gi, "à-l'");
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

/**
 * List-label standard for registry names:
 *
 *   primary   (dark)  = everyday agency name (short brand when legal name + code)
 *   secondary (light) = place/sector only when not already in the agency name
 *                       — never an acronym
 *
 *   "BC Transit (Kelowna)"              → BC Transit · Kelowna
 *   "MiWay (Mississauga)"               → MiWay · Mississauga
 *   "Calgary Transit"                   → Calgary Transit
 *   "Edmonton Transit Service (ETS)"    → ETS   (short brand; place already in legal name)
 *   "Bay Area Rapid Transit (BART)"     → BART
 *   "County Connection (CCCTA)"         → County Connection  (outer already short brand)
 *   "T3 Transit (PEI)"                  → T3 Transit · PEI
 */
export function agencyDisplayParts(name: string): { primary: string; secondary?: string } {
  const trimmed = name.trim();
  const m = trimmed.match(/^(.*?)\s*\(([^)]+)\)\s*$/);
  if (!m) {
    return { primary: compactListPrimary(trimmed, trimmed) };
  }

  const outer = m[1].trim();
  const inner = m[2].trim();
  if (!outer) return { primary: compactListPrimary(trimmed, inner || trimmed) };
  if (!inner) return { primary: compactListPrimary(trimmed, outer) };

  // Brand / acronym in parens — never secondary
  if (!isPlaceAbbrev(inner) && looksLikeBrandCode(inner)) {
    // Long legal outer + code → everyday callsign (BART, SFMTA, AC Transit)
    if (isLongLegalName(outer)) {
      return { primary: normalizeBrandCode(inner) };
    }
    // Expanded "… Transit Service (ETS)" → ETS; keep short brands like County Connection
    if (isPureAcronym(normalizeBrandCode(inner)) && looksLikeExpandedAgencyName(outer)) {
      return { primary: normalizeBrandCode(inner) };
    }
    return { primary: compactListPrimary(trimmed, outer) };
  }

  // Place / sector: only if not already embedded in the agency name
  if (placeAlreadyInName(outer, inner)) {
    return { primary: compactListPrimary(trimmed, outer) };
  }
  return { primary: compactListPrimary(trimmed, outer), secondary: inner };
}

/** Prefer a known short form when the primary still overflows a narrow list row. */
function compactListPrimary(fullName: string, primary: string): string {
  if (primary.length <= 28) return primary;
  const short = shortenAgencyName(fullName);
  return short.length > 0 && short.length < primary.length ? short : primary;
}

/** Legal / formal names that shouldn't fill a narrow list row. */
function isLongLegalName(s: string): boolean {
  if (s.length >= 28) return true;
  return /\b(Authority|District|Agency|Commission|Municipal|Metropolitan|Department of Transportation)\b/i.test(s)
    && s.length >= 22;
}

function isPureAcronym(s: string): boolean {
  return /^[A-Z]{2,8}$/.test(s.trim());
}

/** "Edmonton Transit Service", "Sonoma County Transit" — expanded form of a callsign. */
function looksLikeExpandedAgencyName(s: string): boolean {
  return s.length >= 16
    && /\b(Transit|Transportation|Metro|Railway|Railroad|Shuttle)\b/i.test(s);
}

function normalizeBrandCode(s: string): string {
  // "SFMTA - Muni" → "SFMTA"; "LA Metro" / "AC Transit" stay multi-word
  const head = s.split(/\s*[-/]\s*/)[0]?.trim();
  if (head && /^[A-Z]{2,8}$/.test(head) && head.length < s.trim().length) return head;
  return s.trim();
}

/** True when place text (or its significant words) already appears in the agency name. */
function placeAlreadyInName(agency: string, place: string): boolean {
  const norm = (s: string) =>
    s
      .toLowerCase()
      .normalize('NFD')
      .replace(/\p{M}/gu, '')
      .replace(/['’]/g, '');
  const a = norm(agency);
  const p = norm(place);
  if (!p) return true;
  if (a.includes(p)) return true;
  // "South Okanagan-Similkameen" → check tokens longer than 2 chars
  const tokens = p.split(/[\s\-–—,/]+/).filter(w => w.length > 2);
  if (tokens.length === 0) return a.includes(p);
  // Require the distinctive place token(s), not stopwords
  const stop = new Set(['the', 'and', 'des', 'les', 'sur', 'area', 'region', 'county', 'city']);
  const meaningful = tokens.filter(t => !stop.has(t));
  if (meaningful.length === 0) return false;
  return meaningful.every(t => a.includes(t));
}

/** CA province / US state-style abbrevs used as place, not agency codes. */
function isPlaceAbbrev(s: string): boolean {
  return /^(PEI|NL|NS|NB|QC|ON|MB|SK|AB|BC|YT|NT|NU|AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY|DC)$/i.test(s.trim());
}

/** Short brand / acronym in parens (ETS, BART, SFMTA - Muni) — not place names. */
function looksLikeBrandCode(s: string): boolean {
  const t = s.trim();
  if (t.length > 22) return false;
  if (isPlaceAbbrev(t)) return false;
  // Place-ish multi-word locators (Fraser Valley, Detroit suburbs, St. John's)
  if (/\b(Valley|River|County|City|Island|Area|Suburbs|Springs|Beach|Hills?|Heights|Mountain|Lake|Bay|Port|District|Region|Okanagan|Presqu|Sud-Ouest|Richelain|Terrebonne|Laurentides)\b/i.test(t)
    && !/^[A-Z]{2,5}\b/.test(t)) {
    return false;
  }
  // Title-case multi-word places: "St. John's", "Utica-Rome", "Fort Collins"
  if (/^[A-Z][a-z]/.test(t) && /[\s'-]/.test(t) && !/^(AC|LA|NICE|FAST|RTD|MTA|RTC|VCTC)\b/.test(t)) {
    if (!/\b(MTS|Bus|Transit|Metro|RIDE)\b/i.test(t) && t !== t.toUpperCase()) {
      if (/^The\s/i.test(t)) return true;
      if (!/\b(Bus|Transit|Lines|Metro|Express|RIDE|MTS)\b/i.test(t)) return false;
    }
  }
  if (/^[A-Z]{2,8}(\s*[-/]\s*[A-Za-z0-9][\w ./-]*)?$/.test(t)) return true; // BART, ETS, SFMTA - Muni
  if (/^[A-Z]{2,4}\s+[A-Za-z][\w]*$/.test(t)) return true; // AC Transit, LA Metro, NICE Bus
  if (/^[a-z]{2,}[A-Z][A-Za-z]+$/.test(t)) return true; // samTrans
  if (/^[A-Z][a-z]+[A-Z][a-z]+$/.test(t)) return true;
  if (/^(Yolobus|samTrans|The Bus)$/i.test(t)) return true;
  if (/^[A-Z]{2,5}\s+[A-Z][a-z]/.test(t) || /^(San Diego MTS|RTD Denver|RTC Washoe|MTA Maryland|VCTC Intercity|FAST Transit)$/i.test(t)) {
    return true;
  }
  if (/^[A-Z]{2,8}$/.test(t)) return true;
  return false;
}

export function shortenAgencyName(name: string): string {
  const lower = name.toLowerCase();
  if (lower.includes('ac transit')) return 'AC Transit';
  if (lower.includes('sfmta') || /\bmuni\b/.test(lower)) return 'SFMTA';
  if (lower.includes('bart')) return 'BART';
  if (lower.includes('caltrain')) return 'Caltrain';
  if (lower.includes('samtrans')) return 'SamTrans';
  if (lower.includes('minnesota valley') || lower.includes('mvta')) return 'MVTA';
  if (lower.includes('vta')) return 'VTA';
  if (lower.includes('weta')) return 'WETA';
  if (lower.includes('county connection')) return 'County Connection';
  if (lower.includes('westcat')) return 'WestCAT';
  if (lower.includes('soltrans')) return 'SolTrans';
  if (lower.includes('marin transit')) return 'Marin Transit';
  if (lower.includes('golden gate')) return 'Golden Gate Transit';
  if (lower.includes('smart') && lower.includes('sonoma')) return 'SMART';
  if (lower.includes('mountain metropolitan')) return 'Mountain Metro';

  // Long " * Transit/Transportation Authority" names — map to common short/acronym forms used in UI
  if (lower.includes('massachusetts bay') || lower.includes('mbta')) return 'MBTA';
  if (lower.includes('capital district') || lower.includes('cdta')) return 'CDTA';
  if (lower.includes('rochester-genesee') || lower.includes('rgrta')) return 'RGRTA';
  if (lower.includes('pioneer valley') || lower.includes('pvta')) return 'PVTA';
  if (lower.includes('worcester regional') || lower.includes('wrta')) return 'WRTA';
  if (lower.includes('chattanooga')) return 'CARTA';
  if (lower.includes('livermore amador')) return 'LAVTA';
  if (lower.includes('ventura county')) return 'VCTC';
  if (lower.includes('akron metro')) return 'Akron Metro';
  if (lower.includes('stark area')) return 'SARTA';
  if (lower.includes('capital area transportation')) return 'CATA';
  if (lower.includes('san joaquin')) return 'SJRTD';
  if (lower.includes('erie metropolitan')) return 'EMTA';
  if (lower.includes('williamsburg area')) return 'WATA';
  if (lower.includes('tompkins')) return 'TCAT';
  if (lower.includes('greater lynchburg')) return 'GLTC';
  if (lower.includes('whatcom')) return 'Whatcom Transit';
  if (lower.includes('san luis obispo transit') || lower.includes('slotransit')) return 'SLO Transit';
  if (lower.includes('maryland transit administration')) return 'MTA Maryland';
  if (lower.includes('fredericksburg')) return 'FRED';
  if (lower.includes('memphis area')) return 'MATA';
  if (lower.includes('dutchess')) return 'Dutchess Transit';
  if (lower.includes('fairfield and suisun')) return 'FAST';
  if (lower.includes('glens falls')) return 'GGFT';
  if (lower.includes('mendocino')) return 'Mendocino Transit';
  if (lower.includes('yamhill')) return 'YCTA';
  if (lower.includes('metropolitan transit system') || lower.includes('sdmts')) return 'MTS';
  if (lower.includes('roaring fork')) return 'RFTA';
  if (lower.includes('river city') || lower.includes('louisville')) return 'TARC';
  if (lower.includes('bee-line') || lower.includes('westchester')) return 'Bee-Line';
  if (lower.includes('port authority of allegheny') || lower.includes('pittsburgh regional')) return 'PRT';
  if (lower.includes('nashville') || lower.includes('wego')) return 'WeGo';
  if (lower.includes('sherbrooke')) return 'STS';
  if (lower.includes('toronto transit')) return 'TTC';
  if (lower.includes('spokane')) return 'Spokane Transit';
  if (lower.includes('altamont corridor')) return 'ACE';
  if (lower.includes('long island rail')) return 'LIRR';
  if (lower.includes('washington state ferries')) return 'WSF';
  if (lower.includes('riverside transit')) return 'Riverside Transit';
  if (lower.includes('via metropolitan')) return 'VIA';
  if (lower.includes('duluth transit')) return 'DTA';
  if (lower.includes('kings area rural')) return 'KART';
  if (lower.includes('hamilton street')) return 'HSR';
  if (lower.includes('blue water area')) return 'Blue Water';
  if (lower.includes('gwinnett county')) return 'Gwinnett Transit';
  if (lower.includes('santa maria area')) return 'SMAT';
  if (lower.includes('redding area')) return 'RABA';
  if (lower.includes('rockford mass') || lower.includes('rmtd')) return 'RMTD';

  // General fallback: use parenthetical if short abbrev; otherwise strip long (City/Region) parens for compact display
  const match = name.match(/\(([^)]+)\)/);
  if (match) {
    const abbrev = match[1].trim();
    if (abbrev.length <= 10) return abbrev;
    // Strip long locator parens (e.g. "(Colorado Springs)", "(Mississauga)")
    return name.replace(/\s*\([^)]+\)\s*$/, '').trim();
  }

  // Last-resort strip for any remaining very long "* Transit/Transportation Authority" style names
  if (name.length > 22) {
    const stripped = name
      .replace(/\s+(Area|Regional|Metropolitan|Consolidated)\s+(Transit|Transportation)\s+(Authority|Agency|System|Commission)$/i, '')
      .replace(/\s+(Transit|Transportation)\s+(Authority|Agency|System|Commission|District)$/i, '')
      .replace(/\s+Area\s+(Transit|Bus)\s*(Service)?$/i, '')
      .replace(/\s+Bus (Authority|Service)$/i, '')
      .trim();
    if (stripped.length >= 4 && stripped.length < name.length) {
      return stripped;
    }
  }

  return name;
}

/**
 * Look up an agency's display name by slug and shorten it in one step.
 * Prefer this over `agencies.find(a => a.slug === slug)?.name` — the raw
 * lookup is easy to reach for and easy to forget to shorten.
 */
export function agencyDisplayName(agencies: { slug: string; name: string }[], slug: string): string {
  const agency = agencies.find(a => a.slug === slug);
  return agency ? shortenAgencyName(agency.name) : slug;
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
  return withToPrefix(titleCase(raw));
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
