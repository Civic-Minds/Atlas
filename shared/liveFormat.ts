import { delayAmount } from './headwayText.js';

/** One rounding for minute figures on every Live surface: to a tenth of a minute, whole numbers without ".0", a real minus sign. */
export const tenth = (x: number): string => (Math.round(x * 10) / 10).toString().replace('-', '−');

/**
 * "0.9 min", "1 min", "7.5 min", "−1.2 min": the map's shared minutes format (headwayText delayAmount: whole numbers as
 * they are, others to a tenth) with a real minus sign. The one writer of a minutes figure on Live: no "+", no "½", no
 * forced ".0" (Ryan, CIV-1160 question 5, 2026-11-13).
 */
export const minutesText = (x: number): string => delayAmount(Math.round(x * 10) / 10 || 0).replace('-', '−');
