import type { ReactNode } from 'react';
import { periodKeyForHour } from '../../../../shared/config';
import { branchFigures, branchRunTimeLine, runTimeStretchLabel, runTimeTakeaway, runningTimeSentence, type DashboardBand, type LiveV3 } from '../../../../shared/liveDashboard';
import { withoutDevHint } from '../../../lib/liveReportData';
import { titleCase } from '../../../utils/format';
import { shortStopName } from '../../../utils/stopLabel';
import { liveChartHours } from '../../../utils/sparklinePeriods';
import RunTimeChart, { runTimeScale } from '../../charts/RunTimeChart';
import { SectionTitle } from '../../ui/PageTitle';
import Section from './Section';
import { BAND_WORDS, dirsOf } from './figures';

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

function BranchList({ v3, band, d }: { v3: LiveV3; band: DashboardBand; d: number }) {
  const branches = v3.runningTime?.branches?.[String(d)] ?? [];
  if (!branches.length) return null;
  return (
    <div className="mt-3">
      <h4 className="text-sm font-black">Longer patterns, each end to end</h4>
      <ul className="mt-1 space-y-1 text-sm text-[var(--text-secondary)]">
        {branches.flatMap(b => { const f = branchFigures(b, band); return f ? [<li key={`${b.fromStopId}-${b.toStopId}`} className={f.n < 30 ? 'text-[var(--text-dim)]' : ''}>{branchRunTimeLine(b, n => shortStopName(titleCase(n)), f)}{f.n < 30 ? ' Few trips: treat with care.' : ''}</li>] : []; })}
      </ul>
    </div>
  );
}

/**
 * Run time: how long the whole trip takes against the timetable, by direction and hour.
 * `full` is the Full analysis section (fixed intro, a sentence per direction, the takeaway and chart, longer patterns);
 * `brief` is the dashboard's own section (intro by time of day, takeaway and chart or a "too few trips" line, longer
 * patterns); `compact` is the Explore section (summary line and chart, keeping its own section id and `boundary`).
 */
export default function RunTimeSection({ v3, band, dir, detail, id, shrink, boundary }: { v3: LiveV3; band: DashboardBand; dir: number | null; detail: 'full' | 'compact' | 'brief'; id?: string; shrink?: boolean; boundary?: string }): ReactNode {
  const m = runTimeModel(v3, band, dir);
  const { rt, dirs, hoursOf, scale, axis } = m;
  const frame = (children: ReactNode) => id
    ? <Section id={id} title="Run time" shrink={shrink} boundary={boundary}>{children}</Section>
    : <section aria-labelledby="dash-runtime" className="mt-10"><SectionTitle id="dash-runtime">Run time</SectionTitle>{children}</section>;
  if (!rt && detail !== 'brief') return id && detail === 'compact' ? frame(null) : null;
  const full = detail === 'full', compact = detail === 'compact';
  return frame(<>
    {full && <p className="mt-2 text-sm text-[var(--text-muted)]">How long the trip takes against the schedule, by the hour it starts, over the stops every regular trip serves, so short turns count too.</p>}
    {detail === 'brief' && <p className="mt-1 max-w-2xl text-sm text-[var(--text-muted)]">How long the trip takes against the schedule, {BAND_WORDS[band]}, over the stops every regular trip serves, so short turns count too.</p>}
    <div className={`mt-4 grid ${full ? 'gap-6' : 'gap-x-10 gap-y-8'} ${dirs.length > 1 ? 'lg:grid-cols-2' : ''}`}>
      {dirs.map(d => {
        const label = v3.directionLabels[String(d)];
        const hours = hoursOf(d);
        const f = rt?.bands[band]?.[String(d)];
        const stretch = runTimeStretchOf(v3, d);
        const sentence = full ? withoutDevHint(runningTimeSentence(label, f)) : null;
        return (
          <div key={d} className="min-w-0">
            <h3 className="text-base font-black">{label}</h3>
            {compact ? (
              <>
                {f && <div className="text-sm text-[var(--text-muted)]">{runTimeLine(f)}</div>}
                {hours.length > 1 && <div className="mt-2"><RunTimeChart hours={hours} scale={scale} ariaLabel={`${label}: run time against the schedule by the hour the trip starts.`} /></div>}
              </>
            ) : (
              <>
                {stretch && <p className="text-sm text-[var(--text-muted)]">{stretch}</p>}
                {sentence != null && <p className="mt-1 text-sm leading-6">{sentence}</p>}
                {hours.length > 1 ? (
                  <>
                    <p className="mt-1 text-sm font-bold">{runTimeTakeaway(label, hours)}</p>
                    <div className="mt-2"><RunTimeChart hours={hours} axis={axis} scale={scale} ariaLabel={`${label}: run time against the schedule by the hour the trip starts. ${full ? sentence : runTimeTakeaway(label, hours)}`} /></div>
                  </>
                ) : !full && <p className="mt-1 text-sm text-[var(--text-muted)]">Too few trips were measured {BAND_WORDS[band]} to draw this.</p>}
                <BranchList v3={v3} band={band} d={d} />
              </>
            )}
          </div>
        );
      })}
    </div>
  </>);
}
