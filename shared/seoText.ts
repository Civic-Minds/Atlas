import { DESCRIPTION_MAX, DESCRIPTION_MIN, TITLE_MAX } from './rules/limits';

/** Search-result text limits (shared/rules/limits.ts). */
export { DESCRIPTION_MAX, DESCRIPTION_MIN, TITLE_MAX };

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
