/**
 * The one place headway wording is built. Every surface (route cards, lists, compare, charts,
 * filter labels, legend, export image, tooltips, aria labels) calls these instead of writing
 * "every N min" by hand, so the same frequency always reads the same way.
 *
 * The final set of formats (N is always minutes, never hours):
 *
 *   headwayEvery(10)          "every 10 min"             a stated or scheduled spacing
 *   headwayOrBetter(10)       "every 10 min or better"   a threshold in a sentence or screen-reader label
 *   headwayFilterLabel(10)    "≤10 min"                  the applied frequency limit, as the pickers show it
 *   headwayAbout(16)          "every 16 min"       a measured or typical (median) spacing
 *   headwayAboutRange(6, 12)  "every 6–12 min"     a spread of typical spacings
 *   headwayEveryRange(30, 60) "every 30–60 min"          a list cadence: shared stretch to each branch
 *                             ("30–60 min" compact, for narrow table cells)
 *   headwayTierLabel(10)      "≤10 min"                  a frequency band in a legend or key
 *   headwayBandLabel(16, 30)  "16–30 min"                  the band between two tiers in a key
 *   headwayAmount(10)         "10 min"                   a bare spacing with no "every" (tables, chart cells)
 *   delayAmount(3)            "3 min"                    a delay or gap length that is not a headway
 *   runTimeAmount(42)         "42 min"                   a trip's run time, rounded to the whole minute
 *
 * Units: headways always read in minutes, never hours ("every 90 min", "every 120 min"), so a
 * column of values never mixes units. Above 60 minutes headwayAbout prints the exact minutes ("every 63
 * min") like every other value; it used to round to the nearest 30, which let a row read "every 60"
 * beside a filter that read 63 and hid it (Ryan, 2026-10-31, #1239).
 *
 * Whole numbers print as they are; other numbers print to one decimal ("7.5 min"). Missing or
 * non-finite values print "—" (headwayFilterLabel is the one exception: no limit is "All").
 * Nothing here changes a number except the one-decimal rounding, so the wording can change without the data changing.
 */

const MISSING = '—';

const isUsable = (n: number | null | undefined): n is number => n != null && Number.isFinite(n);

/** Whole numbers as they are, anything else to one decimal. */
function num(n: number): string {
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 10) / 10);
}

/** "10 min", "120 min": always minutes. */
function amount(minutes: number): string {
  return `${num(minutes)} min`;
}

/** "10 min", "15.5 min": a bare spacing with no "every", to the tenth of a minute, as headwayEvery prints it. */
export function headwayExactAmount(minutes: number | null | undefined): string {
  return isUsable(minutes) ? amount(minutes) : MISSING;
}

/** "10 min", "120 min": a bare spacing with no "every", rounded to the whole minute. */
export function headwayAmount(minutes: number | null | undefined): string {
  if (!isUsable(minutes)) return MISSING;
  return `${Math.round(minutes)} min`;
}

/** "every 10 min": a stated or scheduled spacing. */
export function headwayEvery(minutes: number | null | undefined): string {
  return isUsable(minutes) ? `every ${amount(minutes)}` : MISSING;
}

/** "every 10 min or better": what a frequency filter or threshold means. */
export function headwayOrBetter(minutes: number | null | undefined): string {
  return isUsable(minutes) ? `every ${amount(minutes)} or better` : MISSING;
}

/**
 * The applied frequency limit's label, the same on every surface (pickers, Compare captions, the
 * export image): "≤10 min", or "All" when there is no limit (#1011). Screen-reader labels
 * that need a full phrase use headwayOrBetter instead.
 */
export function headwayFilterLabel(maxHeadway: number): string {
  if (maxHeadway === Infinity) return 'All';
  return headwayTierLabel(maxHeadway);
}

/** The number headwayAbout prints: the minutes to one decimal, above 60 too (#1239). */
export function headwayAboutMinutes(minutes: number): number {
  return Number(num(minutes));
}

/** "every 16 min", "every 63 min": a measured or typical spacing. */
export function headwayAbout(minutes: number | null | undefined): string {
  if (!isUsable(minutes)) return MISSING;
  return `every ${num(headwayAboutMinutes(minutes))} min`;
}

/** "every 30–60 min": a list cadence, combined on a shared stretch up to each branch's own. */
export function headwayEveryRange(low: number | null | undefined, high: number | null | undefined, compact = false): string {
  if (!isUsable(low) || !isUsable(high)) return MISSING;
  const prefix = compact ? '' : 'every ';
  if (low === high) return `${prefix}${amount(low)}`;
  return `${prefix}${num(low)}–${num(high)} min`;
}

/** "every 6–12 min", "every 75–105 min": a spread of typical spacings. */
export function headwayAboutRange(low: number, high: number): string {
  if (low === high) return headwayAbout(low);
  if (!isUsable(low) || !isUsable(high)) return MISSING;
  const shown = [num(low), num(high)];
  // Ends that print the same read as one value, never "every 60–60 min" (CIV-1155).
  return shown[0] === shown[1] ? `every ${shown[0]} min` : `every ${shown[0]}–${shown[1]} min`;
}

/** "≤10 min": a frequency band in a legend or key. */
export function headwayTierLabel(maxMinutes: number): string {
  return isUsable(maxMinutes) ? `≤${num(maxMinutes)} min` : MISSING;
}

/** "16–30 min": the band between two tiers. */
export function headwayBandLabel(lowMinutes: number, highMinutes: number): string {
  return isUsable(lowMinutes) && isUsable(highMinutes) ? `${num(lowMinutes)}–${num(highMinutes)} min` : MISSING;
}

/** "3 min": a delay, gap or other length of time that is not a headway. */
export function delayAmount(minutes: number | null | undefined): string {
  return isUsable(minutes) ? `${num(minutes)} min` : MISSING;
}

/** "42 min": how long a trip takes end to end (trip time, run time), rounded to the whole minute. */
export function runTimeAmount(minutes: number | null | undefined): string {
  return isUsable(minutes) ? `${Math.round(minutes)} min` : MISSING;
}

/**
 * A period's service where it runs, for the route card's time-of-day rows (#934, D6; Ryan,
 * 2026-10-16). `from` and `until` are clock text already formatted for the app. The frequency comes
 * first, then its limit (Ryan, 2026-10-30, #962): "every 9 min from 7:17 AM", "every 10 min until
 * 5:40 PM", "every 10 min, with a 45 min gap".
 */
export function headwayPeriodShape(shape: { from?: string; until?: string; every: number; gap?: number }): string {
  if (shape.gap != null) return `${headwayEvery(shape.every)}, with one ${delayAmount(shape.gap)} gap`;
  return [
    headwayEvery(shape.every),
    shape.from != null ? `from ${shape.from}` : null,
    shape.until != null ? `until ${shape.until}` : null,
  ].filter((part): part is string => part != null).join(' ');
}

export function capitalizeFirst(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
