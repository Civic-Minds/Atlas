/**
 * CIV-1103 (draft, waits on Ryan's OK): an agency's name inside a sentence. A name takes "The" when its last word
 * names an organization (the Toronto Transit Commission, the Utah Transit Authority); brands, acronyms and names
 * ending in Transit, Metro, Bus and the like never do (GO Transit, MBTA, MiWay). A name already starting with "The"
 * keeps its own. Only for a name standing on its own (subject, possessive, after "from" or "with"); a name describing
 * a noun ("a TTC route") already has that noun's article.
 */
const TAKES_THE = /\b(Authority|Commission|District|Agency|Company|Corporation|Department|Board|Railway|Railroad|System|Service)$/;

export function agencyTakesThe(name: string): boolean {
  const n = name.trim();
  return !/^the\s/i.test(n) && TAKES_THE.test(n);
}

/** The name as it reads in a sentence: "The …" at the start, "the …" elsewhere, the bare name when it takes none. */
export function agencyInSentence(name: string, atStart = false): string {
  const n = name.trim();
  return agencyTakesThe(n) ? `${atStart ? 'The' : 'the'} ${n}` : n;
}

/** Last words that are plural nouns; brands and acronyms ending in "s" (SolTrans, CATS) are not. */
const PLURAL_LAST_WORD = /\b(Ferries|Lines|Trails|Services|Wheels)$/;

/** The possessive: a name whose last word is a plural noun takes an apostrophe only ("BC Ferries' timetable"). */
export function agencyPossessive(name: string, atStart = false): string {
  const n = agencyInSentence(name, atStart);
  return PLURAL_LAST_WORD.test(n) ? `${n}'` : `${n}'s`;
}
