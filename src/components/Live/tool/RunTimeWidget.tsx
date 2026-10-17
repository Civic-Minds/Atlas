import type { DashboardBand, LiveV3 } from '../../../../shared/liveDashboard';
import { runTimeLine, runTimeStretchOf } from '../sections/RunTimeSection';
import { BANDS } from '../sections/figures';
import Widget from './Widget';

/** The picked direction's run time as its summary line: the usual trip, the timetable's, and the slow end. A half-width card. */
export default function RunTimeWidget({ v3, dir, band }: { v3: LiveV3; dir: number; band: DashboardBand }) {
  const f = v3.runningTime?.bands[band]?.[String(dir)];
  if (!f) return null;
  // The label says "all trips"; with a time of day picked it names that time of day (the pill's own name) instead.
  const bandName = BANDS.find(([k]) => k === band)?.[1];
  const stretch = runTimeStretchOf(v3, dir)?.replace(/all trips$/, band === 'all' || !bandName ? 'all trips' : bandName);
  return (
    <Widget title="Run time" size="small">
      <div className="text-sm leading-5 text-[var(--text-muted)]">{v3.directionLabels[String(dir)]}: {runTimeLine(f)}</div>
      {stretch && <div className="mt-1 text-xs leading-4 text-[var(--text-dim)]">{stretch}</div>}
    </Widget>
  );
}
