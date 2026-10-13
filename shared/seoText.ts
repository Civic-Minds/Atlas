/** Search-result text limits: titles are cut at about 60 characters, descriptions at about 155 to 160. */
export const TITLE_MAX = 60;
export const DESCRIPTION_MAX = 155;
export const DESCRIPTION_MIN = 110;

/** Cut at the last word boundary that fits, with no trailing punctuation. */
export function truncateAtWord(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max + 1);
  const at = cut.lastIndexOf(' ');
  return (at > max * 0.5 ? cut.slice(0, at) : text.slice(0, max)).replace(/[\s,;:(–-]+$/, '');
}

/** The first candidate that fits, best wording first; the last resort is cut at a word boundary. */
export function firstThatFits(candidates: readonly string[], max: number): string {
  return candidates.find(c => c.length <= max) ?? truncateAtWord(candidates[candidates.length - 1], max);
}
