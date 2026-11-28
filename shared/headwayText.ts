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
 *   scheduledEveryText(10)    "Scheduled every 10 min"   Live's scheduled spacing under a measured figure (whole minutes)
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

import { MISSING_VALUE } from './missingValue';
import { RANGE_MAX_RATIO } from './rules/frequency.js';

const MISSING = MISSING_VALUE;

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
  return isUsable(minutes) ? `${Math.round(minutes)} min` : MISSING;
}

/** "Scheduled every 10 min": Live's scheduled spacing under a measured figure, rounded to the whole minute as headwayAmount. */
export function scheduledEveryText(minutes: number | null | undefined): string {
  return `Scheduled every ${headwayAmount(minutes)}`;
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
  return headwayEvery(minutes);
}

/** "every 30–60 min": a list cadence, combined on a shared stretch up to each branch's own. */
export function headwayEveryRange(low: number | null | undefined, high: number | null | undefined, compact = false): string {
  if (!isUsable(low) || !isUsable(high)) return MISSING;
  const prefix = compact ? '' : 'every ';
  // Ends that print the same read as one value, never "every 60–60 min" (CIV-1155, as headwayAboutRange).
  if (num(low) === num(high)) return `${prefix}${amount(low)}`;
  return `${prefix}${num(low)}–${num(high)} min`;
}

/**
 * Whether a low end reads as a range beside the value ("every 15–52 min"), or the value stands alone. One rule for every
 * range: the route list, route cards, History and agency pages (CIV-1143 rule B, Ryan 2026-10-30; the list too, CIV-1227,
 * 2026-11-02). Shown only when the low end is at least 5 min, the two are at least 5 min apart, and no more than 4 times apart
 * (RANGE_MAX_RATIO; TTC 102 PM: 7 against 30 reads "every 30 min"). A single branch's faster short turn counts too (TTC 94 Castle
 * Frank, #493). A list passes `maxRatio` Infinity where its slow line has its own number (CIV-2909, routeListRange.ts).
 */
export function headwayRangeShown(low: number | null | undefined, high: number | null | undefined, maxRatio: number = RANGE_MAX_RATIO): boolean {
  if (low == null || high == null) return false;
  if (low < 5 || low >= high) return false;
  if (high - low < 5) return false;
  if (high / low > maxRatio) return false;
  return true;
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
  return headwayExactAmount(minutes);
}

/** "42 min": how long a trip takes end to end (trip time, run time), rounded to the whole minute. */
export function runTimeAmount(minutes: number | null | undefined): string {
  return headwayAmount(minutes);
}

/**
 * A period's service where it runs, for the route card's time-of-day rows (#934, D6; Ryan,
 * 2026-10-16). `from` and `until` are clock text already formatted for the app. The frequency comes
 * first, then its limit (Ryan, 2026-10-30, #962): "every 9 min from 7:17 AM", "every 10 min until
 * 5:40 PM", "every 10 min, with a 45 min gap", "every 15 min until 8:57 PM, then every 30 min" (CIV-1913),
 * "every 32 min, then every 17 from 4:37 PM" (CIV-3135).
 */
export function headwayPeriodShape(shape: { from?: string; until?: string; every: number; gap?: number; then?: number; thenGap?: number; before?: number }): string {
  if (shape.gap != null) return withOneGap(headwayEvery(shape.every), shape.gap);
  // CIV-3135 (Ryan, 2026-11-28, "1"): service that comes more often partway through names the slower part first, so a plain
  // "from" only ever means the first bus: "every 32 min, then every 17 from 4:37 PM".
  if (shape.before != null && shape.from != null && shape.until == null && isUsable(shape.before) && isUsable(shape.every)) {
    return `${headwayEvery(shape.before)}, then every ${num(shape.every)} from ${shape.from}`;
  }
  const text = [
    headwayEvery(shape.every),
    shape.from != null ? `from ${shape.from}` : null,
    shape.until != null ? `until ${shape.until}` : null,
  ].filter((part): part is string => part != null).join(' ');
  // CIV-1913: a period that slows down rather than ends names the slower part too.
  if (shape.then == null || shape.until == null) return text;
  // #1724: one long wait in the slower part is named as a gap, with D6's words.
  return shape.thenGap != null ? `${text}, then ${headwayEvery(shape.then)}, with one ${delayAmount(shape.thenGap)} gap` : `${text}, then ${headwayEvery(shape.then)}`;
}

/**
 * CIV-1772: a period's text split into its frequency and the note after it, so a table can put the note on a second
 * line: "every 20 min, with one 37 min gap" is "every 20 min" and "one 37 min gap" (CIV-1787, Ryan: the note drops its
 * "with"; the one-line text keeps it); "every 30 min from 7:05 AM" is
 * "every 30 min" and "from 7:05 AM". Text with no note ("every 20 min", "20–30 min", "Irregular") has none. The inverse
 * of headwayPeriodShape, which writes the text the agency summaries store.
 */
export function periodShapeParts(text: string): { main: string; note: string | null } {
  // CIV-3135: "every 32 min, then every 17 from 4:37 PM" is "every 32 min" and "then every 17 from 4:37 PM".
  const m = /^(.*?)(?:, with (.*)|, (then .*)| ((?:from|until) .*))$/.exec(text);
  return m ? { main: m[1], note: m[2] ?? m[3] ?? m[4] } : { main: text, note: null };
}

/** D6's one-gap note after a frequency ("every 26–45 min" -> "every 26–45 min, with one 45 min gap"; #1856, a list range keeps it). */
export function withOneGap(text: string, gap: number): string {
  return `${text}, with one ${delayAmount(gap)} gap`;
}

/** #1856: the one gap D6's words name ("every 30 min, with one 59 min gap" -> 59), the inverse of headwayPeriodShape's gap form; null otherwise. */
export function periodShapeGap(text: string): number | null {
  const m = /^every [^,]+, with one ([\d.]+) min gap$/.exec(text);
  return m ? Number(m[1]) : null;
}

export function capitalizeFirst(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
