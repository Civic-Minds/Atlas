import type { DashboardBand, LiveV3 } from '../../../../shared/liveDashboard';
import { titleCase } from '../../../utils/format';
import { shortStopName } from '../../../utils/stopLabel';
import { PatternRows, RowLegend } from '../sections/RunTimeSection';
import { runTimeRowScale, runTimeRows } from '../sections/runTimeRows';
import Widget from './Widget';

/** The picked direction's run time as dots on a line, the same rows as the Run time section: the main stretch, then the longer patterns. */
export default function RunTimeWidget({ v3, dir, band }: { v3: LiveV3; dir: number; band: DashboardBand }) {
  if (!v3.runningTime?.bands[band]?.[String(dir)]) return null;
  const rows = runTimeRows(v3, band, [dir], n => shortStopName(titleCase(n)))[dir] ?? [];
  const scale = runTimeRowScale(rows);
  return (
    <Widget title="Run time" size="medium" action={<RowLegend dense inline />}>
      <div className="text-sm leading-5 text-[var(--text-secondary)]">{v3.directionLabels[String(dir)]}</div>
      <PatternRows rows={rows} scale={scale} dense />
    </Widget>
  );
}
