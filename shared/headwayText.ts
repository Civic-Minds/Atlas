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
 * column of values never mixes units. headwayAbout rounds to the nearest 30 minutes above 60
 * ("every 90 min") because a measured gap is already approximate. The wording does not say so on
 * each number; the docs say once that gaps above 60 minutes are rounded to the half hour.
 *
 * Whole numbers print as they are; other numbers print to one decimal ("7.5 min"). Missing or
 * non-finite values print "—" (headwayFilterLabel is the one exception: no limit is "All").
 * Nothing here changes a number except that rounding of measured gaps above 60 minutes and the
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

/** The number headwayAbout prints: one decimal up to 60 minutes, the nearest 30 above. */
export function headwayAboutMinutes(minutes: number): number {
  return minutes <= 60 ? Number(num(minutes)) : Math.round(minutes / 30) * 30;
}

/** "every 16 min": a measured or typical spacing. Above 60 minutes it rounds to the nearest 30 min. */
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

/** "every 6–12 min": a spread of typical spacings. Above 60 minutes each end rounds to the half hour. */
export function headwayAboutRange(low: number, high: number): string {
  if (low === high) return headwayAbout(low);
  if (isUsable(low) && isUsable(high) && low <= 60 && high <= 60) {
    return `every ${num(low)}–${num(high)} min`;
  }
  const round = (m: number) => (m <= 60 ? num(m) : String(Math.round(m / 30) * 30));
  return `every ${round(low)}–${round(high)} min`;
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
 * 2026-10-16). `from` and `until` are clock text already formatted for the app:
 * "from 7:17am, every 9 min", "until 5:40pm, every 10 min", "every 10 min, with a 45 min gap".
 */
export function headwayPeriodShape(shape: { from?: string; until?: string; every: number; gap?: number }): string {
  const parts = [
    shape.from != null ? `from ${shape.from}` : null,
    shape.until != null ? `until ${shape.until}` : null,
    shape.gap != null ? `${headwayEvery(shape.every)}, with a ${delayAmount(shape.gap)} gap` : headwayEvery(shape.every),
  ].filter((part): part is string => part != null);
  return parts.join(', ');
}

export function capitalizeFirst(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
