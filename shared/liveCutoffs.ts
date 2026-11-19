/**
 * Planners' own late, early, bunched and gapped cut-offs (CIV-1869). Live keeps how late each departure was and how big
 * each gap was, as small counts in fixed steps, so a figure can be worked out again at another cut-off without the
 * recordings. Defaults stay the shared rules (shared/rules/live.ts); rankings always use them; a figure at a planner's
 * own cut-off is labelled with it.
 *
 * Steps: lateness in half minutes, gaps in half minutes, a gap against the scheduled gap in quarters. A cut-off must sit
 * on a step inside the kept range, so the figure is exact; anything else is refused, never rounded.
 */
import { BUNCHED_GAP_SEC, CUTOFF_LIMITS, EARLY_AT_OR_BELOW_MIN, GAPPED_FACTOR, LATE_ABOVE_MIN } from './rules/live.js';

export { CUTOFF_LIMITS };

/** Counts in fixed steps: `counts[k]` is the count in step `start + k`. Leading and trailing empty steps are left out. */
export interface Steps { start: number; counts: number[] }

/** What a week's figures keep for working out other cut-offs. Absent in files built before CIV-1869. */
export interface CutoffCounts {
  /** Trip-start departures by lateness: step i holds delays over (i-1)/2 and up to i/2 minutes. The ends hold everything beyond. */
  lateness: Steps;
  /** Gaps between vehicles: step j holds gaps from j/2 up to (but not including) (j+1)/2 minutes. The last holds everything longer. */
  gaps: Steps;
  /** Gaps against the scheduled gap: step i holds ratios over (i-1)/4 and up to i/4. Gaps with no scheduled gap are left out. */
  gapRatio: Steps;
}

const LATENESS_LO = -20, LATENESS_HI = 61; // -10 min and under … over 30 min
const GAP_HI = 20; // 10 min and longer
const RATIO_HI = 25; // over 6 times the scheduled gap

export class StepCounter {
  private m = new Map<number, number>();
  constructor(private lo: number, private hi: number) {}
  add(step: number) {
    const s = Math.min(this.hi, Math.max(this.lo, step));
    this.m.set(s, (this.m.get(s) ?? 0) + 1);
  }
  steps(): Steps {
    if (!this.m.size) return { start: 0, counts: [] };
    const keys = [...this.m.keys()];
    const start = Math.min(...keys), end = Math.max(...keys);
    return { start, counts: Array.from({ length: end - start + 1 }, (_, k) => this.m.get(start + k) ?? 0) };
  }
}

export const latenessCounter = () => new StepCounter(LATENESS_LO, LATENESS_HI);
export const gapCounter = () => new StepCounter(0, GAP_HI);
export const gapRatioCounter = () => new StepCounter(0, RATIO_HI);
/** The step a departure's delay (seconds) falls in. */
export const latenessStep = (delaySec: number) => Math.ceil(delaySec / 30);
/** The step a gap (seconds) falls in. */
export const gapStep = (gapSec: number) => Math.floor(gapSec / 30);
/** The step a gap against the scheduled gap falls in. */
export const gapRatioStep = (gapSec: number, scheduledSec: number) => Math.ceil((gapSec / scheduledSec) * 4);

const total = (s: Steps) => s.counts.reduce((a, b) => a + b, 0);
const sumWhere = (s: Steps, keep: (step: number) => boolean) => s.counts.reduce((a, c, k) => (keep(s.start + k) ? a + c : a), 0);

function check(name: keyof typeof CUTOFF_LIMITS, label: string, v: number): number {
  const l = CUTOFF_LIMITS[name];
  if (!Number.isFinite(v) || v < l.min || v > l.max || Math.abs(v / l.step - Math.round(v / l.step)) > 1e-9) {
    throw new Error(`${label} must be between ${l.min} and ${l.max}, in steps of ${l.step}.`);
  }
  return v;
}

export interface Cutoffs {
  /** Late: more than this many minutes after the scheduled time. */
  lateAfterMin: number;
  /** Early: this many minutes or more before the scheduled time. */
  earlyBeforeMin: number;
  /** Bunched: a gap under this many minutes behind the vehicle ahead. */
  bunchedWithinMin: number;
  /** Gapped: a gap more than this many times the scheduled gap. */
  gappedFactor: number;
}

export const DEFAULT_CUTOFFS: Cutoffs = {
  lateAfterMin: LATE_ABOVE_MIN,
  earlyBeforeMin: Math.abs(EARLY_AT_OR_BELOW_MIN),
  bunchedWithinMin: BUNCHED_GAP_SEC / 60,
  gappedFactor: GAPPED_FACTOR,
};

/** A planner's cut-offs from tool arguments: each one left out stays the default; each one given is checked and its figure given beside the standard one. */
export function cutoffsFrom(args: { late_after_min?: unknown; early_before_min?: unknown; bunched_within_min?: unknown; gapped_factor?: unknown }): { cutoffs: Cutoffs; custom: Array<keyof Cutoffs> } {
  const c = { ...DEFAULT_CUTOFFS };
  const custom: Array<keyof Cutoffs> = [];
  const set = (key: keyof Cutoffs, raw: unknown, label: string) => {
    if (raw == null || raw === '') return;
    const v = check(key, label, Number(raw));
    c[key] = v;
    custom.push(key);
  };
  set('lateAfterMin', args.late_after_min, 'late_after_min');
  set('earlyBeforeMin', args.early_before_min, 'early_before_min');
  set('bunchedWithinMin', args.bunched_within_min, 'bunched_within_min');
  set('gappedFactor', args.gapped_factor, 'gapped_factor');
  return { cutoffs: c, custom };
}

const minutes = (n: number) => `${n} minute${n === 1 ? '' : 's'}`;

/** Each figure's meaning in words, at any cut-off: the default definitions are these at the defaults. */
export const lateText = (min: number) => `More than ${minutes(min)} after the scheduled time.`;
export const earlyText = (min: number) => `${minutes(min)[0].toUpperCase()}${minutes(min).slice(1)} or more before the scheduled time.`;
// The wording says "or less" while the rule counts gaps under the cut-off (shared/bunching.ts); kept as it was, raised with the manager.
export const bunchedText = (min: number) => `A gap of ${minutes(min)} or less behind the vehicle ahead.`;
export const gappedText = (factor: number) => `A gap more than ${factor} times the scheduled gap.`;

/** Share of trip-start departures more than `min` late. */
export function lateShareAt(c: CutoffCounts, min: number): { share: number; departures: number } | null {
  const n = total(c.lateness);
  return n ? { share: sumWhere(c.lateness, i => i >= 2 * min + 1) / n, departures: n } : null;
}
/** Share of trip-start departures `min` or more early. */
export function earlyShareAt(c: CutoffCounts, min: number): { share: number; departures: number } | null {
  const n = total(c.lateness);
  return n ? { share: sumWhere(c.lateness, i => i <= -2 * min) / n, departures: n } : null;
}
/** Share of gaps under `min` minutes. */
export function bunchedShareAt(c: CutoffCounts, min: number): { share: number; gaps: number } | null {
  const n = total(c.gaps);
  return n ? { share: sumWhere(c.gaps, j => j < 2 * min) / n, gaps: n } : null;
}
/** Share of gaps more than `factor` times the scheduled gap, out of every gap (gaps with no scheduled gap never count as gapped). */
export function gappedShareAt(c: CutoffCounts, factor: number): { share: number; gaps: number } | null {
  const n = total(c.gaps);
  return n ? { share: sumWhere(c.gapRatio, i => i >= 4 * factor + 1) / n, gaps: n } : null;
}

/** One figure at a planner's own cut-off, with the cut-off in words beside it. `share` is null where the file has no counts yet. */
export interface CustomFigure { share: number | null; count: number | null; definition: string; note?: string }

const NO_COUNTS = 'Atlas has no figure at this cut-off for this route yet; the figures above use the standard cut-offs.';
const r3 = (x: number) => Math.round(x * 1000) / 1000;

/**
 * The figures at a planner's own cut-offs, one per cut-off they set (CIV-1869), keyed late / early / bunched / gapped.
 * Each says its cut-off in words. Bunched and gapped come separately: at custom cut-offs one gap could count as both, so
 * no combined share is given.
 */
export function figuresAtCutoffs(c: CutoffCounts | null | undefined, cut: Cutoffs, custom: ReadonlyArray<keyof Cutoffs>): Partial<Record<'late' | 'early' | 'bunched' | 'gapped', CustomFigure>> {
  const out: Partial<Record<'late' | 'early' | 'bunched' | 'gapped', CustomFigure>> = {};
  const fig = (r: { share: number; departures?: number; gaps?: number } | null, definition: string): CustomFigure =>
    r ? { share: r3(r.share), count: r.departures ?? r.gaps ?? 0, definition } : c ? { share: null, count: 0, definition } : { share: null, count: null, definition, note: NO_COUNTS };
  for (const k of custom) {
    if (k === 'lateAfterMin') out.late = fig(c ? lateShareAt(c, cut.lateAfterMin) : null, lateText(cut.lateAfterMin));
    if (k === 'earlyBeforeMin') out.early = fig(c ? earlyShareAt(c, cut.earlyBeforeMin) : null, earlyText(cut.earlyBeforeMin));
    if (k === 'bunchedWithinMin') out.bunched = fig(c ? bunchedShareAt(c, cut.bunchedWithinMin) : null, bunchedText(cut.bunchedWithinMin));
    if (k === 'gappedFactor') out.gapped = fig(c ? gappedShareAt(c, cut.gappedFactor) : null, gappedText(cut.gappedFactor));
  }
  return out;
}
