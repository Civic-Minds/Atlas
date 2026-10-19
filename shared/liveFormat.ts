/** One rounding for minute figures on every Live surface: to a tenth of a minute, whole numbers without ".0", a real minus sign. */
export const tenth = (x: number): string => (Math.round(x * 10) / 10).toString().replace('-', '−');

/** "0.9 min", "1 min", "2.1 min": `tenth` with its unit. The one writer of an extra-wait (or any other fractional-minute) figure. */
export const minutesText = (x: number): string => `${tenth(x)} min`;
