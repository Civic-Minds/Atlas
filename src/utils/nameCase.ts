/**
 * The one module that cases stop, place and route names (CIV-1001). Every caller goes through nameCase with a mode:
 * - 'title': rewrite the whole name in title case, whatever the feed sent ("at The Esplanade" -> "at the Esplanade").
 *   No surface uses it: every name follows the feed-capitals rule below (Ryan, CIV-1001); the other two modes build on it.
 * - 'stop': stop and destination names; cased only when the feed sent them in capitals (CIV-935).
 * - 'route': one part of a route label; the stop rule plus the route-name acronyms (ROUTE_NAME_ACRONYMS).
 */
export type NameCaseMode = 'title' | 'stop' | 'route';

export function nameCase(text: string, mode: NameCaseMode): string {
  return mode === 'title' ? titleCase(text) : mode === 'stop' ? stopNameCase(text) : routeLabelCase(text);
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
  // CIV-984: acronyms in all-caps route names across the feeds (colleges, hospitals, places, services), which title case read as
  // words ("USI" -> "Usi"). Abbreviations of words (ST, RD, BLVD, MTN, PKWY) and brand words (DASH, VIVA) are left to title case.
  'USI', 'UIS', 'UVU', 'UVX', 'BYU', 'NSU', 'OSU', 'UCF', 'UCSB', 'UCCS', 'CSULB', 'USM', 'UTD', 'OCCC', 'LLCC', 'SFCC', 'NRCC', 'GRCC',
  'NCC', 'TCC', 'FLC', 'KJHS', 'CGHS', 'HSC', 'TMC', 'RRMC', 'RVH', 'NRGH', 'RCMP', 'SBS', 'PCH', 'VRE', 'ORBT', 'TRAX', 'DART',
  'SLO', 'OIA', 'BDO', 'GOG', 'FPL', 'HTC', 'DNTC', 'PNR', 'WCWS', 'CCX', 'CGP', 'ATC', 'CIC', 'URP', 'XP', 'SR', 'VB', 'NN', 'WP', 'WC', 'MC',
];

// Articles/prepositions that stay lowercase unless they open the string
const KEEP_LOWER = /^(of|to|the|a|an|and|or|in|at|by|for|via)$/i;
/** Names where "D'" is part of a surname, not a French "de": "D'Arcy" (CIV-1054). */
const SURNAME_ELISIONS = /^arcy(?!\p{L})/iu;

function titleCase(s: string): string {
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

  // A mixed-case input's own capital elisions before a mixed-case word ("Thomas D'Arcy") stay capital (CIV-1054).
  const capitalElisions = new Set<number>();
  if (/\p{Ll}/u.test(s)) for (const m of s.matchAll(/[DL]'\p{Lu}\p{Ll}/gu)) capitalElisions.add(m.index!);

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
    // French elision: "D'ANDROMÈDE" -> "d'Andromède", "L'ACADIE" -> "L'Acadie" at the start (CIV-1054). It keeps its
    // capital after a hyphen ("Lucien-L'Allier"), in a surname ("D'Arcy"), and wherever a mixed-case input wrote it so.
    .replace(/(^|[^\p{L}'])([dl])'(\p{L})/giu, (m: string, pre: string, el: string, c: string, offset: number, str: string) => {
      const at = offset + pre.length;
      const keepCapital = !pre || pre === '-' || SURNAME_ELISIONS.test(str.slice(at + 2)) || capitalElisions.has(at);
      return `${pre}${keepCapital ? el.toUpperCase() : el.toLowerCase()}'${c.toUpperCase()}`;
    })
    // French linking words inside a hyphenated name stay small: "Arc-En-Ciel" -> "Arc-en-Ciel" (CIV-1054).
    .replace(/(?<=\p{L}-)(De|Du|Des|La|Le|Les|En|Sur|Aux|Au|Et)(?=-\p{L})/gu, (w: string) => w.toLowerCase())
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
function stopNameCase(name: string): string {
  return writtenInCapitals(name) ? keepFeedCodes(name, keepFeedParticles(name, titleCase(name))) : name;
}

/**
 * Road and route codes keep the feed's capitals: a word with a digit in it ("US-9W", "SR-7", "CR-527", "A1A", "418X"),
 * except an ordinal, which reads "3rd" (CIV-1166).
 */
function keepFeedCodes(original: string, cased: string): string {
  if (cased.length !== original.length) return cased;
  let out = cased;
  const keep = (at: number, word: string) => { out = out.slice(0, at) + word + out.slice(at + word.length); };
  const isCode = (word: string) => /\p{N}/u.test(word) && !/^\d+(st|nd|rd|th)$/iu.test(word);
  for (const m of original.matchAll(/[\p{L}\p{N}]+/gu)) {
    const word = m[0], at = m.index!;
    // A code, or a short road prefix joined to one ("US" in "US-9W", "I" in "I-70"; not "KING" in "KING-2").
    const next = /^-([\p{L}\p{N}]+)/u.exec(original.slice(at + word.length));
    if (isCode(word) || (next && isCode(next[1]) && /^\p{L}{1,3}$/u.test(word))) keep(at, word);
  }
  return out;
}

/**
 * French linking words a feed writes in lower case inside an otherwise all-capitals name: STO's
 * "SAINT-LOUIS/de NANTEL", "des ALLUMETTIÈRES/BROAD" (CIV-1054). Kept exactly as the feed wrote them.
 */
const LOWER_PARTICLES = /^(de|du|des|la|le|les|d|l|et|à|au|aux|sur|en)$/u;

/**
 * English connectors a feed writes in lower case inside an otherwise all-capitals name: Hamilton's "STERLING at HADDON", "ABERDEEN opposite CHEDOKE", "At 100 MACKLIN"
 * (CIV-1166). They don't stop the name counting as capitals, and stay as the feed wrote them ("to LAKE DR" -> "to Lake Dr").
 */
const LOWER_CONNECTORS = /^(at|and|of|to|the|or|in|by|for|via|on|opposite|near|after|before)$/u;
/** A connector as the feed wrote it: all small, or with only its first letter capital ("At 100 MACKLIN"). */
const isConnector = (word: string) => LOWER_CONNECTORS.test(word.toLowerCase()) && word.slice(1) === word.slice(1).toLowerCase();

/**
 * True when the feed wrote the name in capitals: it has a capital, and every word with a small letter is one of the
 * lower-case linking words or connectors above. Accented capitals count as capitals ("SPORTHÈQUE"). Shared by the stop and route
 * casing (CIV-1001).
 */
export function writtenInCapitals(text: string): boolean {
  if (!text || !/\p{Lu}/u.test(text)) return false;
  let capitalsWord = false;
  for (const word of text.match(/\p{L}+/gu) ?? []) {
    if (!/\p{Ll}/u.test(word)) { if (word.length > 1) capitalsWord = true; continue; }
    if (!(word === word.toLowerCase() && LOWER_PARTICLES.test(word)) && !isConnector(word)) return false;
  }
  // Needs a real word in capitals: a capitalised connector beside initials ("At", "U Of A") is not a name sent in capitals.
  return capitalsWord;
}

/** After casing, the linking words and connectors the feed wrote in lower case stay as written ("Saint-Louis/de Nantel"). */
function keepFeedParticles(original: string, cased: string): string {
  // Casing keeps each letter in place; if a rule ever changes the length, keep its result as it is.
  if (cased.length !== original.length) return cased;
  let out = cased;
  for (const m of original.matchAll(/\p{L}+/gu)) {
    const word = m[0];
    if (word === word.toLowerCase() && (LOWER_PARTICLES.test(word) || LOWER_CONNECTORS.test(word))) {
      out = out.slice(0, m.index) + word + out.slice(m.index! + word.length);
    }
  }
  return out;
}

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
function routeLabelCase(part: string): string {
  if (!writtenInCapitals(part)) return part;
  // "O'BRIEN": titleCase lowercases the letter after an apostrophe ("O'brien"); an Irish O' name keeps the capital.
  return keepFeedParticles(part, titleCase(part))
    .replace(/(^|[^\p{L}])O'(\p{L})/gu, (_, pre: string, c: string) => `${pre}O'${c.toUpperCase()}`)
    .replace(/[\p{L}\p{N}]+/gu, (tok: string) => {
      const up = tok.toUpperCase();
      if (ROUTE_NAME_ACRONYMS.has(up)) return up;
      if (/^\d+(st|nd|rd|th)$/i.test(tok)) return tok.toLowerCase();
      // A route code with a digit ("sl1" after titleCase lowered it) is a code, not a word.
      return /\d/.test(tok) ? up : tok;
    });
}
