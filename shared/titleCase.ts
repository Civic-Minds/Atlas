/**
 * Title case for titles (docs/style/VISUAL.md; Ryan, 2026-11-15): page and section headings, header and footer links,
 * footer column names and browser tab titles. Every word starts with a capital except articles, coordinating
 * conjunctions and short prepositions (TITLE_SMALL_WORDS: "a", "and", "of", "to"), which stay lowercase unless they
 * start or end the title, follow a colon or begin a hyphenated word ("On-Demand"). "Up", "off" and "so" are capitalized,
 * as they're usually adverbs in a title ("Free Up to a Set Age"). Words with a capital already (TTC, GTFS-Flex, iPhone, McAllen) keep their
 * own spelling; each part of a hyphenated word is treated as a word ("Built-In", "Wilkes-Barre"). Units after a number
 * stay as written ("15 min").
 */
export const TITLE_SMALL_WORDS: ReadonlySet<string> = new Set([
  'a', 'an', 'the', 'and', 'but', 'or', 'nor', 'for', 'as', 'at', 'by', 'in', 'of', 'on', 'per', 'to', 'via', 'vs',
]);

const UNITS = new Set(['min', 'km', 'm', 'h', 'hr', 'mi']);

export function titleCase(text: string): string {
  const words = text.split(/(\s+)/);
  const real = words.map((w, i) => (/\S/.test(w) ? i : -1)).filter(i => i >= 0);
  const firstIndex = real[0];
  const lastIndex = real[real.length - 1];
  return words.map((w, i) => {
    if (!/\S/.test(w)) return w;
    const prev = real[real.indexOf(i) - 1];
    const afterColon = prev != null && /[:?!.–—]$/.test(words[prev]);
    const afterNumber = prev != null && /\d$/.test(words[prev]);
    const edge = i === firstIndex || i === lastIndex || afterColon;
    return w.split('-').map((part, k) => {
      const m = /^([^A-Za-zÀ-ÿ]*)([A-Za-zÀ-ÿ’']+)(.*)$/.exec(part);
      if (!m) return part;
      const [, lead, word, rest] = m;
      if (/[A-Z]/.test(word)) return part;
      if (afterNumber && k === 0 && UNITS.has(word)) return part;
      if (!edge && k === 0 && !w.includes('-') && TITLE_SMALL_WORDS.has(word)) return part;
      return lead + word.charAt(0).toUpperCase() + word.slice(1) + rest;
    }).join('-');
  }).join('');
}

/** Whether text is already in title case by that rule. */
export function isTitleCase(text: string): boolean {
  return titleCase(text) === text;
}
