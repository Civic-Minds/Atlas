/** The longest last word that is kept with the word before it ("Ctr", "Stn", "Rd", "Loop"). */
const SHORT_WORD = 4;

/**
 * CIV-1465 (Ryan): a wrapped name never leaves a short last word alone on its second line ("to Irvington via Pru" /
 * "Ctr"): the last two words are joined with a no-break space, so they wrap together. A longer last word may still wrap
 * alone. One rule for the route card rows and the route lists.
 */
export function keepLastWord(text: string): string {
  const at = text.lastIndexOf(' ');
  if (at <= 0) return text;
  const last = text.slice(at + 1);
  return last.length > 0 && last.length <= SHORT_WORD && text.slice(0, at).includes(' ') ? `${text.slice(0, at)} ${last}` : text;
}
