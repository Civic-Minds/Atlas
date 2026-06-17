export function cleanHeadsign(headsign: string, shortName: string | null, longName: string | null): string {
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
  h = h.replace(/^(?:towards|to)\s+/i, '');
  h = h.replace(/\s+-\s+[NSEW]b$/i, '');
  h = h.replace(/,\s+\d+.*$/i, '');
  const lowerH = h.toLowerCase().trim();
  if (longName && lowerH === longName.toLowerCase().trim()) return '';
  if (shortName && longName && lowerH === `${shortName.toLowerCase()} ${longName.toLowerCase()}`.trim()) return '';
  return h.trim();
}

const TRANSIT_ACRONYMS: Record<string, string> = {
  Go: 'GO',
  Dc: 'DC',
  Yrt: 'YRT',
  Ttc: 'TTC',
  Hsr: 'HSR',
  Grt: 'GRT',
  Brt: 'BRT',
  Lrt: 'LRT',
};

// Articles/prepositions that stay lowercase unless they open the string
const KEEP_LOWER = /^(of|to|the|a|an|and|or|in|at|by|for)$/i;

export function titleCase(s: string): string {
  return s
    .toLowerCase()
    .replace(/\b\w+/g, (word, offset) =>
      offset > 0 && KEEP_LOWER.test(word) ? word : word.replace(/^\w/, c => c.toUpperCase())
    )
    .replace(/\b(Go|Dc|Yrt|Ttc|Hsr|Grt|Brt|Lrt)\b/g, m => TRANSIT_ACRONYMS[m] ?? m);
}
