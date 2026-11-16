/**
 * CIV-1693: the Studio "buses needed" page's data, one file per agency. Written locally by
 * `scripts/vehicles-needed.ts --json tmp/studio/<slug>-vehicles.json` and served only by the Vite dev
 * server at STUDIO_VEHICLES_DEV_URL (vite.config.ts); never uploaded to R2 or built into a deployment.
 */
import type { PeriodKey } from './config';

/** The target headways (minutes) the page offers; the script works each one out for every group. */
export const STUDIO_TARGET_HEADWAYS = [10, 15, 20, 30] as const;
export type StudioTargetHeadway = (typeof STUDIO_TARGET_HEADWAYS)[number];

/** Routes that share buses (an interlined group), or one route on its own. */
export interface StudioVehicleGroup {
  /** Member routes' short names, in route order. */
  routes: string[];
  /** Buses on the group's patterns at the period's midpoint (the engine's "scheduled now"). */
  scheduled: number;
  /** Buses the group's regular patterns need at the schedule's own frequency, rounded up once. */
  implied: number;
  /**
   * One trip on each regular pattern of the group (partial trips left out): the sum of their
   * round-trip running minutes, and of their scheduled layover minutes. Layover is null when the
   * feed has no blocks for any of them.
   */
  runningMin: number;
  layoverMin: number | null;
  /** Buses needed at each STUDIO_TARGET_HEADWAYS value (key: minutes), rounded up once for the group. */
  atTarget: Partial<Record<StudioTargetHeadway, number>>;
}

export interface StudioVehiclesFile {
  slug: string;
  /** The feed zip's file name. */
  feed: string;
  referenceDate: string;
  periods: Partial<Record<PeriodKey, StudioVehicleGroup[]>>;
}

/** Where the Vite dev server serves an agency's file (tmp/studio/<slug>-vehicles.json). */
export const studioVehiclesDevUrl = (slug: string) => `/dev-studio/${slug}-vehicles.json`;
