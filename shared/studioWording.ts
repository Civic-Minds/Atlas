/**
 * Atlas Studio's words, in one place (CIV-1801), as Live's are in liveWording.ts: the map page (STUDIO_MAP_TEXT), the
 * schedule changes (STUDIO_CHANGES_TEXT) and the buses needed (STUDIO_VEHICLES_TEXT). Every string is Ryan's
 * word-for-word OK or waiting on it; the CIV-1774 style guard keeps labels out of the components.
 */
import { joinList, plural } from './overflowText';
import { devPlaceholder } from './devPlaceholder';
import { PAGE_NAMES } from './pageNames';

/** "Routes": the route list's heading on the map page and the group's routes row under Vehicles. */
const ROUTES = 'Routes';

/** The page menu's entries (CIV-1828): Live and Schedule, Ryan's picks for Studio's two views (CIV-1807, 2026-11-18). */
export const STUDIO_PAGE_NAMES = { live: 'Live', fleet: 'Schedule' } as const;

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
  frequencyTitle: 'Frequency or Trips Changed',
  hoursTitle: 'First or Last Trip or Trip Time Changed',
  addedTitle: (n: number) => plural(n, 'Route Added', 'Routes Added'),
  removedTitle: (n: number) => plural(n, 'Route Removed', 'Routes Removed'),
  smallTitle: 'Small Changes',
  smallIntro: 'Frequency or trip time moved by less than 5 min, first or last trip by less than 15 min, or trips by 1 or 2.',
  // Ryan (CIV-1806): "25 other routes didn't change", the agency's own count.
  unchangedCount: (n: number) => `${n} other ${plural(n, 'route')} didn’t change`,
  before: 'Before',
  after: 'After',
  trips: 'Trips',
  firstTrip: 'First trip',
  lastTrip: 'Last trip',
  tripTime: 'Trip time',
  noData: 'No data for this agency yet.',
  noDay: 'These two schedules couldn’t be compared.',
} as const;

export const STUDIO_VEHICLES_TEXT = {
  routes: ROUTES,
  scheduled: 'Scheduled now',
  needed: 'Needed',
  running: 'Running time',
  layover: 'Layover',
  noService: 'No buses at this time of day.',
} as const;

/**
 * CIV-1827's three new strings, waiting on Ryan's word-for-word OK (sent via Atlas Questions). Until then each shows as a
 * dev-only placeholder with the proposed words; once he answers, the approved text goes here.
 */
/** A route's two end stops, "Downtown – Cambrai" (the Route row of the open route's table). */
export const routeEndsText = (ends: readonly [string, string]) => devPlaceholder(`${ends[0]} – ${ends[1]}`);
/** Why the buses cover more than the open route: "12, 31, 601 and 602 share buses, so these numbers cover all four." */
export const groupSharesText = (routes: readonly string[]) => devPlaceholder(`${joinList([...routes])} share buses, so these numbers cover all ${routes.length}.`);
/** The vehicles section's title with the newer schedule's date: "Vehicles · Sep 17". */
export const vehiclesTitleText = (date: string) => devPlaceholder(`${PAGE_NAMES.studioVehicles} · ${date}`);
