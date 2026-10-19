import { branchFigures, runningTimeFigures, type DashboardBand, type LiveV3 } from '../../../../shared/liveDashboard';

/** A pattern with fewer trips than this is too thin to draw (the main stretch) or drawn dim with a care note (a longer pattern). */
export const MIN_PATTERN_TRIPS = 30;

export interface RunTimeRow {
  key: string;
  direction: number;
  main: boolean;
  /** "From → To · N stops", or null when an older file does not name the main stretch's ends. */
  label: string | null;
  trips: number;
  /** Fewer than MIN_PATTERN_TRIPS trips, or no figures at all: nothing is drawn for the main stretch. */
  thin: boolean;
  /** Minutes: the usual (median), the timetable's and the slow end (1 in 10 over). Each is left out when the file lacks it. */
  typical?: number;
  scheduled?: number;
  p90?: number;
  /** "Westbound: scheduled 34 min · usually 31 · 1 in 10 over 37 min (524 trips)", for hover and screen readers. */
  figures: string;
}

const finite = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
export const patternLabel = (from: string, to: string, stops: number) => `${from} → ${to} · ${stops} stops`;

/** Rows for the Run time section: per direction the main stretch first, then the longer patterns in the file's order. */
export function runTimeRows(v3: LiveV3, band: DashboardBand, dirs: readonly number[], nice: (name: string) => string): Record<number, RunTimeRow[]> {
  const rt = v3.runningTime;
  const out: Record<number, RunTimeRow[]> = {};
  const make = (key: string, direction: number, main: boolean, label: string | null, f: { n: number; scheduledMin?: number; typicalMin?: number; p90Min?: number } | null | undefined): RunTimeRow => {
    const thin = !f || f.n < MIN_PATTERN_TRIPS;
    const dirName = v3.directionLabels?.[String(direction)];
    const figures = f ? `${dirName ? `${dirName}: ` : ''}${runningTimeFigures(f)} (${f.n.toLocaleString()} trips)` : '';
    return { key, direction, main, label, trips: f?.n ?? 0, thin, typical: f && finite(f.typicalMin) ? f.typicalMin : undefined, scheduled: f && finite(f.scheduledMin) ? f.scheduledMin : undefined, p90: f && finite(f.p90Min) ? f.p90Min : undefined, figures };
  };
  for (const d of dirs) {
    const rows: RunTimeRow[] = [];
    const s = rt?.stretch?.[String(d)];
    rows.push(make(`${d}-main`, d, true, s ? patternLabel(nice(s.fromName), nice(s.toName), s.stops) : null, rt?.bands[band]?.[String(d)]));
    for (const b of rt?.branches?.[String(d)] ?? []) {
      const f = branchFigures(b, band);
      if (f) rows.push(make(`${d}-${b.fromStopId}-${b.toStopId}`, d, false, patternLabel(nice(b.fromName), nice(b.toName), b.stops), f));
    }
    out[d] = rows;
  }
  return out;
}

/** One minutes range for every row of the section (both directions), whole 5-minute steps with a little headroom. Thin main rows are left out. */
export function runTimeRowScale(rows: readonly RunTimeRow[]): { min: number; max: number } {
  const v = rows.filter(r => !(r.main && r.thin)).flatMap(r => [r.typical, r.scheduled, r.p90]).filter(finite);
  if (!v.length) return { min: 0, max: 10 };
  return { min: Math.max(0, Math.floor((Math.min(...v) - 2) / 5) * 5), max: Math.ceil((Math.max(...v) + 2) / 5) * 5 };
}

/** Where a minutes value sits on the shared line, 0 to 100 (%). */
export const rowPercent = (minutes: number, scale: { min: number; max: number }) => Math.max(0, Math.min(100, ((minutes - scale.min) / ((scale.max - scale.min) || 1)) * 100));

/** Where a number sits against the line: above it, below it, or on the line just past the tail's end. */
export type LabelLane = 'above' | 'below' | 'end';
export interface RowLabel {
  id: 'usual' | 'scheduled' | 'slow';
  text: string;
  lane: LabelLane;
  /** Left edge in px from the left of the rows' box (the labels are centred on their mark, kept inside the box). */
  left: number;
}

/** Px a digit takes at the labels' size, and the gap kept between two labels or a label and a mark. */
export const LABEL_CHAR_PX = 7;
const LABEL_GAP = 3;
const MARK_HALF = { dot: 6, tick: 2 };

/**
 * Where the three numbers of a row go so none touches another or a mark. The usual always sits above the line and the
 * timetable's below it, so the two never meet however close they are; the slow end goes on the line just past the
 * tail's end, else above, else below, whichever is free. A label that cannot be placed without touching is left out
 * (the hover text still has it). `unit` (" min") is added to each number when the row has no scale of its own; `width` is the box the line spans; `inset` is the gap each end of the line keeps.
 */
export function placeRowLabels(row: Pick<RunTimeRow, 'typical' | 'scheduled' | 'p90'>, scale: { min: number; max: number }, width: number, inset: number, charPx = LABEL_CHAR_PX, unit = ''): RowLabel[] {
  if (!(width > 0)) return [];
  const xOf = (m: number) => inset + (rowPercent(m, scale) / 100) * (width - 2 * inset);
  const wOf = (t: string) => t.length * charPx;
  const clamp = (left: number, w: number) => Math.max(0, Math.min(width - w, left));
  const text = (m: number) => `${Math.round(m)}${unit}`;
  const out: RowLabel[] = [];
  const spans: Record<LabelLane, Array<[number, number]>> = { above: [], below: [], end: [] };
  const hits = (lane: LabelLane, a: number, b: number) => spans[lane].some(([x0, x1]) => a < x1 + LABEL_GAP && b > x0 - LABEL_GAP);
  const put = (id: RowLabel['id'], t: string, lane: LabelLane, left: number) => { out.push({ id, text: t, lane, left }); spans[lane].push([left, left + wOf(t)]); };
  if (row.typical != null) { const t = text(row.typical); put('usual', t, 'above', clamp(xOf(row.typical) - wOf(t) / 2, wOf(t))); }
  if (row.scheduled != null) { const t = text(row.scheduled); put('scheduled', t, 'below', clamp(xOf(row.scheduled) - wOf(t) / 2, wOf(t))); }
  if (row.typical != null && row.p90 != null && row.p90 > row.typical) {
    const t = text(row.p90), w = wOf(t), x = xOf(row.p90);
    // The marks sit on the line too: keep the end label clear of the dot and the tick.
    const marks = [row.typical != null ? [xOf(row.typical) - MARK_HALF.dot, xOf(row.typical) + MARK_HALF.dot] : null, row.scheduled != null ? [xOf(row.scheduled) - MARK_HALF.tick, xOf(row.scheduled) + MARK_HALF.tick] : null].filter((m): m is number[] => !!m);
    const endLeft = x + 5;
    const endFree = endLeft + w <= width && !marks.some(([a, b]) => endLeft < b + LABEL_GAP && endLeft + w > a - LABEL_GAP);
    if (endFree) put('slow', t, 'end', endLeft);
    else {
      const left = clamp(x - w / 2, w);
      const lane = (['above', 'below'] as const).find(l => !hits(l, left, left + w));
      if (lane) put('slow', t, lane, left);
    }
  }
  return out;
}
