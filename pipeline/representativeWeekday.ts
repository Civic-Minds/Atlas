import { representativeIndexByCount, representativeWeekdayIndex } from './transit-phase2.js';

/**
 * The one weekday (index 0-4, Monday-Friday) a pattern's Weekday values describe, or null when it
 * has none. Shared by the Weekday stop data and the running time (CIV-84) so both read the same day.
 *
 * Phase 1 drops a day with fewer than two departures, so such days count as unserved unless no day
 * has more (single-trip routes). The median of all five weekdays decides (#710), so a pattern on
 * fewer than 3 of 5 weekdays gets no Weekday day, unless `routeServesFullWeek`: a pattern that runs
 * on fewer weekdays than its route (one shape per weekday, LANTA and Lancaster) still describes a
 * route that runs every weekday, so its typical served day is used.
 */
export function pickRepresentativeWeekday(countsByWeekday: number[], routeServesFullWeek: boolean): number | null {
  const served = countsByWeekday.map(count => (count >= 2 ? count : 0));
  const usable = served.some(count => count > 0) ? served : countsByWeekday;
  let index = representativeWeekdayIndex(usable);
  if (index === null && routeServesFullWeek && usable.some(count => count > 0)) {
    const days = usable.map((_, i) => i).filter(i => usable[i] > 0);
    index = days[representativeIndexByCount(days.map(i => usable[i]))];
  }
  return index;
}
