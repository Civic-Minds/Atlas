/**
 * Atlas Studio's words, in one place (CIV-1801), as Live's are in liveWording.ts: the map page (STUDIO_MAP_TEXT), the
 * schedule changes (STUDIO_CHANGES_TEXT) and the buses needed (STUDIO_VEHICLES_TEXT). Every string is Ryan's
 * word-for-word OK or waiting on it; the CIV-1774 style guard keeps labels out of the components.
 */
import { noDataText } from './noDataText';
import { joinList, plural } from './overflowText';
import { devPlaceholder } from './devPlaceholder';
import { PAGE_NAMES } from './pageNames';
import { vehiclesWord } from './modeVehicles';

/** "Routes": the route list's heading on the map page and the group's routes row under Buses Needed. */
const ROUTES = 'Routes';

/** The page menu's entries (CIV-1828): Live (Ryan and Strategy, 2026-11-17), and Fleet, a placeholder name (Ryan, 2026-11-17). */
export const STUDIO_PAGE_NAMES = { live: 'Live', fleet: 'Fleet', schedules: PAGE_NAMES.studioSchedules } as const;

export const STUDIO_MAP_TEXT = {
  route: 'Route',
  allRoutes: 'All routes',
  routes: ROUTES,
  keyTitle: 'Frequency change',
  more: 'More often',
  less: 'Less often',
  same: 'No change',
  none: 'No frequency',
  dashed: 'Dashed: before the change',
} as const;

export const STUDIO_CHANGES_TEXT = {
  intro: (agency: string, day: string, before: string, after: string) => `How the ${agency} ${day} schedule changed between ${before} and ${after}.`,
  leftOut: (days: string, newer: boolean) => `${days} aren’t compared: the ${newer ? 'newer' : 'older'} schedule file’s calendar leaves out many of their trips.`,
  // The change list's group labels are map panel labels, so sentence case (docs/style/VISUAL.md Case; CIV-1922).
  frequencyTitle: 'Frequency or trips changed',
  hoursTitle: 'First or last trip or trip time changed',
  addedTitle: (n: number) => plural(n, 'Route added', 'Routes added'),
  removedTitle: (n: number) => plural(n, 'Route removed', 'Routes removed'),
  smallTitle: 'Small changes',
  smallIntro: 'Frequency or trip time moved by less than 5 min, first or last trip by less than 15 min, or trips by 1 or 2.',
  // Ryan (CIV-1806): "25 other routes didn't change", the agency's own count.
  unchangedCount: (n: number) => `${n} other ${plural(n, 'route')} didn’t change`,
  before: 'Before',
  after: 'After',
  trips: 'Trips',
  firstTrip: 'First trip',
  lastTrip: 'Last trip',
  tripTime: 'Trip time',
  noData: noDataText('this agency'),
  /** The page has no data for the agency Studio is on: "No data for TTC yet." */
  noDataFor: noDataText,
  noDay: 'These two schedules couldn’t be compared.',
} as const;

/** "Trains Needed", "Buses Needed" (the page's name), "Vehicles Needed" when modes mix (CIV-2002: Ryan, "This is a train line so why does it say buses"). */
export function vehiclesNeededTitle(modes: readonly number[] | undefined): string {
  const word = vehiclesWord(modes);
  return word === 'buses' ? PAGE_NAMES.studioVehicles : `${word.replace(/\b\p{Ll}/gu, c => c.toUpperCase())} Needed`;
}

/**
 * Fleet's network table (CIV-2002: Ryan, "is this network-wide?"). Proposed words, waiting on his OK: each row reads as a
 * sentence, "If every route ran every 15 min → 1185", and the schedule's own row is "As scheduled".
 */
export const fleetNetworkText = (modes: readonly number[] | undefined) => {
  const word = vehiclesWord(modes);
  return { ifEveryRouteRan: 'If every route ran', asScheduled: 'As scheduled', count: word.charAt(0).toUpperCase() + word.slice(1) };
};

/** A time of day with no service: "No trains at this time of day." (CIV-2002: by mode, as the rest of Fleet). */
export const noServiceText = (modes: readonly number[] | undefined) => `No ${vehiclesWord(modes)} at this time of day.`;

export const STUDIO_VEHICLES_TEXT = {
  routes: ROUTES,
  needed: 'Needed',
  running: 'Running time, all directions and branches',
  layover: 'Layover',
} as const;

/** A route's two end stops, "Downtown – Cambrai" (the Route row of the open route's table). Ryan's OK as is (CIV-1834, 2026-11-21: "1"). */
export const routeEndsText = (ends: readonly [string, string]) => `${ends[0]} – ${ends[1]}`;
/**
 * Fleet's line above its table: network-wide, every route at once (CIV-1922; CIV-2002, Ryan: "is this network-wide?").
 * Proposed words, waiting on his OK: "All 194 TTC routes at once, on the Nov 25, 2026 schedule: the vehicles they need as
 * scheduled, and if every route ran at each frequency."
 */
export const fleetIntroText = (agency: string, date: string, routes: number, modes?: readonly number[]) =>
  `All ${routes} ${agency} ${plural(routes, 'route')} at once, on the ${date} schedule: the ${vehiclesWord(modes)} they need as scheduled, and if every route ran at each frequency.`;
/** Why the figures cover more than the open route: "12, 31, 601 and 602 share buses. These numbers cover all 4." Ryan's pick (CIV-1834, 2026-11-21: "1"), exact. */
export const groupSharesText = (routes: readonly string[], modes?: readonly number[]) => `${joinList([...routes])} share ${vehiclesWord(modes)}. These numbers cover all ${routes.length}.`;
/** The buses section's title with the newer schedule's date: "Buses Needed · Sep 17" ("Trains Needed" on a train line, CIV-2002). */
export const vehiclesTitleText = (date: string, modes?: readonly number[]) => devPlaceholder(`${vehiclesNeededTitle(modes)} · ${date}`);
