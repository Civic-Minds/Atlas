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
 *   "Edmonton Transit Service (ETS)"    → Edmonton Transit Service  (fits; no need to abbreviate)
 *   "Bay Area Rapid Transit (BART)"     → BART · Bay Area
 *   "Golden Empire Transit District (GET)" → GET · Golden Empire  (place recovered so it doesn't collide with the other GET)
 *   "County Connection (CCCTA)"         → County Connection  (outer already short brand)
 *   "T3 Transit (PEI)"                  → T3 Transit · PEI
 */
export function agencyDisplayParts(
  name: string,
  cities?: string[],
): { primary: string; secondary?: string } {
  const result = agencyDisplayPartsFromName(name);
  // `cities` is derived from real GTFS stop coordinates (pipeline/deriveCities.ts),
  // so it's authoritative over whatever the name-parsing heuristics above guessed —
  // prefer it whenever the primary city isn't already spelled out in the name.
  const primaryCity = cities?.[0]?.split(',')[0]?.trim();
  if (primaryCity && !placeAlreadyInName(result.primary, primaryCity)) {
    return { ...result, secondary: primaryCity };
  }
  return result;
}

function agencyDisplayPartsFromName(name: string): { primary: string; secondary?: string } {
  const trimmed = name.trim();
  const m = trimmed.match(/^(.*?)\s*\(([^)]+)\)\s*$/);
  if (!m) {
    return compactListPrimaryWithPlace(trimmed, trimmed);
  }

  const outer = m[1].trim();
  const inner = m[2].trim();
  if (!outer) return { primary: compactListPrimary(trimmed, inner || trimmed) };
  if (!inner) return compactListPrimaryWithPlace(trimmed, outer);

  // Brand / acronym in parens — the acronym never becomes secondary itself,
  // but when we abbreviate to it we still surface the place buried in the
  // legal name, since a bare acronym alone isn't self-explanatory (and two
  // different agencies can land on the same acronym — see GET).
  if (!isPlaceAbbrev(inner) && looksLikeBrandCode(inner)) {
    const place = placeFromLegalName(outer);
    // Long legal outer + code → everyday callsign (SFMTA, AC Transit)
    if (isLongLegalName(outer)) {
      return place
        ? { primary: normalizeBrandCode(inner), secondary: place }
        : { primary: normalizeBrandCode(inner) };
    }
    // A handful of acronyms are more widely recognized than their expansion
    // even when the expansion would otherwise fit a list row (e.g. BART).
    // Don't extend this list on a length-fit basis — most expanded names
    // (Edmonton Transit Service, Sonoma County Transit, ...) should just
    // show in full when they fit.
    if (ALWAYS_ACRONYM_BRANDS.has(outer)) {
      return place
        ? { primary: normalizeBrandCode(inner), secondary: place }
        : { primary: normalizeBrandCode(inner) };
    }
    return { primary: compactListPrimary(trimmed, outer) };
  }

  // Place / sector: only if not already embedded in the agency name
  if (placeAlreadyInName(outer, inner)) {
    return compactListPrimaryWithPlace(trimmed, outer);
  }
  return { primary: compactListPrimary(trimmed, outer), secondary: inner };
}

/** Outer (expanded) names whose acronym is the better-known public brand regardless of length. */
const ALWAYS_ACRONYM_BRANDS = new Set(['Bay Area Rapid Transit']);

/** Generic descriptor words stripped from the end of a legal name to recover the place prefix. */
const GENERIC_LEGAL_NAME_WORDS = new Set([
  'transit', 'transportation', 'metro', 'metropolitan', 'rapid', 'authority',
  'district', 'agency', 'commission', 'system', 'service', 'services',
  'municipal', 'regional', 'county', 'bus', 'coach', 'railway', 'railroad',
  'shuttle', 'department', 'of', 'public', 'corporation', 'board', 'line', 'lines',
  'express', 'company', 'mass',
]);

/**
 * "Golden Empire Transit District" → "Golden Empire"; "Bay Area Rapid Transit" → "Bay Area".
 * Strips generic words from the end first; if the name already ends in a
 * proper noun (nothing to strip), falls back to whatever follows a trailing
 * "of"/"de" (Regional Transportation Commission of Southern Nevada →
 * "Southern Nevada"; Société de transport de Sherbrooke → "Sherbrooke").
 */
function placeFromLegalName(outer: string): string | undefined {
  const words = outer.split(/\s+/).filter(Boolean);
  let end = words.length;
  while (end > 0 && GENERIC_LEGAL_NAME_WORDS.has(words[end - 1].toLowerCase())) {
    end--;
  }
  if (end > 0 && end < words.length) return words.slice(0, end).join(' ');
  const ofMatch = outer.match(/\b(?:of|de)\s+([A-ZÀ-Ý].*)$/);
  return ofMatch ? ofMatch[1].trim() : undefined;
}

/** Prefer a known short form when the primary still overflows a narrow list row. */
function compactListPrimary(fullName: string, primary: string): string {
  if (primary.length <= 28) return primary;
  const short = shortenAgencyName(fullName);
  return short.length > 0 && short.length < primary.length ? short : primary;
}

/** Like compactListPrimary, but also surfaces the place when it actually had to shorten. */
function compactListPrimaryWithPlace(fullName: string, primary: string): { primary: string; secondary?: string } {
  const compacted = compactListPrimary(fullName, primary);
  if (compacted === primary) return { primary: compacted };
  const place = placeFromLegalName(fullName);
  return place && place !== compacted ? { primary: compacted, secondary: place } : { primary: compacted };
}

/**
 * Names too long to fill a narrow list row — the only length-based reason
 * to abbreviate. Same 28-char threshold as compactListPrimary; a name that
 * merely contains "Authority"/"District"/etc. isn't reason enough on its
 * own (Chicago Transit Authority, Utah Transit Authority both fit fine).
 */
function isLongLegalName(s: string): boolean {
  return s.length >= 28;
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

/**
 * Match a short acronym as a whole word, not as a substring inside an
 * unrelated word — e.g. "vta" must not match inside "AVTA" or "VVTA".
 * Bare acronym checks (≤6 letters, no spaces) are exactly the ones at risk
 * of hiding inside a different agency's legal name; longer/multi-word
 * checks below are specific enough that this isn't needed.
 */
function hasWord(haystack: string, word: string): boolean {
  return new RegExp(`\\b${word}\\b`).test(haystack);
}

export function shortenAgencyName(name: string): string {
  const lower = name.toLowerCase();
  if (lower.includes('ac transit')) return 'AC Transit';
  if (lower.includes('sfmta') || hasWord(lower, 'muni')) return 'SFMTA';
  if (hasWord(lower, 'bart')) return 'BART';
  if (lower.includes('caltrain')) return 'Caltrain';
  if (lower.includes('samtrans')) return 'SamTrans';
  if (lower.includes('minnesota valley') || hasWord(lower, 'mvta')) return 'MVTA';
  if (hasWord(lower, 'vta')) return 'VTA';
  if (hasWord(lower, 'weta')) return 'WETA';
  if (lower.includes('county connection')) return 'County Connection';
  if (lower.includes('westcat')) return 'WestCAT';
  if (lower.includes('soltrans')) return 'SolTrans';
  if (lower.includes('marin transit')) return 'Marin Transit';
  if (lower.includes('golden gate')) return 'Golden Gate Transit';
  if (lower.includes('smart') && lower.includes('sonoma')) return 'SMART';
  if (lower.includes('mountain metropolitan')) return 'Mountain Metro';
  // Already-recognizable brand names — the generic "(City)" fallback below
  // would otherwise collapse both of these Seattle-area agencies to the
  // same bare "Seattle" shortened form.
  if (lower.includes('king county metro')) return 'King County Metro';
  if (lower.includes('sound transit')) return 'Sound Transit';

  // Long " * Transit/Transportation Authority" names — map to common short/acronym forms used in UI
  if (lower.includes('massachusetts bay') || hasWord(lower, 'mbta')) return 'MBTA';
  if (lower.includes('capital district') || hasWord(lower, 'cdta')) return 'CDTA';
  if (lower.includes('rochester-genesee') || hasWord(lower, 'rgrta')) return 'RGRTA';
  if (lower.includes('pioneer valley') || hasWord(lower, 'pvta')) return 'PVTA';
  if (lower.includes('worcester regional') || hasWord(lower, 'wrta')) return 'WRTA';
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
  if (lower.includes('metropolitan transit system') || hasWord(lower, 'sdmts')) return 'MTS';
  if (lower.includes('roaring fork')) return 'RFTA';
  if (lower.includes('river city') || lower.includes('louisville')) return 'TARC';
  if (lower.includes('bee-line') || lower.includes('westchester')) return 'Bee-Line';
  if (lower.includes('port authority of allegheny') || lower.includes('pittsburgh regional')) return 'PRT';
  if (lower.includes('nashville') || hasWord(lower, 'wego')) return 'WeGo';
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
  if (lower.includes('rockford mass') || hasWord(lower, 'rmtd')) return 'RMTD';

  // General fallback: prefer whichever of {outer text, parenthetical} is
  // already compact — the parenthetical isn't always a brand abbreviation,
  // sometimes it's just a city qualifier (e.g. "DDOT (Detroit)" should stay
  // "DDOT", not become "Detroit" and collide with every other Detroit-area
  // operator's parenthetical). Preferring outer first also fixes that case
  // without needing a per-agency exception.
  const match = name.match(/\(([^)]+)\)/);
  if (match) {
    const abbrev = match[1].trim();
    const outer = name.replace(/\s*\([^)]+\)\s*$/, '').trim();
    if (outer.length <= 10 && outer.length < name.length) return outer;
    if (abbrev.length <= 10) return abbrev;
    // Strip long locator parens (e.g. "(Colorado Springs)", "(Mississauga)")
    return outer;
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
