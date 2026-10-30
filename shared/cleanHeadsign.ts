/**
 * MiWay express routes encode direction + route name in trip_headsign, not a terminal.
 * e.g. "135 E Express Eglinton Exp", "101 W Express Dundas Exp"
 */
export function isMiwayExpressHeadsign(headsign: string): boolean {
  const h = headsign.trim();
  return /^\d+\s+(?:[NSEW]\s+)?Express\s+.+\s+Exp$/i.test(h);
}

/**
 * Shared headsign cleaning for pipeline (GeoJSON properties) and frontend (route panel).
 * Keep all stripping rules here so build-time and render-time labels stay in sync.
 *
 * Agency-specific quirks are noted inline. General rules apply across all feeds.
 * If an agency needs a targeted override that can't be expressed as a general rule,
 * add it to index.json (excludeRouteShortNames, etc.) and document it in CLAUDE.md.
 */
export function cleanHeadsign(
  headsign: string,
  shortName: string | null = null,
  longName: string | null = null,
): string {
  let h = headsign;

  if (isMiwayExpressHeadsign(h)) return '';

  // NJ Transit appends fare instructions to trip headsigns (e.g. "-Exact Fare").
  // This is not part of the destination and should not appear in route cards.
  h = h.replace(/\s*-\s*Exact Fare\s*$/i, '');

  // REM (Montreal): branch prefixes like "A3 - Anse-à-l'Orme"
  h = h.replace(/^A[0-9]+\s*-\s*/i, '');

  if (shortName) {
    const escaped = shortName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // Strip route short name repeated at the start of the headsign (common in many feeds). A numbered route may carry a
    // one- or two-letter variant ("54S Lawrence East Short Turn"); the prefix must end the word, so a destination that only
    // starts with the route's number or letter keeps it ("12th Street", "AMERICAN CENTER", "211", #1139).
    const variant = /\d$/.test(shortName) ? '(?!(?:st|nd|rd|th)\\b)[A-Za-z]{0,2}' : '';
    h = h.replace(new RegExp(`^${escaped}${variant}(?:\\s+|\\s*-\\s*|$)`), '');
    // Zero-padded numeric short names: DART route "005" writes its headsigns as "5 LOVE FIELD AIRPORT" (#1098).
    // The card title already drops the zeros (routeLabelParts), so match the unpadded number when it stands alone.
    const unpadded = /^0+\d+$/.test(shortName) ? shortName.replace(/^0+/, '') : '';
    if (unpadded) h = h.replace(new RegExp(`^${unpadded}(?:\\s+|\\s*-\\s*)(?=\\S)`), '');
    if (longName) {
      const escapedL = longName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      // "1 Main St towards Downtown" → "Downtown"
      h = h.replace(new RegExp(`^${escaped}\\s+${escapedL}\\s+(?:towards|to)\\s+`, 'i'), '');
      h = h.replace(new RegExp(`^${escapedL}\\s+(?:towards|to)\\s+`, 'i'), '');
    }
    h = h.replace(new RegExp(`^${escaped}\\s+(?:towards|to)\\s+`, 'i'), '');
  }

  // Calgary Transit MAX routes repeat the service brand in every headsign
  // (e.g. "MAX GREEN CITY CENTRE"). The route long name starts with the same
  // two-word brand, so keep only the actual terminal.
  const maxBrand = longName?.match(/^(MAX\s+\w+)/i)?.[1];
  if (maxBrand) {
    const escapedBrand = maxBrand.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    h = h.replace(new RegExp(`^${escapedBrand}\\s+`, 'i'), '');
  }

  // MVTA 4FUN: "4FUN East to MOA/MSP", "4FUN West to Marschall Road TS"
  h = h.replace(/^4FUN\s+(?:East|West)\s+(?:Mystic Lake\s+to\s+)?/i, '');
  h = h.replace(/^4FUN\s+(?:East|West)\s+to\s+/i, '');

  // Generic branch/direction prefix: DRT "A - ", GO Transit "KI - ", TTC "East - ". Without a space at the dash only a
  // code in capitals or digits is a prefix (Madison "601-SYCAMORE", Metlink "WELL-Express"); a word in a hyphenated
  // place name stays: REM "Bois-Franc" read "Franc", and "Saint-Jérôme", "Kippa-Ring" lost their first word (CIV-1146).
  h = h.replace(/^(?:[A-Za-z0-9]{1,5}(?:\s+-\s*|-\s+)|[A-Z0-9]{1,5}-)/, '');

  // Strip orphaned leading dash after branch/route-name prefix removal
  // e.g. "Gold Line - 8th & K Only" → (after stripping "Gold Line ") → "- 8th & K Only"
  h = h.replace(/^-\s+/, '');

  // TTC subway: "Line 1 (Yonge-University) towards Vaughan" → "Vaughan"
  h = h.replace(/^Line\s+\d+\s*\([^)]+\)\s+towards\s+/i, '');

  // Strip motion-state prefixes that agencies use instead of destination names.
  // "towards/to" — ubiquitous. "arriving" — Mountain Metro (Colorado Springs) uses
  // "Arriving Downtown" / "Arriving Manitou Springs" as headsigns; prefixing "to"
  // would produce "to Arriving Downtown", so strip it here first.
  h = h.replace(/^(?:towards|to|arriving)\s+/i, '');

  // TTC express headsigns: "960b Steeles West Express Towards Finch Station Via Pioneer Village Station"
  // → "Finch via Pioneer Village"
  // Only strip "Express" when it immediately precedes "Towards/To" — preserves "All Day Express" etc.
  h = h.replace(/\bExpress\b\s+(?=(?:towards|to)\s)/gi, '');
  const ttcMatch = h.match(/(?:Towards|To)\s+(.+?)(?:\s+Via\s+(.+))?$/i);
  if (ttcMatch) {
    const rawDest = ttcMatch[1].trim();
    let dest = rawDest.replace(/\s+Station\b/gi, '');
    // Route 68 Warden → "Warden Station" must not collapse to bare long name "Warden".
    if (longName && dest.toLowerCase() === longName.toLowerCase().trim() && /\s+Station\b/i.test(rawDest)) {
      dest = rawDest;
    }
    let via = ttcMatch[2] ? ttcMatch[2].trim().replace(/\s+Station\b/gi, '') : '';
    h = dest;
    if (via) h += ' via ' + via;
  }
  // TTC: trailing compass suffix "- Nb", "- Sb" etc.
  h = h.replace(/\s+-\s+[NSEW]b$/i, '');
  // Trailing stop number/comma junk common in US feeds
  h = h.replace(/,\s+\d+.*$/i, '');
  h = h.replace(/,/g, '');

  // A lone slash with a space after it but not before joins two names: DART "INWOOD/ LOVE FIELD STATION" (#1098).
  // Evenly spaced "TC / MLK JR STATION" and headsigns with several slashes (lists of streets) are left alone.
  if ((h.match(/\//g) ?? []).length === 1) h = h.replace(/(\S)\/\s+(?=\S)/, '$1/');

  // exo / STM Montreal buses: headsigns sometimes include "Destination" as a literal word
  h = h.replace(/\bDestination\b/gi, '');

  // REM: normalize station name fragments that survive stripping back to canonical form
  const remNames: Record<string, string> = {
    'brossard': 'Brossard',
    'orme': "Anse-à-l'Orme",
    'deux-montagnes': 'Deux-Montagnes',
    'montagnes': 'Deux-Montagnes',
  };
  let lowerH = h.toLowerCase();
  for (const [key, full] of Object.entries(remNames)) {
    if (lowerH.includes(key)) {
      h = full;
      break;
    }
  }

  // Known same-destination headsign variants where the source feed itself is inconsistent,
  // found via route-report --live triage before a France candidate's real launch:
  //   Lyon (TCL) ZI8: "Parc des Lumieres" (no accent) carries no real stop_times (0 stops,
  //     null headway) -- an orphaned duplicate of the real "Parc des Lumières 1" pattern.
  //   Nice (Lignes d'Azur) 69: "Leï Feirriero" / "Lei Feirrièro" -- same Niçard terminus,
  //     inconsistent accent placement between trips.
  //   TBM (Bordeaux), le Mans (SETRAM), Izilo (Lorient), Qub (Quimper): source feeds publish
  //     both an ALL-CAPS/no-accent internal stop code and a properly-cased display name for
  //     the same destination on different trips of the same route+direction. Confirmed a group
  //     pattern (4 independent feeds), not a one-off -- canonical form is always the non-caps,
  //     accented variant. Two other flagged pairs were checked and are NOT duplicates (left
  //     alone): Orléans' "Quai C/D/E" are genuinely different platforms, and Saint-Nazaire's
  //     "Redon"/"Besné" are different real origin towns -- both just have low edit distance.
  const knownHeadsignAliases: Record<string, string> = {
    'SAINTE CATHERINE': 'Sainte Catherine',
    'DE GARONNE': 'de la Garonne',
    'GARE DE BEGLES': 'Gare de Bègles',
    'BOUSCAT HIPPODROME': 'LE BOUSCAT Hippodrome',
    'MERIGNAC LY. DAGUIN': 'MERIGNAC Lycée Daguin',
    'LORMONT BUTTINIERE': 'LORMONT Buttinière',
    'ST LOUIS BELLE RIVE': 'SAINT LOUIS Belle Rive',
    'VILLENAVE PYRENEES': 'VILLENAVE Pyrénées',
    'GRADIGNAN ST. ORNON': 'GRADIGNAN Stade Ornon',
    'BORDEAUX REPUBLIQUE': 'BORDEAUX République',
    'REPUBLIQUE': 'République',
    'Parc des Exposition': 'Parc des Expositions',
    'Ste Catherine': 'Sainte Catherine',
    'Z.A. Petit Guelen': 'Petit Guelen',
    'Parc des Lumieres': 'Parc des Lumières 1',
    'Leï Feirriero': 'Lei Feirrièro',
    'ST MEDARD GALAXIE': 'SAINT MEDARD Galaxie',
    'MERIGNAC AEROPORT': 'MERIGNAC Aéroport',
    'AEROPORT': 'Aéroport',
  };
  if (h in knownHeadsignAliases) h = knownHeadsignAliases[h];

  return h.trim();
}
