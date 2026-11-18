/**
 * CIV-1693: the Studio "buses needed" page's data, one file per agency. Written locally by
 * `scripts/vehicles-needed.ts --json tmp/studio/<slug>-vehicles.json` and served only by the Vite dev
 * server at STUDIO_VEHICLES_DEV_URL (vite.config.ts); never uploaded to R2 or built into a deployment.
 */
import { type PeriodKey } from './config';
import { PUBLIC_TIER_MAXES } from './rules/frequency';

/**
 * Studio's target headways (minutes): the map's public scale, the same for every group, rail included, never a copy of
 * it (Ryan: "why does Studio have different ones than the rest of the app"; "having 10/15/20/30/60 is already a bit and
 * doubling that list would be chaotic"). The internal 5 and 8 are never shown.
 */
export const STUDIO_TARGETS: readonly number[] = PUBLIC_TIER_MAXES;

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
  /**
   * Vehicles needed at each of STUDIO_TARGETS (key: minutes), rounded up once for the group. Where branches share
   * a middle section, the target is for that middle, and its trips go to the branches in their current shares.
   */
  atTarget: Partial<Record<number, number>>;
  /**
   * CIV-1712 (Ryan: the planner's choice, not ours): the same, with the middle's trips split evenly among the branches.
   * Only on a group with branches that share a middle (and absent from files written before it).
   */
  atTargetEven?: Partial<Record<number, number>>;
}

/** How a target for the shared middle is shared among the branches: their current shares of trips, or evenly. */
export type StudioBranchSplit = 'current' | 'even';

/** The group's vehicles at a target, for a branch split; a file without the even figures keeps the current split. */
export function groupAtTarget(g: StudioVehicleGroup, split: StudioBranchSplit): StudioVehicleGroup['atTarget'] {
  return split === 'even' && g.atTargetEven ? g.atTargetEven : g.atTarget;
}

export interface StudioVehiclesFile {
  slug: string;
  /** The feed zip's file name. */
  feed: string;
  referenceDate: string;
  periods: Partial<Record<PeriodKey, StudioVehicleGroup[]>>;
}

/** An agency's buses-needed file name, in tmp/studio/ (scripts/vehicles-needed.ts writes it; Studio and the MCP read it). */
export const studioVehiclesFileName = (slug: string) => `${slug}-vehicles.json`;
/** Where the Vite dev server serves an agency's file (tmp/studio/<slug>-vehicles.json). */
export const studioVehiclesDevUrl = (slug: string) => `/dev-studio/${studioVehiclesFileName(slug)}`;
