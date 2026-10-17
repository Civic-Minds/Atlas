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
  /** "scheduled 34 min · usually 31 · 1 in 10 over 37 min (524 trips)", for hover and screen readers. */
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
    const figures = f ? `${runningTimeFigures(f)} (${f.n.toLocaleString()} trips)` : '';
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
