/**
 * Shared headsign cleaning for pipeline (GeoJSON properties) and frontend (route panel).
 * Keep all stripping rules here so build-time and render-time labels stay in sync.
 */
export function cleanHeadsign(
  headsign: string,
  shortName: string | null = null,
  longName: string | null = null,
): string {
  let h = headsign;

  // REM branch prefixes (headsigns like "A3 - Anse-à-l'Orme")
  h = h.replace(/^A[0-9]+\s*-\s*/i, '');

  if (shortName) {
    const escaped = shortName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    h = h.replace(new RegExp(`^${escaped}[A-Za-z0-9]*\\s*(?:-\\s*)?`, 'i'), '');
    if (longName) {
      const escapedL = longName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      h = h.replace(new RegExp(`^${escaped}\\s+${escapedL}\\s+(?:towards|to)\\s+`, 'i'), '');
      h = h.replace(new RegExp(`^${escapedL}\\s+(?:towards|to)\\s+`, 'i'), '');
    }
    h = h.replace(new RegExp(`^${escaped}\\s+(?:towards|to)\\s+`, 'i'), '');
  }

  // Generic branch/direction prefix (DRT "A - ", GO "KI - ", TTC "East - ")
  h = h.replace(/^(?:[A-Za-z0-9]{1,5}|East|West|North|South)\s*-\s*/i, '');

  // TTC subway pattern: "Line 1 (Yonge-University) towards …"
  h = h.replace(/^Line\s+\d+\s*\([^)]+\)\s+towards\s+/i, '');

  h = h.replace(/^(?:towards|to)\s+/i, '');

  // TTC express headsigns like "960b Steeles West Express Towards Finch Station Via Pioneer Village Station"
  // -> "Finch via Pioneer Village"
  h = h.replace(/\bExpress\b/gi, '');
  const ttcMatch = h.match(/(?:Towards|To)\s+(.+?)(?:\s+Via\s+(.+))?$/i);
  if (ttcMatch) {
    let dest = ttcMatch[1].trim().replace(/\s+Station\b/gi, '');
    let via = ttcMatch[2] ? ttcMatch[2].trim().replace(/\s+Station\b/gi, '') : '';
    h = dest;
    if (via) h += ' via ' + via;
  }
  h = h.replace(/\s+-\s+[NSEW]b$/i, '');
  h = h.replace(/,\s+\d+.*$/i, '');
  h = h.replace(/,/g, '');

  // Long descriptive headsign cleanup (common in exo/Montreal buses/trains)
  h = h.replace(/\bDestination\b/gi, '');

  // REM specific full station names (after all stripping, fix any mangled abbreviations/casing)
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

export function getRouteLabel(shortName: string | null | undefined, longName: string | null | undefined, agencyName?: string): string {
  if (!shortName) return longName || '';

  const rem = formatRemDisplay(shortName, longName);
  if (rem && rem !== shortName) return rem;

  if (!longName) return shortName;

  let cleanedLong = longName;

  // STM metro: "Ligne 5 - Bleue" -> "Bleue"
  if ((agencyName && /stm/i.test(agencyName)) || /^Ligne\s+\d/i.test(longName)) {
    cleanedLong = longName.replace(/^Ligne\s+\d+\s*-\s*/i, '').trim();
  }

  // General: strip if longName basically repeats the short or "route X"
  const lowerLong = cleanedLong.toLowerCase();
  const lowerShort = shortName.toLowerCase();
  if (lowerLong === `route ${lowerShort}` || lowerLong === lowerShort || lowerLong.includes(lowerShort + ' ')) {
    return shortName;
  }

  if (!cleanedLong) return shortName;

  // Pure-letter short names (e.g. "LW", "LE", "KI") are acronyms of the long name — redundant to show both.
  if (/^[A-Za-z]+$/.test(shortName)) return cleanedLong;

  return `${shortName} — ${cleanedLong}`;
}
