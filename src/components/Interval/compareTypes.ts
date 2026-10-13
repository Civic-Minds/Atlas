import type { CompareSide } from '../../utils/compareSides';

/** One side of a route in compare mode, as shown on the route card. */
export interface CompareRouteRow {
  label: 'A' | 'B';
  /** This side's day, time and frequency threshold. */
  settings: CompareSide;
  /** The frequency the filter judges (slowest direction), in minutes; null when there is no regular frequency. */
  headway: number | null;
  /** Passes this side's frequency filter (worst direction decides). */
  passes: boolean;
  /** Has any service on this side's day. */
  runs: boolean;
}
