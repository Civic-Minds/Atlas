export { cleanHeadsign, formatRemDisplay, getRouteLabel } from '../../shared/cleanHeadsign';

const TRANSIT_ACRONYMS: Record<string, string> = {
  Go: 'GO',
  Dc: 'DC',
  Yrt: 'YRT',
  Ttc: 'TTC',
  Hsr: 'HSR',
  Grt: 'GRT',
  Brt: 'BRT',
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
};

// Articles/prepositions that stay lowercase unless they open the string
const KEEP_LOWER = /^(of|to|the|a|an|and|or|in|at|by|for|via)$/i;

export function fmtHeadway(minutes: number): string {
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

export function shortenAgencyName(name: string): string {
  const lower = name.toLowerCase();
  if (lower.includes('ac transit')) return 'AC Transit';
  if (lower.includes('sfmta') || lower.includes('muni')) return 'SFMTA';
  if (lower.includes('bart')) return 'BART';
  if (lower.includes('caltrain')) return 'Caltrain';
  if (lower.includes('samtrans')) return 'SamTrans';
  if (lower.includes('vta')) return 'VTA';
  if (lower.includes('weta')) return 'WETA';
  if (lower.includes('county connection')) return 'County Connection';
  if (lower.includes('westcat')) return 'WestCAT';
  if (lower.includes('soltrans')) return 'SolTrans';
  if (lower.includes('marin transit')) return 'Marin Transit';
  if (lower.includes('golden gate')) return 'Golden Gate Transit';
  if (lower.includes('smart') && lower.includes('sonoma')) return 'SMART';
  if (lower.includes('mountain metropolitan')) return 'Mountain Metro';
  
  // General fallback: use parenthetical if short abbrev; otherwise strip long (City/Region) parens for compact display
  const match = name.match(/\(([^)]+)\)/);
  if (match) {
    const abbrev = match[1].trim();
    if (abbrev.length <= 10) return abbrev;
    // Strip long locator parens (e.g. "(Colorado Springs)", "(Mississauga)")
    return name.replace(/\s*\([^)]+\)\s*$/, '').trim();
  }
  
  return name;
}
