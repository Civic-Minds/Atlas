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

  // REM (Montreal): branch prefixes like "A3 - Anse-à-l'Orme"
  h = h.replace(/^A[0-9]+\s*-\s*/i, '');

  if (shortName) {
    const escaped = shortName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // Strip route short name repeated at the start of the headsign (common in many feeds)
    h = h.replace(new RegExp(`^${escaped}[A-Za-z0-9]*\\s*(?:-\\s*)?`), '');
    if (longName) {
      const escapedL = longName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      // "1 Main St towards Downtown" → "Downtown"
      h = h.replace(new RegExp(`^${escaped}\\s+${escapedL}\\s+(?:towards|to)\\s+`, 'i'), '');
      h = h.replace(new RegExp(`^${escapedL}\\s+(?:towards|to)\\s+`, 'i'), '');
    }
    h = h.replace(new RegExp(`^${escaped}\\s+(?:towards|to)\\s+`, 'i'), '');
  }

  // MVTA 4FUN: "4FUN East to MOA/MSP", "4FUN West to Marschall Road TS"
  h = h.replace(/^4FUN\s+(?:East|West)\s+(?:Mystic Lake\s+to\s+)?/i, '');
  h = h.replace(/^4FUN\s+(?:East|West)\s+to\s+/i, '');

  // Generic branch/direction prefix: DRT "A - ", GO Transit "KI - ", TTC "East - "
  h = h.replace(/^(?:[A-Za-z0-9]{1,5}|East|West|North|South)\s*-\s*/i, '');

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

  return h.trim();
}

/**
 * For REM, turn cryptic "A3-A1" + long name into something readable.
 * Example: "A3-A1 Anse-à-l'Orme – Brossard"
 */
export function formatRemDisplay(shortName: string | null | undefined, longName: string | null | undefined): string {
  if (!shortName) return '';
  if (!/^A[0-9]/.test(shortName) || !longName) return shortName;

  // longName e.g. "A3 - Anse-à-l'Orme / A1 - Brossard"
  const parts = longName.split(/\s*\/\s*/);
  if (parts.length === 2) {
    const t1 = parts[0].replace(/^A[0-9]\s*-\s*/, '').trim();
    const t2 = parts[1].replace(/^A[0-9]\s*-\s*/, '').trim();
    return `${shortName} — ${t1} / ${t2}`;
  }
  // fallback
  const cleaned = longName.replace(/A[0-9]\s*-\s*/g, '').replace(/\s*\/\s*/g, ' / ');
  return `${shortName} — ${cleaned}`;
}

export function getRouteLabel(shortName: string | null | undefined, longName: string | null | undefined, agencyName?: string | null): string {
  // Some French feeds (e.g. Divia/Dijon) encode bidirectional termini in route_long_name
  // as literal "<>" ("Longvic <> Toison D'or") — render as a proper arrow, not raw brackets.
  if (longName) longName = longName.replace(/\s*<>\s*/g, ' ↔ ');

  // A route with 3+ termini (2+ arrows) reliably overflows the card title's 2-line clamp
  // and gets cut off mid-word (STAR Rennes 12: "...↔ Saint-Grégoire ↔ Rennes (La..."). Keep
  // just the first and last terminus — the through-route endpoints — and drop the middle
  // via-point(s) from the title; the full stop-by-stop path is still on the map itself.
  if (longName && longName.split(' ↔ ').length > 2) {
    const parts = longName.split(' ↔ ');
    longName = `${parts[0]} ↔ ${parts[parts.length - 1]}`;
  }

  // SMART Train (Sonoma-Marin): long name is just "Main Line", combine with agency name
  if (agencyName && /smart/i.test(agencyName) && longName && /Main Line/i.test(longName)) {
    return 'SMART Train';
  }

  if (!shortName) return longName || '';

  // Clean leading zeros from shortName
  const cleanShort = shortName.length > 1 && shortName.startsWith('0') && /^\d+$/.test(shortName)
    ? shortName.replace(/^0+/, '')
    : shortName;

  const rem = formatRemDisplay(cleanShort, longName);
  if (rem && rem !== cleanShort) return rem;

  if (!longName) return cleanShort;

  // Branded corridor list: "4FUN: Shakopee-Savage-Burnsville-MOA-MSP" → "495 — 4FUN"
  const brandPrefix = longName.match(/^([A-Za-z0-9]+):\s*.+$/);
  if (brandPrefix && brandPrefix[1].toUpperCase() === brandPrefix[1] && brandPrefix[1].length <= 8) {
    return `${cleanShort} — ${brandPrefix[1]}`;
  }

  // HRT 757X etc.: public brand in long_name; short_name is internal (967).
  const brand = longName.match(/^(\d{3}X)\b/i);
  if (brand && /^\d+$/.test(cleanShort)) return brand[1].toUpperCase();

  let cleanedLong = longName;

  // STM metro: "Ligne 5 - Bleue" → "Bleue"
  if ((agencyName && /stm/i.test(agencyName)) || /^Ligne\s+\d/i.test(longName)) {
    cleanedLong = longName.replace(/^Ligne\s+\d+\s*-\s*/i, '').trim();
  }

  // Strip trailing " Via [location]" routing qualifiers — not part of the route name.
  // "Royal Oak Exch / Downtown Via Royal Oak" → "Royal Oak Exch / Downtown"
  cleanedLong = cleanedLong.replace(/\s+via\s+.+$/i, '').trim();

  // Suppress longName if it basically repeats the shortName or says "Route X"
  const lowerLong = cleanedLong.toLowerCase();
  const lowerShort = cleanShort.toLowerCase();
  // Normalize dashes so "G Line" matches "G-Line Rapid Ride"
  const normLong = lowerLong.replace(/-/g, ' ').replace(/\s+/g, ' ').trim();
  const normShort = lowerShort.replace(/-/g, ' ').replace(/\s+/g, ' ').trim();
  if (lowerLong === `route ${lowerShort}` || lowerLong === lowerShort || normLong.startsWith(normShort + ' ') || lowerLong.includes(lowerShort + ' ')) {
    return cleanShort;
  }

  if (!cleanedLong) return cleanShort;

  // Pure-letter short names (e.g. "LW", "LE", "KI") are acronyms of the long name — redundant to show both
  if (/^[A-Za-z]+$/.test(cleanShort)) return cleanedLong;

  return `${cleanShort} — ${cleanedLong}`;
}
