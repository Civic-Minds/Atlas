import { branchFigures, runningTimeFigures, type DashboardBand, type LiveV3 } from '../../../../shared/liveDashboard';
import { countOf } from '../../../../shared/overflowText';
import { SHORT_TURN_LABEL } from '../../../../shared/liveWording';
import { countText } from '../../../../shared/numberText';

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
  /** Minutes: the usual (median) and the timetable's. Each is left out when the file lacks it. */
  typical?: number;
  scheduled?: number;
  /** "Westbound: scheduled 34 min · usually 31 (524 trips)", for hover and screen readers. */
  figures: string;
}

const finite = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
export const patternLabel = (from: string, to: string, stops: number) => `${from} → ${to} · ${countOf(stops, 'stop')}`;

/** Rows for the Run time section: per direction the main stretch first, then the longer patterns in the file's order. */
export function runTimeRows(v3: LiveV3, band: DashboardBand, dirs: readonly number[], nice: (name: string) => string): Record<number, RunTimeRow[]> {
  const rt = v3.runningTime;
  const out: Record<number, RunTimeRow[]> = {};
  const make = (key: string, direction: number, main: boolean, label: string | null, f: { n: number; scheduledMin?: number; typicalMin?: number } | null | undefined): RunTimeRow => {
    const thin = !f || f.n < MIN_PATTERN_TRIPS;
    const dirName = v3.directionLabels?.[String(direction)];
    const figures = f ? `${dirName ? `${dirName}: ` : ''}${runningTimeFigures(f)} (${countText(f.n)} trips)` : '';
    return { key, direction, main, label, trips: f?.n ?? 0, thin, typical: f && finite(f.typicalMin) ? f.typicalMin : undefined, scheduled: f && finite(f.scheduledMin) ? f.scheduledMin : undefined, figures };
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

/** The kind words on the planner's per-pattern rows (CIV-945, wording to confirm). */
export const PATTERN_KIND_WORDS = { main: 'Main', shortTurn: SHORT_TURN_LABEL, branch: 'Branch' } as const;

/**
 * The planner's rows for one direction, one per regular pattern timed on its own trips (CIV-945), the main pattern first,
 * each labelled "Main: From → To", the stop count in its hover. Null when the file has no per-pattern figures (older files).
 */
export function patternRunTimeRows(v3: LiveV3, band: DashboardBand, d: number, nice: (name: string) => string): RunTimeRow[] | null {
  const list = v3.runningTime?.patterns?.[String(d)];
  if (!list?.length) return null;
  const dirName = v3.directionLabels?.[String(d)];
  // A main pattern trimmed at a poorly measured end to no more stops than a short turn would read as no longer than it
  // (the 510 northbound at the Union tunnel): its row is left out; the week table still gives the main pattern's figure.
  const main = list.find(p => p.kind === 'main');
  const hideMain = !!main && main.stops < main.patternStops && list.some(p => p.kind === 'shortTurn' && p.stops >= main.stops);
  return list.filter(p => !(hideMain && p === main)).flatMap(p => {
    const f = branchFigures(p, band);
    if (!f) return [];
    return [{
      key: `${d}-${p.kind}-${p.fromStopId}-${p.toStopId}`, direction: d, main: p.kind === 'main',
      // The row names only its ends, so it fits one line on the card; the stop count is in the hover, with a pattern
      // trimmed at a poorly measured end saying how much of it is timed: "13 of 18 stops".
      label: `${PATTERN_KIND_WORDS[p.kind]}: ${nice(p.fromName)} → ${nice(p.toName)}`,
      trips: f.n, thin: f.n < MIN_PATTERN_TRIPS,
      typical: finite(f.typicalMin) ? f.typicalMin : undefined, scheduled: finite(f.scheduledMin) ? f.scheduledMin : undefined,
      figures: `${dirName ? `${dirName}: ` : ''}${p.stops < p.patternStops ? `${p.stops} of ${p.patternStops}` : p.stops} stops, ${runningTimeFigures(f)} (${countText(f.n)} trips)`,
    }];
  });
}

/** One minutes range for every row of the section (both directions), whole 5-minute steps with a little headroom. Thin main rows are left out. */
export function runTimeRowScale(rows: readonly RunTimeRow[]): { min: number; max: number } {
  const v = rows.filter(r => !(r.main && r.thin)).flatMap(r => [r.typical, r.scheduled]).filter(finite);
  if (!v.length) return { min: 0, max: 10 };
  return { min: Math.max(0, Math.floor((Math.min(...v) - 2) / 5) * 5), max: Math.ceil((Math.max(...v) + 2) / 5) * 5 };
}

/** Where a minutes value sits on the shared line, 0 to 100 (%). */
export const rowPercent = (minutes: number, scale: { min: number; max: number }) => Math.max(0, Math.min(100, ((minutes - scale.min) / ((scale.max - scale.min) || 1)) * 100));

/** Where a number sits against the line: above it or below it. */
export type LabelLane = 'above' | 'below';
export interface RowLabel {
  id: 'usual' | 'scheduled';
  text: string;
  lane: LabelLane;
  /** Left edge in px from the left of the rows' box (the labels are centred on their mark, kept inside the box). */
  left: number;
}

/** Px a digit takes at the labels' size. */
export const LABEL_CHAR_PX = 7;

/**
 * Where the two numbers of a row go. The usual always sits above the line and the timetable's below it, so the two
 * never meet however close they are. `unit` (" min") is added to each number when the row has no scale of its own; `width` is the box the line spans; `inset` is the gap each end of the line keeps.
 */
export function placeRowLabels(row: Pick<RunTimeRow, 'typical' | 'scheduled'>, scale: { min: number; max: number }, width: number, inset: number, charPx = LABEL_CHAR_PX, unit = ''): RowLabel[] {
  if (!(width > 0)) return [];
  const xOf = (m: number) => inset + (rowPercent(m, scale) / 100) * (width - 2 * inset);
  const wOf = (t: string) => t.length * charPx;
  const clamp = (left: number, w: number) => Math.max(0, Math.min(width - w, left));
  const text = (m: number) => `${Math.round(m)}${unit}`;
  const out: RowLabel[] = [];
  const put = (id: RowLabel['id'], t: string, lane: LabelLane, left: number) => { out.push({ id, text: t, lane, left }); };
  if (row.typical != null) { const t = text(row.typical); put('usual', t, 'above', clamp(xOf(row.typical) - wOf(t) / 2, wOf(t))); }
  if (row.scheduled != null) { const t = text(row.scheduled); put('scheduled', t, 'below', clamp(xOf(row.scheduled) - wOf(t) / 2, wOf(t))); }
  return out;
}
