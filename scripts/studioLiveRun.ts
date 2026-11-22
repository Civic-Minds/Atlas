/**
 * The pure rules of Studio's daily Live run (CIV-2077): where a run's files go, when an agency's new build replaces its
 * last one, the pointer Studio reads, and which old runs can go. scripts/studio-live-cloud.ts writes; scripts/studio-
 * live-sync.ts reads.
 */
import { LIVE_MIN_HEALTHY_DAYS_PER_WEEK } from '../shared/rules/live';
import type { LiveV3 } from '../shared/liveDashboard';

/** The one file that says which run each agency's Studio Live files are in. Written last, in one write. */
export const STUDIO_LIVE_POINTER = 'studio-live/current.json';
/** Runs kept after a switch even when nothing points at them, so one can be pointed back to by hand. */
export const STUDIO_LIVE_KEEP_RUNS = 3;

export const studioLiveRunPrefix = (runId: string) => `studio-live/runs/${runId}/`;

export interface StudioLiveAgency {
  /** The run that holds this agency's files. */
  run: string;
  builtAt: string;
  /** File names under `studio-live/runs/<run>/<slug>/`. */
  files: string[];
  thisWeekGoodDays: number;
  lastWeekGoodDays: number;
}

export interface StudioLivePointer {
  generatedAt: string;
  agencies: Record<string, StudioLiveAgency>;
}

/** An agency's good days in each week: the dates any of its routes counted as good (Live's healthyDates). */
export function goodDaysByWeek(v3s: ReadonlyArray<LiveV3 | undefined>): { thisWeek: number; lastWeek: number } {
  const thisWeek = new Set<string>(), lastWeek = new Set<string>();
  for (const v3 of v3s) {
    for (const d of v3?.weekly?.thisWeek.healthyDates ?? []) thisWeek.add(d);
    for (const d of v3?.weekly?.lastWeek.healthyDates ?? []) lastWeek.add(d);
  }
  return { thisWeek: thisWeek.size, lastWeek: lastWeek.size };
}

/**
 * Whether a new build replaces the agency's files: each week needs LIVE_MIN_HEALTHY_DAYS_PER_WEEK good days. An agency
 * with nothing built before needs only this week, so a city that has recorded one good week still gets its files.
 */
export function acceptStudioLiveBuild(weeks: { thisWeek: number; lastWeek: number }, hadPrevious: boolean): boolean {
  if (weeks.thisWeek < LIVE_MIN_HEALTHY_DAYS_PER_WEEK) return false;
  return !hadPrevious || weeks.lastWeek >= LIVE_MIN_HEALTHY_DAYS_PER_WEEK;
}

/** The new pointer: rebuilt agencies point at this run; every other agency keeps its previous entry. */
export function nextStudioLivePointer(
  previous: StudioLivePointer | null,
  runId: string,
  now: string,
  rebuilt: Record<string, Omit<StudioLiveAgency, 'run' | 'builtAt'>>,
): StudioLivePointer {
  const agencies: Record<string, StudioLiveAgency> = { ...(previous?.agencies ?? {}) };
  for (const [slug, a] of Object.entries(rebuilt)) agencies[slug] = { run: runId, builtAt: now, ...a };
  return { generatedAt: now, agencies };
}

/**
 * Keys under studio-live/runs/ that can go: those of runs the pointer does not name, except the newest
 * STUDIO_LIVE_KEEP_RUNS of them. Run ids sort by age (GitHub run ids grow; a local id is a timestamp).
 */
export function runsToPrune(keys: readonly string[], pointer: StudioLivePointer): string[] {
  const runOf = (k: string) => k.match(/^studio-live\/runs\/([^/]+)\//)?.[1];
  const used = new Set(Object.values(pointer.agencies).map(a => a.run));
  const unused = [...new Set(keys.map(runOf).filter((r): r is string => !!r && !used.has(r)))]
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  const drop = new Set(unused.slice(0, Math.max(0, unused.length - STUDIO_LIVE_KEEP_RUNS)));
  return keys.filter(k => drop.has(runOf(k) ?? ''));
}
