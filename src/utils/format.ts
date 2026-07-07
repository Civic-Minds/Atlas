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

/** Sidebar label for a live vehicle row when headsign is unavailable. */
export function liveVehicleRowLabel(
  v: { headsign: string | null; id: string; vehicleLabel?: string | null },
  index: number
): string {
  if (v.headsign) return v.headsign;
  const fleet = v.vehicleLabel?.trim();
  if (fleet && !UUID_LIKE.test(fleet)) return `Bus ${fleet}`;
  const id = v.id.trim();
  if (/^\d{3,7}$/.test(id)) return `Bus ${id}`;
  if (!UUID_LIKE.test(id)) {
    const tail = id.match(/\d{4,}$/)?.[0];
    if (tail) return `Bus ${tail}`;
  }
  return `Vehicle ${index + 1}`;
}

export function shortenAgencyName(name: string): string {
  const lower = name.toLowerCase();
  if (lower.includes('ac transit')) return 'AC Transit';
  if (lower.includes('sfmta') || lower.includes('muni')) return 'SFMTA';
  if (lower.includes('bart')) return 'BART';
  if (lower.includes('caltrain')) return 'Caltrain';
  if (lower.includes('samtrans')) return 'SamTrans';
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
  if (lower.includes('port authority of allegheny')) return 'PAAC';
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
