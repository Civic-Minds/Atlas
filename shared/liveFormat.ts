/** One rounding for minute figures on every Live surface: to a tenth of a minute, whole numbers without ".0", a real minus sign. */
export const tenth = (x: number): string => (Math.round(x * 10) / 10).toString().replace('-', '−');

/** "0.9 min", "1 min", "2.1 min": `tenth` with its unit. The one writer of an extra-wait (or any other fractional-minute) figure. */
export const minutesText = (x: number): string => `${tenth(x)} min`;

/** "12%": a share as a whole percent. The one writer of a whole-percent figure on Live surfaces. */
export const pct = (x: number): string => `${Math.round(x * 100)}%`;

/** "96.7%": a share to a tenth of a percent (service delivered), whole numbers without ".0". */
export const pctTenth = (x: number): string => `${tenth(Math.round(x * 1000) / 10)}%`;

/** "+12%", "−4%", "0%": a change in share, with a real minus sign. */
export const signedPct = (x: number): string => `${x > 0 ? '+' : x < 0 ? '−' : ''}${Math.abs(Math.round(x * 100))}%`;

/** "+3.2 min", "−1 min": a signed minutes value, `tenth` with its unit. */
export const signedMinutes = (x: number): string => `${x > 0 ? '+' : ''}${tenth(x)} min`;
