/**
 * Atlas Studio's words, in one place (CIV-1801), as Live's are in liveWording.ts: the map page (STUDIO_MAP_TEXT), the
 * schedule changes (STUDIO_CHANGES_TEXT) and the buses needed (STUDIO_VEHICLES_TEXT). Every string is Ryan's
 * word-for-word OK or waiting on it; the CIV-1774 style guard keeps labels out of the components.
 */
import { headwayEvery } from './headwayText';
import { plural } from './overflowText';

/** "Routes": the route list's heading on the map page and the group's routes row under Buses Needed. */
const ROUTES = 'Routes';

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
  unchangedTitle: 'No Change',
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
  neededAt: (hw: number) => `Needed ${headwayEvery(hw)}`,
  running: 'Running time',
  layover: 'Layover',
  noService: 'No buses at this time of day.',
} as const;
