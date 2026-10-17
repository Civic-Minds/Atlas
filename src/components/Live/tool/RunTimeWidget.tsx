import { runTimeStretchLabel, type DashboardBand, type LiveV3 } from '../../../../shared/liveDashboard';
import { titleCase } from '../../../utils/format';
import { shortStopName } from '../../../utils/stopLabel';
import Widget from './Widget';

/** The picked direction's run time as its summary line: the usual trip, the timetable's, and the slow end. A half-width card. */
export default function RunTimeWidget({ v3, dir, band }: { v3: LiveV3; dir: number; band: DashboardBand }) {
  const f = v3.runningTime?.bands[band]?.[String(dir)];
  if (!f) return null;
  const stretch = runTimeStretchLabel(v3.runningTime?.stretch?.[String(dir)], n => shortStopName(titleCase(n)));
  return (
    <Widget title="Run time" size="small">
      <div className="text-sm leading-5 text-[var(--text-muted)]">Usually {Math.round(f.typicalMin)} min · timetable {Math.round(f.scheduledMin)} · 1 in 10 over {Math.round(f.p90Min)}</div>
      {stretch && <div className="mt-1 text-xs leading-4 text-[var(--text-dim)]">{stretch}</div>}
    </Widget>
  );
}
