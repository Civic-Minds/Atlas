import type { DayType } from '../../shared/dayTypes';

/**
 * PLACEHOLDER WORDING (CIV-959). Every string here is a helper's suggestion from
 * _reports/missing-notices-2026-10-26.md, not approved text. Ryan approves the wording in one pass on
 * _review/civ959/; until then this branch does not merge. Each notice is numbered as in the report.
 */

const DAY_WORDS: Record<DayType, string> = { Weekday: 'weekdays', Saturday: 'Saturdays', Sunday: 'Sundays' };

/** 1. A route opened for a day it doesn't run. */
export const routeNoServiceOnDay = (day: DayType) => `This route doesn't run on ${DAY_WORDS[day]}.`;
/** 2. A stop where none of its routes run in the selected period. */
export const STOP_NO_ROUTES_IN_PERIOD = 'No routes stop here during the selected period.';
/** 3. A route link that matches no route. */
export const ROUTE_NOT_FOUND = "We couldn't find this route, which may have been renumbered or removed.";
/** 4. An agency card on a day the agency doesn't run. */
export const agencyNoServiceOnDay = (day: DayType) => `This agency has no service on ${DAY_WORDS[day]}.`;
/** 5. An agency card whose network failed to load. */
export const AGENCY_LOAD_FAILED = "We couldn't load this agency's routes, reload the page to try again.";
/** 6. A route search that found nothing while routes are only searched near the map. */
export const ROUTE_SEARCH_AREA_ONLY = 'Route search only covers the area on the map, open the agency to see its routes.';
/** 7. An agency link that matches no listed agency. */
export const AGENCY_NOT_FOUND = "We couldn't find this agency.";
/** 8. A stop link that matches no stop. */
export const STOP_NOT_FOUND = "We couldn't find this stop, which may have been moved or removed.";
/** 9. History opened for a route or agency it doesn't cover. The agency form is a variant of the suggested route line. */
export const historyNotCovered = (kind: 'route' | 'agency') => `History doesn't cover this ${kind} yet.`;
/** 10. Filters leave nothing on the map (shown on phones, where the count pills are hidden). */
export const NO_ROUTES_MATCH_FILTERS = 'No routes match your filters here.';
/** 11. A research view (Night, Frequent Service) with nothing drawn in the loaded area. */
export const RESEARCH_VIEW_EMPTY = "No routes here meet this view's rule.";
// 12. Live route spacing report: not built here. It belongs to the Live chat's branch (feature/live-tool-v2).
/** 13. "Live at this stop" when the live-stop request fails. */
export const LIVE_STOP_UNAVAILABLE = "Live arrivals aren't available right now.";
// 14. Corridor file failures: not built. The map passes showCorridorBand: false (Interval.tsx), so no corridor file loads today.
