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
    let dest = ttcMatch[1].trim().replace(/\s+Station\b/gi, '');
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

  // Suppress if the cleaned headsign is just the route long name (redundant)
  lowerH = h.toLowerCase().trim();
  if (longName && lowerH === longName.toLowerCase().trim()) return '';
  if (shortName && longName && lowerH === `${shortName.toLowerCase()} ${longName.toLowerCase()}`.trim()) {
    return '';
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

  // Numeric-only short names (e.g. "24") with a short place-name long name (e.g. "Shane Park")
  // are just using the terminus as the route name — not a useful descriptor alongside the number.
  // Suppress if: purely numeric + 1–2 word long name + no transit keywords.
  if (/^\d+$/.test(cleanShort)) {
    const words = cleanedLong.trim().split(/\s+/);
    const hasTransitKeyword = /\b(line|route|express|rapid|rapidride|local|limited|shuttle|bus|rail|train|metro|sky|link|station|center|centre|transit|loop|connector|crosstown|blink|zum|viva|flash|bolt|wave|pulse|boost)\b/i.test(cleanedLong);
    if (words.length <= 2 && !hasTransitKeyword) return cleanShort;
  }

  // Pure-letter short names (e.g. "LW", "LE", "KI") are acronyms of the long name — redundant to show both
  if (/^[A-Za-z]+$/.test(cleanShort)) return cleanedLong;

  return `${cleanShort} — ${cleanedLong}`;
}
