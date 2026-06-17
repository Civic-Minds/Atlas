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

  if (shortName) {
    const escaped = shortName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    h = h.replace(new RegExp(`^${escaped}[A-Za-z0-9]*\\s*[-:]\\s*`, 'i'), '');
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
  h = h.replace(/\s+-\s+[NSEW]b$/i, '');
  h = h.replace(/,\s+\d+.*$/i, '');

  const lowerH = h.toLowerCase().trim();
  if (longName && lowerH === longName.toLowerCase().trim()) return '';
  if (shortName && longName && lowerH === `${shortName.toLowerCase()} ${longName.toLowerCase()}`.trim()) {
    return '';
  }
  return h.trim();
}
