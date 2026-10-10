/** One side of a route in compare mode, as shown on the route card. */
export interface CompareRouteRow {
  label: 'A' | 'B';
  /** e.g. "Saturday midday". */
  title: string;
  /** The frequency the filter judges (slowest direction), in minutes; null when there is no regular frequency. */
  headway: number | null;
  /** Passes the shared frequency filter on this side (worst direction decides). */
  passes: boolean;
  /** Has any service on this side's day. */
  runs: boolean;
}
