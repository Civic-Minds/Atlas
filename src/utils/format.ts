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
};

// Articles/prepositions that stay lowercase unless they open the string
const KEEP_LOWER = /^(of|to|the|a|an|and|or|in|at|by|for)$/i;

export function fmtHeadway(minutes: number): string {
  if (minutes <= 60) return `every ${minutes} min`;
  const hrs = Math.round(minutes / 30) / 2;
  return `every ~${hrs}h`;
}

export function titleCase(s: string): string {
  return s
    .toLowerCase()
    .replace(/\b(\p{L}+)/gu, (fullWord, word, offset) => {
      if (offset > 0 && KEEP_LOWER.test(word)) {
        return word;
      }
      return word.replace(/^\p{L}/u, (c: string) => c.toUpperCase());
    })
    .replace(/\b(Go|Dc|Yrt|Ttc|Hsr|Grt|Brt|Lrt|Nfta|Ltc|Ktc)\b/g, m => TRANSIT_ACRONYMS[m] ?? m)
    .replace(/l'orme/gi, "l'Orme")
    .replace(/à-l'/gi, "à-l'");
}
