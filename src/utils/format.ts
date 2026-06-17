export { cleanHeadsign } from '../../shared/cleanHeadsign';

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

export function titleCase(s: string): string {
  return s
    .toLowerCase()
    .replace(/\b\w+/g, (word, offset) =>
      offset > 0 && KEEP_LOWER.test(word) ? word : word.replace(/^\w/, c => c.toUpperCase())
    )
    .replace(/\b(Go|Dc|Yrt|Ttc|Hsr|Grt|Brt|Lrt|Nfta|Ltc|Ktc)\b/g, m => TRANSIT_ACRONYMS[m] ?? m);
}
