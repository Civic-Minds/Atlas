import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { periodKeyForHour } from '../../../../shared/config';
import { runTimeStretchLabel, runTimeTakeaway, runningTimeSentence, type DashboardBand, type LiveV3 } from '../../../../shared/liveDashboard';
import { titleCase } from '../../../utils/format';
import { shortStopName } from '../../../utils/stopLabel';
import { liveChartHours } from '../../../utils/sparklinePeriods';
import RunTimeChart, { runTimeScale } from '../../charts/RunTimeChart';
import { SectionTitle } from '../../ui/PageTitle';
import Section from './Section';
import { BAND_WORDS, dirsOf } from './figures';
import { MIN_PATTERN_TRIPS, placeRowLabels, rowPercent, runTimeRowScale, runTimeRows, type RowLabel, type RunTimeRow } from './runTimeRows';

/** The one derivation of the run-time figures, so every surface draws the same numbers. */
export function runTimeModel(v3: LiveV3, band: DashboardBand, dir: number | null) {
  const rt = v3.runningTime;
  const dirs = dirsOf(v3, dir);
  const hoursOf = (d: number) => (rt?.byHour[String(d)] ?? []).filter(h => h.n >= 1 && (band === 'all' || periodKeyForHour(h.hour) === band));
  const scale = runTimeScale(dirs.map(hoursOf));
  const axis = liveChartHours(h => dirs.some(dd => hoursOf(dd).some(x => x.hour === h && x.n >= 5)));
  return { rt, dirs, hoursOf, scale, axis };
}

/** The summary line: the usual trip, the timetable's, and the slow end. Shared by the Explore section and the tool panel's card. */
export const runTimeLine = (f: { typicalMin: number; scheduledMin: number; p90Min: number }) =>
  `Usually ${Math.round(f.typicalMin)} min · timetable ${Math.round(f.scheduledMin)} · 1 in 10 over ${Math.round(f.p90Min)}`;

/** The stretch the run time covers, in short stop names (empty when the file does not say). */
export const runTimeStretchOf = (v3: LiveV3, d: number) => runTimeStretchLabel(v3.runningTime?.stretch?.[String(d)], n => shortStopName(titleCase(n)));

const INSET = 6; // px each end, so a dot on the first or last minute is not clipped
/** Room on the right of the rows for "min" at the end of the scale (and the slow end's number). */
const GUTTER = 'pr-7';

/** The width of a box in px, kept up to date (0 until it is measured, and where there is no ResizeObserver). */
function useBoxWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const read = () => setWidth(Math.round(el.getBoundingClientRect().width));
    read();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

/** What the marks mean, in the words the section already uses. */
export function RowLegend({ dense = false, inline = false }: { dense?: boolean; /** No top margin: the legend sits in a header row. */ inline?: boolean }) {
  const label = 'text-xs text-[var(--text-muted)]';
  return (
    <div className={`${inline ? '' : dense ? 'mt-2' : 'mt-3'} flex flex-wrap items-center ${inline ? 'justify-end gap-x-3' : 'gap-x-5'} gap-y-1`} aria-hidden="true">
      <span className={`inline-flex items-center gap-1.5 ${label}`}><span className="inline-block h-2.5 w-2.5 rounded-full bg-[var(--text-primary)]" />Usually</span>
      <span className={`inline-flex items-center gap-1.5 ${label}`}><span className="inline-block h-3 w-0.5 bg-[var(--text-secondary)]" />Scheduled</span>
      <span className={`inline-flex items-center gap-1.5 ${label}`}><span className="inline-block h-1 w-5 rounded-full bg-[var(--strip-delay-1)] opacity-50" />1 in 10 over</span>
    </div>
  );
}

const LANE_STYLE: Record<RowLabel['lane'], string> = { above: 'top-0', below: 'bottom-0', end: 'top-1/2 -translate-y-1/2' };

/** One pattern as a line: the tail from the usual to the slow end, a tick at the timetable and a dot at the usual, on the section's shared scale, each with its number. */
function PatternRow({ row, scale, width, dense, showLabel, unit }: { row: RunTimeRow; scale: { min: number; max: number }; width: number; dense: boolean; showLabel: boolean; unit: string }) {
  const pos = (m: number) => `${rowPercent(m, scale)}%`;
  const few = !row.main && row.trips < MIN_PATTERN_TRIPS;
  const labels = placeRowLabels(row, scale, width, INSET, undefined, unit);
  const tone: Record<RowLabel['id'], string> = { usual: 'font-bold text-[var(--text-primary)]', scheduled: 'text-[var(--text-secondary)]', slow: 'text-[var(--text-muted)]' };
  return (
    <li className={`min-w-0 ${few ? 'text-[var(--text-dim)]' : ''}`} title={row.figures || undefined}>
      {showLabel && row.label && <div className={dense ? 'text-xs leading-4 text-[var(--text-secondary)]' : 'text-sm leading-5 text-[var(--text-secondary)]'}>{row.label}{few ? ' Few trips: treat with care.' : ''}</div>}
      {row.figures && <span className="sr-only">{row.figures}</span>}
      <div className={`relative ${dense ? 'h-[36px]' : 'h-[44px]'} ${few ? 'opacity-60' : ''}`} aria-hidden="true">
        <div className="absolute inset-y-0" style={{ left: INSET, right: INSET }}>
          <div className="absolute inset-x-0 top-1/2 h-px bg-[var(--border-primary)]" />
          {row.typical != null && row.p90 != null && row.p90 > row.typical && (
            <div className="absolute top-1/2 h-1 -translate-y-1/2 rounded-full bg-[var(--strip-delay-1)] opacity-50" style={{ left: pos(row.typical), width: `${rowPercent(row.p90, scale) - rowPercent(row.typical, scale)}%` }} />
          )}
          {row.scheduled != null && <div data-mark="scheduled" className={`absolute top-1/2 ${dense ? 'h-2.5' : 'h-3.5'} w-0.5 -translate-x-1/2 -translate-y-1/2 bg-[var(--text-secondary)]`} style={{ left: pos(row.scheduled) }} />}
          {row.typical != null && <div data-mark="usual" className="absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[var(--text-primary)]" style={{ left: pos(row.typical) }} />}
        </div>
        {labels.map(l => <span key={l.id} data-label={l.id} className={`absolute whitespace-nowrap text-xs leading-none ${LANE_STYLE[l.lane]} ${tone[l.id]}`} style={{ left: l.left }}>{l.text}</span>)}
      </div>
    </li>
  );
}

/** The scale's ticks, whole 5 or 10 minutes. */
function scaleTicks(scale: { min: number; max: number }) {
  const span = scale.max - scale.min || 1;
  const step = span > 30 ? 10 : 5;
  const ticks: number[] = [];
  for (let t = Math.ceil(scale.min / step) * step; t <= scale.max; t += step) ticks.push(t);
  return ticks;
}

/** The minutes under a direction's rows, with "min" at the end. */
function RowAxis({ scale }: { scale: { min: number; max: number } }) {
  return (
    <div className={`relative h-4 text-xs text-[var(--text-dim)] ${GUTTER}`} aria-hidden="true">
      <div className="relative h-full">
        <div className="absolute inset-y-0" style={{ left: INSET, right: INSET }}>
          {scaleTicks(scale).map(t => <span key={t} className="absolute top-0 -translate-x-1/2" style={{ left: `${rowPercent(t, scale)}%` }}>{t}</span>)}
        </div>
      </div>
      <span className="absolute right-0 top-0">min</span>
    </div>
  );
}

/** A direction's pattern rows on one shared scale, with a faint line at each number so equal minutes line up across rows. `hideMainLabel` leaves the main row unlabelled (a line above already says what it covers). */
export function PatternRows({ rows, scale, dense = false, hideMainLabel = false, unitOnNumbers = false }: { rows: RunTimeRow[]; scale: { min: number; max: number }; dense?: boolean; hideMainLabel?: boolean; /** No minutes axis: each number carries its own "min" (the planner's card, which is short of height). */ unitOnNumbers?: boolean }) {
  const [ref, width] = useBoxWidth<HTMLUListElement>();
  const shown = rows.filter(r => !r.thin || !r.main);
  if (!shown.length) return null;
  return (
    <div className={dense ? 'mt-0.5' : 'mt-2'}>
      <div className={`relative ${unitOnNumbers ? '' : GUTTER}`}>
        <div className="pointer-events-none absolute inset-y-0 left-0" style={{ right: unitOnNumbers ? 0 : 28 }} aria-hidden="true">
          <div className="absolute inset-y-0" style={{ left: INSET, right: INSET }}>
            {scaleTicks(scale).map(t => <div key={t} className="absolute inset-y-0 w-px bg-[var(--border-primary)] opacity-60" style={{ left: `${rowPercent(t, scale)}%` }} />)}
          </div>
        </div>
        <ul ref={ref} className={`relative m-0 list-none p-0 ${dense ? 'space-y-1' : 'space-y-2'}`}>{shown.map(r => <PatternRow key={r.key} row={r} scale={scale} width={width} dense={dense} showLabel={!(hideMainLabel && r.main)} unit={unitOnNumbers ? ' min' : ''} />)}</ul>
      </div>
      {!unitOnNumbers && <RowAxis scale={scale} />}
    </div>
  );
}

/**
 * Run time: how long the whole trip takes against the timetable. Per direction, one row per pattern (the main stretch,
 * then the longer patterns) as a dot on a line on one minutes scale shared by every row, then the by-hour chart.
 * `full` is the Full analysis section; `brief` the dashboard's (intro by time of day, "too few trips" line);
 * `compact` the Explore section (keeping its own section id and `boundary`).
 */
export default function RunTimeSection({ v3, band, dir, detail, id, shrink, boundary }: { v3: LiveV3; band: DashboardBand; dir: number | null; detail: 'full' | 'compact' | 'brief'; id?: string; shrink?: boolean; boundary?: string }): ReactNode {
  const m = runTimeModel(v3, band, dir);
  const { rt, dirs, hoursOf, scale, axis } = m;
  const frame = (children: ReactNode) => id
    ? <Section id={id} title="Run time" shrink={shrink} boundary={boundary}>{children}</Section>
    : <section aria-labelledby="dash-runtime" className="mt-10"><SectionTitle id="dash-runtime">Run time</SectionTitle>{children}</section>;
  if (!rt && detail !== 'brief') return id && detail === 'compact' ? frame(null) : null;
  const full = detail === 'full', compact = detail === 'compact';
  const rowsByDir = runTimeRows(v3, band, dirs, n => shortStopName(titleCase(n)));
  const rowScale = runTimeRowScale(Object.values(rowsByDir).flat());
  return frame(<>
    {full && <p className="mt-2 text-sm text-[var(--text-muted)]">How long the trip takes against the schedule, by the hour it starts, over the stops every regular trip serves, so short turns count too.</p>}
    {detail === 'brief' && <p className="mt-1 max-w-2xl text-sm text-[var(--text-muted)]">How long the trip takes against the schedule, {BAND_WORDS[band]}, over the stops every regular trip serves, so short turns count too.</p>}
    <RowLegend />
    <div className={`mt-4 grid ${full ? 'gap-6' : 'gap-x-10 gap-y-8'} ${dirs.length > 1 ? 'lg:grid-cols-2' : ''}`}>
      {dirs.map(d => {
        const label = v3.directionLabels[String(d)];
        const hours = hoursOf(d);
        const f = rt?.bands[band]?.[String(d)];
        const sentence = runningTimeSentence(label, f);
        const mainThin = !f || f.n < 30;
        // Full and dashboard say what the main row covers once, above it; Explore's rows carry it in their label.
        const stretch = compact ? null : runTimeStretchOf(v3, d);
        return (
          <div key={d} className="min-w-0">
            <h3 className="text-base font-black">{label}</h3>
            {stretch && <p className="mt-1 text-sm text-[var(--text-muted)]">{stretch}</p>}
            {full && mainThin && <p className="mt-1 text-sm leading-6">{sentence}</p>}
            <PatternRows rows={rowsByDir[d] ?? []} scale={rowScale} hideMainLabel={!!stretch} />
            {compact ? (
              hours.length > 1 && <div className="mt-4"><RunTimeChart hours={hours} scale={scale} ariaLabel={`${label}: run time against the schedule by the hour the trip starts.`} /></div>
            ) : hours.length > 1 ? (
              <>
                <p className="mt-4 text-sm font-bold">{runTimeTakeaway(label, hours)}</p>
                <div className="mt-2"><RunTimeChart hours={hours} axis={axis} scale={scale} ariaLabel={`${label}: run time against the schedule by the hour the trip starts. ${full ? sentence : runTimeTakeaway(label, hours)}`} /></div>
              </>
            ) : !full && <p className="mt-1 text-sm text-[var(--text-muted)]">Too few trips were measured {BAND_WORDS[band]} to draw this.</p>}
          </div>
        );
      })}
    </div>
  </>);
}
