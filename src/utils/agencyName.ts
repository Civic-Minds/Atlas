/**
 * The only place that decides an agency's names (CIV-1023; rules in docs/product/DECISIONS.md, "Agency names"):
 * its short name for lists, rows and back links, its full name for the agency card, and the place beside them.
 * Surfaces call agencyNames(...) and pick a form; fitAgencyName applies the one length rule.
 */
import agencyShortNameData from '../../shared/data/agency-short-names.json';

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
function displayParts(
  name: string,
  cities?: string[],
  displayArea?: string,
): { primary: string; secondary?: string } {
  const result = displayPartsFromName(name);
  if (displayArea) return { ...result, secondary: displayArea };
  // `cities` is derived from real GTFS stop coordinates (pipeline/deriveCities.ts),
  // so it's authoritative over whatever the name-parsing heuristics above guessed —
  // prefer it whenever the primary city isn't already spelled out in the name.
  const primaryCity = cities?.[0]?.split(',')[0]?.trim();
  if (primaryCity && !placeAlreadyInName(result.primary, primaryCity)) {
    return { ...result, secondary: primaryCity };
  }
  return result;
}

function displayPartsFromName(name: string): { primary: string; secondary?: string } {
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

/** Prefer a known short form when the primary still overflows a narrow list row; never a bracketed city (#1134). */
function compactListPrimary(fullName: string, primary: string): string {
  if (primary.length <= 28) return primary;
  const short = bracketAwareShortName(fullName);
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

/**
 * Brand-code compounds where the real rider callsign is the non-acronym half —
 * the opposite of normalizeBrandCode's default "prefer the bare acronym" rule.
 * SF riders say "Muni", not "SFMTA" — SFMTA is the agency, Muni is the service.
 */
const BRAND_CODE_OVERRIDES: Record<string, string> = {
  'SFMTA - Muni': 'Muni',
};

function normalizeBrandCode(s: string): string {
  const trimmed = s.trim();
  if (BRAND_CODE_OVERRIDES[trimmed]) return BRAND_CODE_OVERRIDES[trimmed];
  // "SFMTA - Muni" would otherwise become "SFMTA" here (overridden above);
  // "LA Metro" / "AC Transit" have no acronym half, so they stay multi-word.
  const head = trimmed.split(/\s*[-/]\s*/)[0]?.trim();
  if (head && /^[A-Z]{2,8}$/.test(head) && head.length < trimmed.length) return head;
  return trimmed;
}

/** True when place text (or its significant words) already appears in the agency name. Also used by the agency card top. */
export function placeAlreadyInName(agency: string, place: string): boolean {
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

/** A one-word code with two or more capitals ("CATbus", "SacRT", "StaRT"); a place has one ("Phoenix"). */
function isMixedCaseCode(s: string): boolean {
  return !/[\s,]/.test(s) && (s.match(/[A-Z]/g)?.length ?? 0) >= 2;
}

/**
 * The agency's name in a card's back link ("← Valley Metro"): shortenedName, except that a bracketed city
 * never stands in for the name ("Valley Metro (Phoenix)" → "Valley Metro", not "Phoenix"). A bracketed brand
 * code still does ("DART", "LA Metro", "CATbus"). Live keeps shortenedName (`short`, #1102).
 */
function bracketAwareShortName(name: string): string {
  const short = shortenedName(name);
  const m = name.match(/^(.*?)\s*\(([^)]+)\)\s*$/);
  if (!m || short !== m[2].trim()) return short;
  const bracket = m[2].trim();
  const isCode = !isPlaceAbbrev(bracket) && (looksLikeBrandCode(bracket) || isMixedCaseCode(bracket));
  return isCode || !m[1].trim() ? short : m[1].trim();
}

function shortenedName(name: string): string {
  const lower = name.toLowerCase();
  if (lower.includes('ac transit')) return 'AC Transit';
  // SF riders say "Muni", not "SFMTA" — SFMTA is the agency, Muni is the service brand.
  // Only prefer it when the name actually says "Muni" (e.g. "(SFMTA - Muni)");
  // plain "SFMTA" alone still shortens to "SFMTA".
  if (lower.includes('sfmta') && hasWord(lower, 'muni')) return 'Muni';
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
  if (lower.includes('owen sound transit')) return 'Owen Sound Transit';
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
 * The one length rule (DECISIONS.md "Agency names"): a name longer than this shows the agency's short name
 * when it has one ("CDTA"), with the full name on hover. Lists, rows and the agency index read it; a surface
 * passes its own width only where its layout needs one (the area table's narrow names column).
 */
export const AGENCY_NAME_MAX_CHARS = 24;

/** Fit a name to a width: the short name when the full one is longer than `maxChars` and the short one is shorter. */
export function fitAgencyName(full: string, short: string, maxChars: number = AGENCY_NAME_MAX_CHARS): { text: string; title?: string } {
  return full.length > maxChars && short.length < full.length ? { text: short, title: full } : { text: full };
}

const CONFIG_SHORT_NAMES: ReadonlyMap<string, string> = new Map(Object.entries((agencyShortNameData as { byName: Record<string, string> }).byName));

/** A word that makes a shortened name a transit name rather than a place ("Spokane Transit", not "Spokane"). */
const TRANSIT_NAME_WORD = /\b(Transit|Transportation|Transport|Transpo|Metro|Bus|Rail|Railway|Express|Lines?|Ferr(?:y|ies)|Shuttle|Connector|Link|Ride|Trolley|Tram|Breeze|Trans)\b/i;

/**
 * The agency's short name (CIV-998): never a city. A bracketed city never stands in for the name (bracketAwareShortName),
 * and a shortening that leaves only a place ("Corvallis Transit System" → "Corvallis") keeps the agency's own name.
 * A config short form is used only when the name is too long for a row ("GPTC").
 */
function agencyRowName(name: string): string {
  const outer = name.replace(/\s*\([^)]+\)\s*$/, '').trim() || name.trim();
  let own = bracketAwareShortName(name);
  const isCode = /^[\p{Lu}\d&./ -]+$/u.test(own) || isMixedCaseCode(own) || looksLikeBrandCode(own);
  // Only the generic-word strip leaves a place: the leading words of the name with the transit words cut off. "Muni" is not that.
  if (outer.startsWith(`${own} `) && !isCode && !TRANSIT_NAME_WORD.test(own)) own = outer;
  return fitAgencyName(own, CONFIG_SHORT_NAMES.get(name.trim()) ?? own).text;
}

/** An agency as the name forms read it: the registry name, plus the places that can stand beside it. */
export type AgencyNameInput = string | { name: string; cities?: string[]; displayArea?: string };

/** Every form of an agency's name, from one place (CIV-998, CIV-1023). Callers pick the form by name, not by helper. */
export interface AgencyNames {
  /**
   * The agency's short name for every surface but its card title (Ryan, CIV-998): lists, rows, eyebrows, back links,
   * the route chooser, the stop card, In view and search. Never a city ("Capital Metro", not "Austin").
   */
  name: string;
  /** A back link to the agency: the same short name. */
  backLink: string;
  /** The agency card title: "Toronto Transit Commission", "Gary Public Transportation Corporation". */
  full: string;
  /** The place shown beside the card title ("Mississauga"), if any. */
  place?: string;
  /** The card title with its place ({ primary, secondary }): the agency card, History's agency card, the zone card fallback. */
  card: { primary: string; secondary?: string };
  /**
   * A list row: the short name, with the place beside it when the short name doesn't already say it
   * ("TTC · Toronto", "Capital Metro · Austin", "Calgary Transit").
   */
  list: { primary: string; secondary?: string };
  /** Live only, until Atlas Live moves to `name`: the older short form, which can be a bracketed city ("Austin"). */
  short: string;
}

export function agencyNames(agency: AgencyNameInput): AgencyNames {
  const { name, cities, displayArea } = typeof agency === 'string' ? { name: agency, cities: undefined, displayArea: undefined } : agency;
  const { primary: full, secondary: place } = displayParts(name, cities, displayArea);
  const row = agencyRowName(name);
  const fallback = typeof agency === 'string' ? undefined : agency.displayArea ?? agency.cities?.[0]?.split(',')[0]?.trim();
  const where = place ?? (row !== full ? fallback : undefined);
  return {
    name: row,
    backLink: row,
    full,
    place,
    card: place ? { primary: full, secondary: place } : { primary: full },
    list: where && !placeAlreadyInName(row, where) ? { primary: row, secondary: where } : { primary: row },
    short: shortenedName(name),
  };
}

/** The `short` form of the agency with this slug (Live), or the slug when it is not in the list. */
export function agencyShortNameBySlug(agencies: { slug: string; name: string }[], slug: string): string {
  const agency = agencies.find(a => a.slug === slug);
  return agency ? agencyNames(agency.name).short : slug;
}
