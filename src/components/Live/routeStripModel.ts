/**
 * The route strip's rules, kept apart from the drawing so they can be tested: the colour steps, the short label for a
 * stop, which stops get a label without labels overlapping, the screen-reader summary, and how a direction is read
 * from the Live analysis file (v3).
 */
import type { DashboardBand, LiveV3, UncertainStart } from '../../../shared/liveDashboard';
import { titleCase } from '../../utils/format';

export type RouteStripMode = 'delay' | 'bunching';

export interface RouteStripStop {
  stopId: string;
  /** Full stop name: shown on hover and in the table. */
  name: string;
  /** Typical delay at this stop, minutes (negative is early). Null when not measured. */
  delayMin: number | null;
  /** Share of departures 5.5+ min late (0-1). */
  lateShare: number | null;
  /** Share of gaps that are too short or too long (0-1). Null when not measured. */
  bunchingShare: number | null;
  /** Departures measured here (the delay figures). */
  n: number;
  /** Gaps measured here (the bunching figures). Defaults to `n`. */
  bunchingN?: number;
  /** Measured poorly here (for example the 510's Union Station tunnel): drawn hatched and called less exact. */
  uncertain?: boolean;
}

/** A marked stretch, by the stop ids at its two ends. */
export interface RouteStripStretch {
  fromStopId: string;
  toStopId: string;
}

export type Step = 0 | 1 | 2;

/** Delay steps use the same cutoffs as the map's delay colours: up to 1 min is on time, up to 3 min is a little late. */
export const DELAY_STEP_LIMITS = [1, 3] as const;
/** Bunching steps: share of gaps too short or too long. */
export const BUNCHING_STEP_LIMITS = [0.15, 0.25] as const;
export const MIN_N = 30;

export const STEP_LABELS: Record<RouteStripMode, readonly [string, string, string]> = {
  delay: ['On time or early', '1–3 min late', '3+ min late'],
  bunching: ['Under 15%', '15–25%', '25% or more'],
};
export const LEGEND_TITLE: Record<RouteStripMode, string> = {
  delay: 'Typical delay',
  bunching: 'Gaps too short or too long',
};

/** The colour token for a step. The values live in styles/index.css, with their dark and colour-vision versions. */
export const stepColor = (mode: RouteStripMode, step: Step) => `var(--strip-${mode}-${step})`;

/** The stop's value in this mode, or null when it was not measured. */
export function stopValue(stop: RouteStripStop, mode: RouteStripMode): number | null {
  if (mode === 'delay') return stop.n > 0 ? stop.delayMin : null;
  return stopN(stop, mode) > 0 ? stop.bunchingShare : null;
}

export function stopN(stop: RouteStripStop, mode: RouteStripMode): number {
  return mode === 'bunching' ? stop.bunchingN ?? stop.n : stop.n;
}

export function stepFor(mode: RouteStripMode, value: number | null): Step | null {
  if (value == null || !Number.isFinite(value)) return null;
  const [a, b] = mode === 'delay' ? DELAY_STEP_LIMITS : BUNCHING_STEP_LIMITS;
  return value <= a ? 0 : value <= b ? 1 : 2;
}

const MINUS = '−';
const num = (x: number) => (Math.round(x * 10) / 10).toString().replace('-', MINUS);
export const pct = (x: number) => `${Math.round(x * 100)}%`;
/** "+3.1 min late", "−2 min early", "on time". */
export function delayText(min: number): string {
  if (Math.abs(min) < 0.05) return 'on time';
  return min > 0 ? `+${num(min)} min late` : `${num(min)} min early`;
}

/**
 * A short name for a label under the strip. "Spadina Ave at Queen St West South Side" becomes "Queen St West" (the
 * cross street); stations and loops keep their own name ("Broadview Station at Bay 6" becomes "Broadview Station").
 */
export function shortStopName(name: string): string {
  let s = name.replace(/\s+(North|South|East|West)\s+Side$/i, '').replace(/\s+Streetcar Platform$/i, '').replace(/\s+at Bay \d+$/i, '').trim();
  const at = s.match(/^(.*?)\s+at\s+(.*)$/i);
  if (at) s = /\b(station|loop|terminal)\b/i.test(at[1]) ? at[1] : at[2];
  return s;
}

/** Rough width of a label in px at 12px Inter, capped at `maxPx` (longer labels are cut with an ellipsis). */
export function labelWidth(text: string, maxPx = 120): number {
  return Math.min(maxPx, Math.ceil(text.length * 6.4) + 4);
}

export interface LabelCandidate {
  index: number;
  /** Centre of the stop, px from the strip's left edge. */
  x: number;
  width: number;
}

/**
 * Which stops get a label: the two terminals, then the ends of the marked stretches, then `majors` evenly spaced
 * stops (moved to a neighbour when the even spot would overlap). Labels never overlap, and none goes past the edges:
 * the first is left-aligned at the start and the last right-aligned at the end. Returns stop indexes in order.
 */
export function pickLabels({ xs, widths, width, priority = [], majors = 5, gap = 10 }: {
  xs: readonly number[];
  widths: readonly number[];
  width: number;
  priority?: readonly number[];
  majors?: number;
  gap?: number;
}): number[] {
  const n = xs.length;
  if (n === 0) return [];
  const last = n - 1;
  const span = (i: number): [number, number] => {
    if (i === 0) return [0, widths[i]];
    if (i === last) return [width - widths[i], width];
    const l = Math.max(0, Math.min(width - widths[i], xs[i] - widths[i] / 2));
    return [l, l + widths[i]];
  };
  const placed: number[] = [];
  const fits = (i: number) => {
    const [a, b] = span(i);
    return placed.every(j => { const [c, d] = span(j); return b + gap <= c || d + gap <= a; });
  };
  const tryAdd = (i: number) => {
    if (i < 0 || i > last || placed.includes(i) || !fits(i)) return false;
    placed.push(i);
    return true;
  };
  tryAdd(0);
  tryAdd(last);
  for (const i of priority) tryAdd(i);
  for (let k = 1; k <= majors; k++) {
    const target = Math.round((k * last) / (majors + 1));
    for (const d of [0, 1, -1, 2, -2]) if (tryAdd(target + d)) break;
  }
  return placed.sort((a, b) => a - b);
}

export interface StretchSpan {
  kind: 'delaysStart' | 'bunchingForms';
  label: string;
  from: number;
  to: number;
}

/** Index range of a marked stretch in the stop list, or null when either end is not on it. */
export function stretchSpan(stops: readonly RouteStripStop[], s: RouteStripStretch | null | undefined, kind: StretchSpan['kind']): StretchSpan | null {
  if (!s) return null;
  const a = stops.findIndex(x => x.stopId === s.fromStopId);
  const b = stops.findIndex(x => x.stopId === s.toStopId);
  if (a < 0 || b < 0) return null;
  return { kind, label: kind === 'delaysStart' ? 'Delays start' : 'Bunching forms', from: Math.min(a, b), to: Math.max(a, b) };
}

/** One sentence for screen readers: the direction, its ends, how many stops fall in each step, and the marked stretch. */
export function stripSummary(stops: readonly RouteStripStop[], mode: RouteStripMode, directionLabel: string, stretch: StretchSpan | null): string {
  if (stops.length === 0) return `${directionLabel}: no stops measured.`;
  const counts = [0, 0, 0];
  let missing = 0;
  for (const s of stops) {
    const step = stepFor(mode, stopValue(s, mode));
    if (step == null) missing++; else counts[step]++;
  }
  const [l0, l1, l2] = STEP_LABELS[mode];
  const what = mode === 'delay' ? 'Typical delay' : 'Share of gaps too short or too long';
  const parts = [`${what}, ${directionLabel.toLowerCase()} from ${stops[0].name} to ${stops[stops.length - 1].name}, ${stops.length} stops: ${counts[0]} ${l0.toLowerCase()}, ${counts[1]} ${l1.toLowerCase()}, ${counts[2]} ${l2.toLowerCase()}${missing ? `, ${missing} not measured` : ''}.`];
  if (stretch) parts.push(`${stretch.label} between ${stops[stretch.from].name} and ${stops[stretch.to].name}.`);
  parts.push('Use the left and right arrow keys to hear each stop.');
  return parts.join(' ');
}

/** The text for one stop on hover, focus or tap. */
export function stopDetail(stop: RouteStripStop): { name: string; lines: string[] } {
  const lines: string[] = [];
  if (stop.n > 0 && stop.delayMin != null) lines.push(`Typical delay ${delayText(stop.delayMin)}${stop.lateShare != null ? `, ${pct(stop.lateShare)} of departures late` : ''}`);
  else lines.push('Delay not measured');
  const bn = stop.bunchingN ?? stop.n;
  if (stop.bunchingShare != null && bn > 0) lines.push(`${pct(stop.bunchingShare)} of gaps too short or too long (${bn.toLocaleString()} gaps)`);
  lines.push(`${stop.n.toLocaleString()} departures measured${stop.n < MIN_N ? ': too few to rely on' : ''}`);
  if (stop.uncertain) lines.push('Less exact here: vehicles report their location less often');
  return { name: stop.name, lines };
}

export interface RouteStripDirection {
  directionId: number;
  label: string;
  stops: RouteStripStop[];
  delaysStart: RouteStripStretch | null;
  bunchingForms: RouteStripStretch | null;
}

/**
 * One direction of a route from the Live analysis file, for one time of day. Stops are in route order. Stops off the
 * usual pattern (order below 0) are left out: in the 505's file they include a stop from the other end of the route.
 * Bunching figures are joined by stop id, and a stop with no gaps counted has no bunching value (not zero).
 */
export function routeStripFromV3(v3: LiveV3, directionId: number, band: DashboardBand = 'all', uncertain: readonly UncertainStart[] = []): RouteStripDirection {
  const bandData = v3.bands?.[band] ?? { stops: v3.stops, buildup: v3.buildup };
  const lessExact = uncertain.find(u => u.directionId === directionId)?.stops ?? 0;
  const bunchingBand = v3.bunching.find(b => b.directionId === directionId)?.bands[band] ?? null;
  const bunchingById = new Map((bunchingBand?.stops ?? []).map(s => [s.stopId, s]));
  const stops: RouteStripStop[] = bandData.stops
    .filter(s => s.directionId === directionId && s.order >= 0)
    .sort((a, b) => a.order - b.order)
    .map(s => {
      const b = bunchingById.get(s.stopId);
      return {
        stopId: s.stopId,
        name: titleCase(s.name),
        delayMin: s.n > 0 ? s.medianMin : null,
        lateShare: s.n > 0 ? s.lateShare : null,
        bunchingShare: b && b.n > 0 ? b.badShare : null,
        n: s.n,
        bunchingN: b?.n ?? 0,
        uncertain: s.order < lessExact,
      };
    });
  const buildup = bandData.buildup.find(b => b.directionId === directionId);
  const forms = buildup?.kind === 'forms' ? buildup.forms : null;
  const bForms = bunchingBand?.kind === 'forms' ? bunchingBand.forms : null;
  return {
    directionId,
    label: v3.directionLabels[String(directionId)] ?? `Direction ${directionId}`,
    stops,
    delaysStart: forms ? { fromStopId: forms.fromStopId, toStopId: forms.toStopId } : null,
    bunchingForms: bForms ? { fromStopId: bForms.fromStopId, toStopId: bForms.toStopId } : null,
  };
}
