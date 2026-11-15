import hourly from './airport-hourly.json';

/**
 * CIV-1550: the airport story's hourly data (scripts/build-airport-hourly.ts writes airport-hourly.json). Each sample
 * day has three 24-bit masks, bit h = hour h: a ride downtown, downtown with one change, and any transit leaving within
 * 60 minutes of landing at the start of that hour.
 */
export type AirportDay = 'wk' | 'sat' | 'sun';
export type AirportRide = 'downtown' | 'withChange' | 'any';

export interface AirportHours {
  code: string;
  name: string;
  city: string;
  country: string;
  lat: number;
  lon: number;
  weekly: Record<AirportRide, number>;
  masks: Record<AirportDay, [number, number, number]>;
}

export const AIRPORTS = hourly.airports as AirportHours[];
export const AIRPORT_DATES = hourly.dates as Record<AirportDay, string>;

const RIDE_INDEX: Record<AirportRide, 0 | 1 | 2> = { downtown: 0, withChange: 1, any: 2 };

export function landableAt(airport: AirportHours, day: AirportDay, hour: number, ride: AirportRide = 'downtown'): boolean {
  return ((airport.masks[day][RIDE_INDEX[ride]] >> hour) & 1) === 1;
}

export function landableCount(airports: AirportHours[], day: AirportDay, hour: number, ride: AirportRide = 'downtown'): number {
  return airports.filter(a => landableAt(a, day, hour, ride)).length;
}
