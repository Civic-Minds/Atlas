import { delayAmount } from './headwayText.js';

/** One rounding for minute figures on every Live surface: to a tenth of a minute, whole numbers without ".0", a real minus sign. */
export const tenth = (x: number): string => (Math.round(x * 10) / 10).toString().replace('-', '−');

/**
 * "0.9 min", "1 min", "7.5 min", "−1.2 min": the map's shared minutes format (headwayText delayAmount: whole numbers as
 * they are, others to a tenth) with a real minus sign. The one writer of a minutes figure on Live: no "+", no "½", no
 * forced ".0" (Ryan, CIV-1160 question 5, 2026-11-13).
 */
export const minutesText = (x: number): string => delayAmount(Math.round(x * 10) / 10 || 0).replace('-', '−');

/** "12%": a share as a whole percent. The one writer of a whole-percent figure on Live surfaces. */
export const pct = (x: number): string => `${Math.round(x * 100)}%`;

/**
 * "99.9%", "99.0%": a share to a tenth of a percent (service delivered), rounded down so a route that missed trips never
 * reads 100%. Always one decimal, so "99.4%" beside last week's "99.0%" reads as the same precision (#1472); only a full
 * 100% drops it. The 1e-9 keeps float error from dropping an exact share a step (0.57 * 1000 = 569.99…).
 */
export const pctTenth = (x: number): string => {
  const t = Math.floor(x * 1000 + 1e-9) / 10;
  return t >= 100 ? '100%' : `${t.toFixed(1).replace('-', '−')}%`;
};

/** "+12%", "−4%", "0%": a change in share, with a real minus sign; a change that rounds to 0 has no sign. */
export const signedPct = (x: number): string => { const r = Math.round(x * 100); return `${r > 0 ? '+' : r < 0 ? '−' : ''}${Math.abs(r)}%`; };
