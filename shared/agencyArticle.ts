/**
 * An agency's name inside a sentence, with "the" where it takes one (CIV-1103, docs/STYLE.md): "not reported by the TTC",
 * "not reported by MiWay". Names ending in Authority, Commission, District, Agency, Company, Corporation, Department, Board,
 * Railway, Railroad, System or Service take "the", and so do acronyms said letter by letter (the TTC, the MBTA). Acronyms
 * said as a word (MARTA, SEPTA) and brands (MiWay) don't. A name that already starts with "The" keeps it.
 *
 * The acronym lists are Ryan's approved classification (Linear CIV-1103, 2026-11-13/14; _reports/civ-1103-acronyms.md),
 * keyed by the name as shown, best guesses included. An all-caps name in no list is taken as said letter by letter.
 */
const THE_ENDINGS = /\b(Authority|Commission|District|Agency|Company|Corporation|Department|Board|Railway|Railroad|System|Service)$/i;

/** Said letter by letter, so "the" (the report's "Letter by letter" section and the unclear rows guessed as letters). */
const LETTER_BY_LETTER = new Set([
  'ATA', 'BTS', 'CDTA', 'CTA', 'Champaign-Urbana MTD', 'DCTA', 'DTA', 'EMTA', 'ETS', 'GCRTA', 'GLTC', 'Greater Dayton RTA',
  'HSR', 'JTA', 'KCATA', 'LIRR', 'LRB', 'MBTA', 'MCTS', 'MNR', 'MST', 'MTA Long Island Rail Road', 'MTA Maryland',
  'MTA NYCT Bus', 'MTA NYCT Subway', 'MTD', 'MTS', 'MTTA', 'MVTA', 'NCTD', 'NFTA', 'PRT', 'PSTA', 'PVPTA', 'PVTA', 'RCT',
  'RGRTA', 'RMTD', 'RTC', 'RTC Washoe', 'RTD Denver', 'RTL', 'RTS', 'RVTD', 'SCT', 'SJRTD', 'SMS', 'SMTD', 'STL', 'STM',
  'STO', 'STS', 'San Joaquin RTD', 'TTC', 'UTA', 'VCTC', 'VCTC Intercity', 'VRE', 'VTA', 'VVTA', 'WRTA', 'WSF', 'WSTA',
  'YCTA',
  // Still unclear, guessed letter by letter.
  'OCTA', 'AVTA', 'LADOT', 'LADOT/DASH', 'TOR',
]);

/** Said as a word, so no "the" (the "Said as a word" section and the unclear rows guessed as words). */
const SAID_AS_A_WORD = new Set([
  'ACE', 'ART', 'BART', 'BARTA', 'BUS', 'CAMBUS', 'CARTA', 'CAT', 'CATA', 'CATS', 'COAST', 'COLTS', 'COTA', 'DART', 'DASH',
  'DDOT', 'FAST', 'FAX', 'FRED', 'GET', 'HART', 'JTRAN', 'KART', 'LANTA', 'LYNX', 'MARTA', 'MATA', 'MATBUS', 'METRA', 'METS',
  'PART', 'PATH', 'REM', 'RFTA', 'RIPTA', 'SAM', 'SARTA', 'SEPTA', 'SMART', 'SORTA', 'TANK', 'TARC', 'TARTA', 'VIA', 'WETA',
  'WMATA',
  // Still unclear, guessed as a word.
  'TCAT', 'LAVTA', 'RABA', 'SLORTA', 'SMAT', 'NORTA', 'WATA', 'ECAT',
]);

/** Brands and mixed names: no "the" unless the name ends in a rule word (SunLine Transit Agency, MTA Bus Company). */
const BRANDS = new Set([
  'ABQ RIDE', 'AC Transit', 'BC Ferries', 'BC Transit', 'BeeLine', 'BurbankBus', 'C-TRAN', 'CATbus', 'CTtransit', 'CUE Bus',
  'CamTran', 'Chemung County C-TRAN', 'CityBus of Greater Lafayette', 'CityLink', 'Coast RTA', 'CobbLinc', 'CyRide',
  'DART First State', 'Davenport CitiBus', 'EZ Rider', 'FAST Transit', 'FXBGO!', 'GO Transit', 'GRTC Transit', 'GTrans',
  'GoDurham', 'GoRaleigh', 'GoTriangle', 'GreenLink', 'GroveLink', 'IndiGO', 'IndyGo', 'JFK AirTrain', 'JeffTran', 'LA Metro',
  'Lawrence Transit / KU on Wheels', 'LeeTran', 'MARC Train', 'MAX Transit', 'MET Transit', 'METRO Houston', 'MTA Bus Company',
  'Metro McAllen', 'MiWay', 'NCSU Wolfline', 'NICE Bus', 'NJ Transit', 'NYC Ferry', 'OC Transpo', 'OmniRide', 'OmniTrans',
  'PATCO Speedline', 'QLine', 'Ride CK', 'RiverCities Transit', 'RoadRUNNER Transit', 'RoundAbout', 'SLO Transit', 'STLévis',
  'SacRT', 'SamTrans', 'Santa Cruz METRO', 'Santa Rosa CityBus', 'Simcoe County LINX', 'SolTrans', 'SporTran', 'StarMetro',
  'StarTran', 'SunLine Transit Agency', 'SunRail', 'SunTran', 'The COMET', 'TheBus', 'TheRide', 'TransLink', 'TriCounty Link',
  'TriMet', 'UGA Campus Transit', 'UP Express', 'VIA Metropolitan Transit', 'VINE Transit', 'WeGo', 'WestCAT',
  // Still unclear, guessed as a brand.
  'CCTA / Green Mountain Transit',
]);

/** Names that take "the" though no rule word ends them (Ryan, CIV-1103 Q1). */
const ALSO_THE = new Set(['Staten Island Ferry', 'Cheyenne Transit Program', 'Fayetteville Area System of Transit', 'Yamhill County Transit Area']);

/** Names whose last word is a plural noun: the possessive is an apostrophe alone ("BC Ferries’ schedule"). */
const PLURAL_NAMES = new Set([
  'BC Ferries', 'Pierce County Ferries', 'Washington State Ferries', 'Montebello Bus Lines', 'Santa Fe Trails',
  'University of Michigan Transit Services', 'Lawrence Transit / KU on Wheels',
]);

/**
 * True when the name takes "the" in running text (false for a name that already starts with "The"). A page title's
 * " · qualifier" ("MTA NYCT Bus · Brooklyn") and a registry name's "(bracket)" ("Edmonton Transit Service (ETS)") are left
 * out of the decision.
 */
function takesThe(name: string): boolean {
  const n = name.split(' · ')[0].replace(/\s*\([^)]*\)\s*$/, '').trim();
  if (/^the\s/i.test(n)) return false;
  if (LETTER_BY_LETTER.has(n) || ALSO_THE.has(n)) return true;
  if (SAID_AS_A_WORD.has(n)) return false;
  if (THE_ENDINGS.test(n)) return true;
  if (BRANDS.has(n)) return false;
  return /^[A-Z]{2,}$/.test(n);
}

/** Just the article an agency name takes in running text, "the " or "", for a name shown as a link (the article stays outside it). */
export function agencyArticle(name: string): string {
  return takesThe(name) ? 'the ' : '';
}

export function agencyInSentence(name: string): string {
  const n = name.trim();
  return takesThe(n) ? `the ${n}` : n;
}

/** The same at the start of a sentence: "The TTC", "MiWay" (a name keeps its own casing). */
export function agencySentenceStart(name: string): string {
  const n = name.trim();
  return takesThe(n) ? `The ${n}` : n;
}

/**
 * The possessive in running text, with curly apostrophes (CIV-1160): "the TTC’s", "BC Ferries’", "Cherriots’s" (a singular
 * name ending in s still takes ’s). A slash name uses its first name: "Lawrence Transit’s".
 */
export function agencyPossessive(name: string): string {
  const n = name.trim();
  const own = n.includes('/') ? n.split('/')[0].trim() : n;
  return `${agencyInSentence(own)}${PLURAL_NAMES.has(own) ? '’' : '’s'}`;
}

/** The possessive at the start of a sentence: "The TTC’s schedule ended…". */
export function agencyPossessiveSentenceStart(name: string): string {
  const p = agencyPossessive(name);
  return p.startsWith('the ') ? `The ${p.slice(4)}` : p;
}
