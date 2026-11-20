/**
 * CIV-1715: the Studio "Schedule Changes" page's data, one file per agency. Built from CIV-1684's comparison
 * (pipeline/feedCompare.ts) by `scripts/compare-feed-dates.ts --json tmp/studio/<slug>-before-after.json` and served
 * only by the Vite dev server at studioBeforeAfterDevUrl (vite.config.ts); never uploaded to R2 or built into a
 * deployment. The input type is structural (a FeedComparison fits it) so nothing here pulls the pipeline into the app.
 */
import { PERIOD_KEYS, type PeriodKey } from './config';
import { frequencyChange } from './frequencyChange';
import { pairChanges } from './scheduleChangePairing';
import type { DayType } from './dayTypes';

/** One route on the compared day, on one side. Minutes after midnight for first/last (past 1440 runs into the night). */
export interface StudioRouteDay {
  /** The map's route figure per period, in minutes; null or missing where the route has none. */
  headway: Partial<Record<PeriodKey, number | null>>;
  trips: number;
  first: number | null;
  last: number | null;
  /** Midday median run time per direction, whole minutes, lowest first. */
  runMinutes: number[];
  /** A period's late start or early end, as the route card reads it (CIV-1806); missing in older files. */
  edge?: Partial<Record<PeriodKey, StudioPeriodEdge>>;
}

/** A late start (`from`) or early end (`until`) in minutes after midnight, and the frequency where the period runs. */
export interface StudioPeriodEdge { from?: number; until?: number; every: number }

/**
 * How big a route's change is, which decides where the page puts it:
 * - `frequency`: a period's frequency starts, stops or moves to another grade (frequencyChange, CIV-1814 item 38), or the
 *   trip count moves by TRIP_STEP or more (and routes added or removed);
 * - `hours`: otherwise, the first or last trip moves by SPAN_STEP_MIN or more, or the trip time by RUN_STEP_MIN or more;
 * - `small`: everything else (a minute or two of span or trip time, a frequency a few minutes off, a trip or two).
 */
export type StudioChangeSize = 'frequency' | 'hours' | 'small';
export const TRIP_STEP = 3;
export const SPAN_STEP_MIN = 15;
export const RUN_STEP_MIN = 5;

export interface StudioRouteChange {
  route: string;
  name: string | null;
  /** Null: the route doesn't run on the compared day on that side (added or removed). */
  before: StudioRouteDay | null;
  after: StudioRouteDay | null;
  size: StudioChangeSize;
}

export interface StudioBeforeAfterFile {
  slug: string;
  before: { file: string; date: string };
  after: { file: string; date: string };
  /** The day type compared (Weekday for Kingston), or null when none could be. */
  day: DayType | null;
  /** Day types the comparison left out because a side's calendar doesn't hold that day's listed trips, and which side. */
  leftOut: Array<{ day: DayType; sides: Array<'before' | 'after'> }>;
  /** Changed, added and removed routes, in route order. */
  changes: StudioRouteChange[];
  unchanged: string[];
  /**
   * Every route's drawn lines on the compared day, by side and route name (CIV-1731's map), changed or not. Missing in
   * files built before CIV-1731; a route that doesn't run on a side has no entry there.
   */
  lines?: { before: Record<string, StudioRouteLine[]>; after: Record<string, StudioRouteLine[]> };
}

/** One drawn line as [lng, lat] pairs (pipeline/feedCompare.ts's RouteLine). */
export type StudioRouteLine = Array<[number, number]>;

/** Where the Vite dev server serves an agency's file (tmp/studio/<slug>-before-after.json). */
export const studioBeforeAfterDevUrl = (slug: string) => `/dev-studio/${slug}-before-after.json`;

// ---- Building the file from a comparison ----

interface InputDay { headway: Partial<Record<PeriodKey, number | null>>; trips: number; first: number | null; last: number | null; runMinutes: Record<string, number>; edge?: Partial<Record<PeriodKey, StudioPeriodEdge>> }
interface InputRoute { route: string; longName: string | null; days: Partial<Record<DayType, InputDay>> }
/** The parts of pipeline/feedCompare.ts's FeedComparison this file reads. */
export interface StudioComparisonInput {
  slug: string;
  before: { file: string; date: string };
  after: { file: string; date: string };
  comparedDays: DayType[];
  /** Per day type left out, one reason per side, each starting "before:" or "after:". */
  notRead: Partial<Record<DayType, string[]>>;
  added: InputRoute[];
  removed: InputRoute[];
  changed: Array<{ route: string; longName: string | null; days: Partial<Record<DayType, { before: InputDay | null; after: InputDay | null }>> }>;
  unchanged: string[];
}
/** The parts of pipeline/feedCompare.ts's FeedSide the lines come from. */
export interface StudioSideInput { routes: Record<string, { days: Partial<Record<DayType, { lines?: StudioRouteLine[] }>> }> }

const slim = (d: InputDay | null | undefined): StudioRouteDay | null => d ? {
  headway: Object.fromEntries(PERIOD_KEYS.filter(k => d.headway[k] != null).map(k => [k, d.headway[k]])),
  trips: d.trips,
  first: d.first,
  last: d.last,
  runMinutes: Object.values(d.runMinutes).map(Math.round).sort((a, b) => a - b),
  ...(d.edge && Object.keys(d.edge).length ? { edge: d.edge } : {}),
} : null;

const movedBy = (a: number | null | undefined, b: number | null | undefined, step: number) =>
  (a == null) !== (b == null) || (a != null && b != null && Math.abs(a - b) >= step);

/**
 * A route's frequency change across its periods (CIV-1814 item 38, Ryan "1", option a: the one shared rule,
 * shared/frequencyChange.ts): the biggest move in grades (steps; a start or stop outranks any), and whether any period
 * moved on the public scale. Null when no period changed grade. Moves inside the hidden 5 and 8 grades count, ranked
 * below public ones.
 */
export function routeFrequencyChange(before: StudioRouteDay | null, after: StudioRouteDay | null): { steps: number; publicChange: boolean } | null {
  const changes = PERIOD_KEYS.map(k => frequencyChange(before?.headway[k], after?.headway[k])).filter(c => c != null);
  if (!changes.length) return null;
  return { steps: Math.max(...changes.map(c => c.steps)), publicChange: changes.some(c => c.publicChange) };
}

/** Whether a period's frequency starts, stops or moves to another grade: these routes lead the page. */
export function frequencyMoved(before: StudioRouteDay | null, after: StudioRouteDay | null): boolean {
  return !!before && !!after && routeFrequencyChange(before, after) != null;
}

/**
 * How one time of day changed on a route, for the Studio map's colours (CIV-1731), by the same rule as the page's
 * groups (frequencyChange): `more` (service starts, or moves to a more frequent grade), `less` (it stops, or moves to a
 * less frequent grade), `same`, or `none` (no frequency on either side).
 */
export type StudioPeriodChange = 'more' | 'less' | 'same' | 'none';
export function periodChange(before: StudioRouteDay | null, after: StudioRouteDay | null, period: PeriodKey): StudioPeriodChange {
  const b = before?.headway[period] ?? null, a = after?.headway[period] ?? null;
  if (b == null && a == null) return 'none';
  const c = frequencyChange(b, a);
  return !c ? 'same' : c.better ? 'more' : 'less';
}

/** Where a route's change goes on the page (see StudioChangeSize). */
export function changeSize(before: StudioRouteDay | null, after: StudioRouteDay | null): StudioChangeSize {
  if (!before || !after) return 'frequency';
  if (frequencyMoved(before, after)) return 'frequency';
  if (Math.abs(before.trips - after.trips) >= TRIP_STEP) return 'frequency';
  if (movedBy(before.first, after.first, SPAN_STEP_MIN) || movedBy(before.last, after.last, SPAN_STEP_MIN)) return 'hours';
  const lo = (d: StudioRouteDay) => d.runMinutes[0], hi = (d: StudioRouteDay) => d.runMinutes[d.runMinutes.length - 1];
  if (movedBy(lo(before), lo(after), RUN_STEP_MIN) || movedBy(hi(before), hi(after), RUN_STEP_MIN)) return 'hours';
  return 'small';
}

const byRoute = (a: { route: string }, b: { route: string }) => a.route.localeCompare(b.route, undefined, { numeric: true });

const sideLines = (side: StudioSideInput, day: DayType): Record<string, StudioRouteLine[]> => Object.fromEntries(
  Object.entries(side.routes)
    .map(([name, r]) => [name, r.days[day]?.lines ?? []] as const)
    .filter(([, lines]) => lines.length > 0)
    .sort((a, b) => byRoute({ route: a[0] }, { route: b[0] })));

/** The page's file. With both sides, it also carries every route's lines on the compared day. */
export function studioBeforeAfterFile(cmp: StudioComparisonInput, sides?: { before: StudioSideInput; after: StudioSideInput }): StudioBeforeAfterFile {
  const day = cmp.comparedDays.includes('Weekday') ? 'Weekday' : (cmp.comparedDays[0] ?? null);
  const changes: StudioRouteChange[] = [];
  if (day) {
    for (const r of cmp.added) if (r.days[day]) changes.push({ route: r.route, name: r.longName, before: null, after: slim(r.days[day]), size: 'frequency' });
    for (const r of cmp.removed) if (r.days[day]) changes.push({ route: r.route, name: r.longName, before: slim(r.days[day]), after: null, size: 'frequency' });
    for (const c of cmp.changed) {
      const entry = c.days[day];
      if (!entry) continue;
      const before = slim(entry.before), after = slim(entry.after);
      changes.push({ route: c.route, name: c.longName, before, after, size: changeSize(before, after) });
    }
  }
  // A route renamed only in case, spacing or punctuation is one changed route, not one removed and one added (CIV-1864, #1631).
  const paired = pairChanges<StudioRouteDay, StudioRouteChange>(changes).map(c => (c.before && c.after ? { ...c, size: changeSize(c.before, c.after) } : c));
  paired.sort(byRoute);
  const leftOut = (Object.entries(cmp.notRead) as Array<[DayType, string[]]>).map(([d, why]) => ({
    day: d,
    sides: (['before', 'after'] as const).filter(side => why.some(w => w.startsWith(`${side}:`))),
  }));
  return {
    slug: cmp.slug,
    before: { file: cmp.before.file, date: cmp.before.date },
    after: { file: cmp.after.file, date: cmp.after.date },
    day,
    leftOut,
    changes: paired,
    unchanged: cmp.unchanged,
    ...(sides && day ? { lines: { before: sideLines(sides.before, day), after: sideLines(sides.after, day) } } : {}),
  };
}
