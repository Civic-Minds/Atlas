/**
 * The one place headway wording is built. Every surface (route cards, lists, compare, charts,
 * filter labels, legend, export image, tooltips, aria labels) calls these instead of writing
 * "every N min" by hand, so the same frequency always reads the same way.
 *
 * The final set of formats (N is always minutes, never hours):
 *
 *   headwayEvery(10)          "every 10 min"             a stated or scheduled spacing
 *   headwayOrBetter(10)       "every 10 min or better"   what a filter or threshold means
 *   headwayAbout(16)          "about every 16 min"       a measured or typical (median) spacing
 *   headwayAboutRange(6, 12)  "about every 6–12 min"     a spread of typical spacings
 *   headwayEveryRange(30, 60) "every 30–60 min"          a list cadence: shared stretch to each branch
 *                             ("30–60 min" compact, for narrow table cells)
 *   headwayTierLabel(10)      "≤10 min"                  a frequency band in a legend or key
 *   headwayBandLabel(16, 30)  "16–30 min"                  the band between two tiers in a key
 *   headwayAmount(10)         "10 min"                   a bare spacing with no "every" (tables, chart cells)
 *   delayAmount(3)            "3 min"                    a delay or gap length that is not a headway
 *
 * Units: headways always read in minutes, never hours ("every 90 min", "every 120 min"), so a
 * column of values never mixes units. headwayAbout rounds to the nearest 30 minutes above 60
 * ("about every 90 min") because it is already approximate.
 *
 * Whole numbers print as they are; other numbers print to one decimal ("7.5 min"). Missing or
 * non-finite values print "—" (headwayFilterLabel is the one exception: no limit is "All routes").
 * Nothing here changes a number except that rounding for "about" above 60 minutes and the
 * one-decimal rounding, so the wording can change without the data changing.
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

/** The filter's own label: "Every 10 min or better", or "All routes" when there is no limit. */
export function headwayFilterLabel(maxHeadway: number): string {
  if (maxHeadway === Infinity) return 'All routes';
  return isUsable(maxHeadway) ? capitalizeFirst(headwayOrBetter(maxHeadway)) : MISSING;
}

/** "about every 16 min": a measured or typical spacing. Above 60 minutes it rounds to the nearest 30 min. */
export function headwayAbout(minutes: number | null | undefined): string {
  if (!isUsable(minutes)) return MISSING;
  if (minutes <= 60) return `about every ${num(minutes)} min`;
  return `about every ${Math.round(minutes / 30) * 30} min`;
}

/** "every 30–60 min": a list cadence, combined on a shared stretch up to each branch's own. */
export function headwayEveryRange(low: number | null | undefined, high: number | null | undefined, compact = false): string {
  if (!isUsable(low) || !isUsable(high)) return MISSING;
  const prefix = compact ? '' : 'every ';
  if (low === high) return `${prefix}${amount(low)}`;
  return `${prefix}${num(low)}–${num(high)} min`;
}

/** "about every 6–12 min" when both ends fit in minutes; otherwise two "about" phrases. */
export function headwayAboutRange(low: number, high: number): string {
  if (low === high) return headwayAbout(low);
  if (isUsable(low) && isUsable(high) && low <= 60 && high <= 60) {
    return `about every ${num(low)}–${num(high)} min`;
  }
  return `${headwayAbout(low)} – ${headwayAbout(high)}`;
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

export function capitalizeFirst(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
