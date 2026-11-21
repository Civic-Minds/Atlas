import { frequencyChange } from '../../../shared/frequencyChange';
import { PERIOD_KEYS, type PeriodKey } from '../../../shared/config';
import { RUN_STEP_MIN, SPAN_STEP_MIN, TRIP_STEP, changeSize, periodChange, routeFrequencyChange, type StudioBeforeAfterFile, type StudioPeriodChange, type StudioRouteChange } from '../../../shared/studioBeforeAfter';
import { STUDIO_TARGETS, type StudioVehicleGroup, type StudioVehiclesFile } from '../../../shared/studioVehicles';
import type { MapLine } from '../../context/PageMapOverlay';
import { STUDIO_CHANGES_TEXT } from '../../../shared/studioWording';
import { pairFigures, routeFigureRows, routeTitle } from './StudioRouteTable';

/**
 * Fleet's figures (Atlas Studio, CIV-1731, CIV-1828): the change list's groups and rows, each route's change colour at
 * the time of day, the map's lines, and the group of routes an open route shares buses with. Its words are in
 * shared/studioWording.ts.
 */

const C = STUDIO_CHANGES_TEXT;

export const DEFAULT_PERIOD: PeriodKey = 'midday';

/** The colours, from the History page's frequency-change line (better, worse, no change) and the map's faded route. */
export const CHANGE_COLOR: Record<StudioPeriodChange, string> = {
  more: 'var(--status-positive)',
  less: 'var(--status-negative)',
  same: 'var(--status-neutral)',
  none: 'var(--dim-route)',
};

export interface ChangeGroup { key: string; title: string; routes: StudioRouteChange[] }

/** The sidebar's groups, in the order the page had them: frequency or trips, first or last trip, added, removed, small. */
export function changeGroups(file: StudioBeforeAfterFile): ChangeGroup[] {
  // Each route's group by the shared rule as it stands now (changeSize), not the size its file was written with.
  const of = (size: StudioRouteChange['size']) => file.changes.filter(c => c.before && c.after && changeSize(c.before, c.after) === size);
  const added = file.changes.filter(c => !c.before), removed = file.changes.filter(c => !c.after);
  // CIV-1814 item 38: routes whose frequency changed grade lead, public-grade changes first, then those only inside the
  // hidden 5 and 8 grades, each by the biggest move in grades; then those where only the trip count moved; route order
  // breaks ties.
  const rank = (c: StudioRouteChange) => { const f = routeFrequencyChange(c.before, c.after); return f ? (f.publicChange ? 1000 : 0) + f.steps : -1; };
  const frequency = of('frequency').map(c => ({ c, r: rank(c) })).sort((x, y) => y.r - x.r).map(x => x.c);
  return [
    { key: 'frequency', title: C.frequencyTitle, routes: frequency },
    { key: 'hours', title: C.hoursTitle, routes: of('hours') },
    { key: 'added', title: C.addedTitle(added.length), routes: added },
    { key: 'removed', title: C.removedTitle(removed.length), routes: removed },
    { key: 'small', title: C.smallTitle, routes: of('small') },
  ].filter(g => g.routes.length > 0);
}

/** A route's change at one time of day, for its colour; an unchanged route reads "same". */
export function routeChangeAt(file: StudioBeforeAfterFile, route: string, period: PeriodKey): StudioPeriodChange {
  const c = file.changes.find(x => x.route === route);
  if (!c) return 'same';
  if (!c.before) return 'more';
  if (!c.after) return 'less';
  return periodChange(c.before, c.after, period);
}

/** The map's lines: each route's newer shape (a removed route's older one, dashed) in its change colour; the picked route's older shape dashed under it. */
export function studioMapLines(file: StudioBeforeAfterFile, period: PeriodKey, picked: string | null): MapLine[] {
  const before = file.lines?.before ?? {}, after = file.lines?.after ?? {};
  const names = [...new Set([...Object.keys(after), ...Object.keys(before)])];
  const out: MapLine[] = [];
  for (const route of names) {
    const color = CHANGE_COLOR[routeChangeAt(file, route, period)];
    const label = routeTitle({ route, name: file.changes.find(c => c.route === route)?.name ?? null }).text;
    const removed = !after[route];
    if (route === picked && !removed && before[route]) {
      before[route].forEach((coordinates, i) => out.push({ id: `${route}:before:${i}`, route, label, coordinates, color: CHANGE_COLOR.same, dashed: true, width: 4 }));
    }
    (removed ? before[route] : after[route]).forEach((coordinates, i) => out.push({ id: `${route}:${removed ? 'before' : 'after'}:${i}`, route, label, coordinates, color, dashed: removed }));
  }
  return out;
}

/** What a list row shows (CIV-1806): one figure, older and newer, and its name when it isn't the time of day's frequency. */
/** `key`: the route table row the figure comes from (a time of day, trips, first or last trip, trip time). */
export interface RowFigure { key: string; label: string | null; before: string; after: string }

/** The figures each group's rows choose from: a frequency or trips change, its frequencies and trips; a first or last
 * trip or trip time change, those; a small change, any. */
const GROUP_KEYS: Record<StudioRouteChange['size'], ReadonlyArray<string> | null> = {
  frequency: [...PERIOD_KEYS, 'trips'],
  hours: ['first', 'last', 'run'],
  small: null,
};

/** How far a figure moved: a frequency in grades (frequencyChange; a start or stop outranks any), the others in their
 * own step (shared/studioBeforeAfter.ts changeSize's). 1 or more is a move that puts a route in its group. */
function movedSteps(c: StudioRouteChange, key: string): number {
  const b = c.before!, a = c.after!;
  const by = (x: number | null | undefined, y: number | null | undefined, step: number) => (x == null && y == null ? 0 : x == null || y == null ? Infinity : Math.abs(x - y) / step);
  if (key === 'trips') return by(b.trips, a.trips, TRIP_STEP);
  if (key === 'first' || key === 'last') return by(b[key], a[key], SPAN_STEP_MIN);
  if (key === 'run') return Math.max(by(b.runMinutes[0], a.runMinutes[0], RUN_STEP_MIN), by(b.runMinutes.at(-1), a.runMinutes.at(-1), RUN_STEP_MIN));
  return frequencyChange(b.headway[key as PeriodKey], a.headway[key as PeriodKey])?.steps ?? 0;
}

/**
 * The figure a list row shows (Ryan, CIV-1806: "the dates u are comparing are not by the actual numbers"): the time of
 * day's frequency where the route was added or removed, or where that frequency changed grade (frequencyChange); otherwise the
 * figure that moved most among its group's own kind (an hours row shows its first or last trip or trip time), named by
 * the route table's own label.
 */
export function rowFigure(c: StudioRouteChange, period: PeriodKey): RowFigure {
  const here = pairFigures(c.before, c.after, period);
  if (!c.before || !c.after) {
    // Added or removed: this time of day's figure, or where it has none, the first time of day the route ran.
    if (here.before !== here.after) return { key: period, label: null, ...here };
    const ran = routeFigureRows(c).find(r => (PERIOD_KEYS as readonly string[]).includes(r.key) && r.before !== r.after);
    return ran ? { key: ran.key, label: ran.label, before: ran.before, after: ran.after } : { key: period, label: null, ...here };
  }
  if (movedSteps(c, period) >= 1) return { key: period, label: null, ...here };
  const keys = GROUP_KEYS[changeSize(c.before, c.after)];
  const changed = routeFigureRows(c).filter(r => r.before !== r.after && (!keys || keys.includes(r.key)));
  // A frequency that changed grade comes before trips (the group leads with frequency); otherwise the biggest move.
  const tier = (key: string) => ((PERIOD_KEYS as readonly string[]).includes(key) && movedSteps(c, key) >= 1 ? 1 : 0);
  const pick = changed.reduce<(typeof changed)[number] | null>((best, r) => (!best || tier(r.key) > tier(best.key) || (tier(r.key) === tier(best.key) && movedSteps(c, r.key) > movedSteps(c, best.key)) ? r : best), null);
  return pick ? { key: pick.key, label: pick.key === period ? null : pick.label, before: pick.before, after: pick.after } : { key: period, label: null, ...here };
}

/** The group of routes that share buses with this route, at the time of day. */
export function groupFor(vehicles: StudioVehiclesFile, route: string, period: PeriodKey): StudioVehicleGroup | null {
  return vehicles.periods[period]?.find(g => g.routes.includes(route)) ?? null;
}

/**
 * The whole agency's buses at the time of day (CIV-1922): the groups' own figures added up (groups share no routes, so
 * no bus counts twice), as one group the buses table reads. A target where any group has no figure has none. Nothing is
 * calculated again here: each number is the engine's (scripts/vehicles-needed.ts).
 */
export function agencyFleet(vehicles: StudioVehiclesFile, period: PeriodKey): StudioVehicleGroup | null {
  const groups = vehicles.periods[period];
  if (!groups?.length) return null;
  const atTarget: StudioVehicleGroup['atTarget'] = {};
  for (const hw of STUDIO_TARGETS) {
    const figures = groups.map(g => g.atTarget[hw]);
    if (figures.every((n): n is number => typeof n === 'number')) atTarget[hw] = figures.reduce((x, n) => x + n, 0);
  }
  return { routes: [], scheduled: groups.reduce((x, g) => x + g.scheduled, 0), implied: groups.reduce((x, g) => x + g.implied, 0), runningMin: 0, layoverMin: null, atTarget };
}
