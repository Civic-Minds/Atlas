/**
 * The app's one number format (CIV-1587; docs/style/TEXT.md "Numbers"): counts with a comma every three digits
 * ("1,234"), shares as whole percents ("12%"), and a real minus sign (−) on negatives. Every count, percent and decimal
 * figure the UI shows comes from here; minutes come from headwayText.ts and liveFormat.ts, times from timeText.ts,
 * dates from dateText.ts. Machine values (coordinates in links and reports) are not UI numbers and keep toFixed.
 */

const grouped = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });

const minus = (text: string): string => text.replace('-', '−');

/** "1,234": a count, rounded to a whole number, with a comma every three digits, the same in every browser language. */
export const countText = (n: number): string => minus(grouped.format(Math.round(n) || 0));

const SMALL_NUMBER_WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
/** "five": a small count (up to ten) written as a word, as in a caption; larger counts as countText. */
export const countWord = (n: number): string => SMALL_NUMBER_WORDS[n] ?? countText(n);

/** "5.3": a figure to a fixed number of decimals, keeping a trailing zero ("5.0") so a column reads at one precision. */
export const decimalText = (x: number, digits: number): string => minus(x.toFixed(digits));
/** A machine value (a map view in the address bar) rounded to `places` decimals, as a number: Number(x.toFixed(places)). */
export const roundTo = (x: number, places: number): number => Number(x.toFixed(places));

/** "12%": a share (0–1) as a whole percent. The one writer of a whole-percent figure. */
export const percentText = (share: number): string => `${countText(Math.round(share * 100))}%`;

/**
 * "99.9%", "99.0%": a share to a tenth of a percent (service delivered), rounded down so a route that missed trips never
 * reads 100%. Always one decimal, so "99.4%" beside last week's "99.0%" reads as the same precision (#1472); only a full
 * 100% drops it. The 1e-9 keeps float error from dropping an exact share a step (0.57 * 1000 = 569.99…).
 */
export const percentTenthText = (share: number): string => {
  const t = Math.floor(share * 1000 + 1e-9) / 10;
  return t >= 100 ? '100%' : `${decimalText(t, 1)}%`;
};

/** "+12%", "−4%", "0%": a change in share; a change that rounds to 0 has no sign. */
export const signedPercentText = (change: number): string => {
  const r = Math.round(change * 100);
  return `${r > 0 ? '+' : r < 0 ? '−' : ''}${Math.abs(r)}%`;
};
