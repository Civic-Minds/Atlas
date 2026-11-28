/**
 * CIV-3206: an agency's whole network in each year of Atlas's History, as History's year view reads it, so
 * network_history counts the routes at a frequency each year in one small file (the hosted server can't read every
 * route's own History file in one call). Built by scripts/mcp/historyNetwork.ts.
 */
import type { DayType } from './rules/days';

/** A route's figure in one part of the day: minutes, no trips that day, limited service, or no figure. */
export type NetworkCell = number | 'none' | 'limited' | null;

export interface HistoryNetwork {
  v: 1;
  /** The years Atlas's History has schedules for this agency, oldest first. */
  years: number[];
  /** [route short name, route name]. */
  routes: Array<[string, string | null]>;
  /**
   * Per year: [route index, the year its figure is carried from (an older schedule kept into a year it didn't change)
   * or null, its figures by day in PERIOD_KEYS order]. A day with no stored figures is left out.
   */
  byYear: Record<string, Array<[number, number | null, Partial<Record<DayType, NetworkCell[]>>]>>;
}
