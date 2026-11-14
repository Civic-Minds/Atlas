/**
 * An agency's name inside a sentence, with "the" where it takes one (CIV-1103, docs/STYLE.md): "not reported by the TTC",
 * "not reported by MiWay". Names ending in Authority, Commission, District, Agency, Company, Corporation, Department, Board,
 * Railway, Railroad, System or Service take "the", and so do acronyms said letter by letter (the TTC, the MBTA). Acronyms
 * said as a word (MARTA, SEPTA) and brands (MiWay) don't. A name that already starts with "The" keeps it.
 */
const THE_ENDINGS = /\b(Authority|Commission|District|Agency|Company|Corporation|Department|Board|Railway|Railroad|System|Service)$/i;
/** Acronyms said as a word, so no "the" (STYLE.md names these two). */
const SAID_AS_A_WORD = new Set(['MARTA', 'SEPTA']);

export function agencyInSentence(name: string): string {
  const n = name.trim();
  if (/^the\s/i.test(n)) return n;
  const acronym = /^[A-Z]{2,}$/.test(n) && !SAID_AS_A_WORD.has(n);
  return acronym || THE_ENDINGS.test(n) ? `the ${n}` : n;
}
