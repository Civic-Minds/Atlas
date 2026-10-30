import type { DashboardBand, LiveV3 } from '../../../../shared/liveDashboard';
import { nameCase } from '../../../utils/format';
import { shortStopName } from '../../../utils/stopLabel';
import { PatternRows, RowLegend, runTimeStretchOf } from '../sections/RunTimeSection';
import { runTimeRowScale, runTimeRows } from '../sections/runTimeRows';
import Widget from './Widget';

/** The picked direction's main pattern as one dot on a line, the same row as the Run time section's (longer patterns stay on the route pages). */
export default function RunTimeWidget({ v3, dir, band }: { v3: LiveV3; dir: number; band: DashboardBand }) {
  if (!v3.runningTime?.bands[band]?.[String(dir)]) return null;
  const rows = (runTimeRows(v3, band, [dir], n => shortStopName(nameCase(n, 'title')))[dir] ?? []).filter(r => r.main);
  const stretch = runTimeStretchOf(v3, dir);
  return (
    <Widget title="Run time" size="medium" className="!p-2.5 [&>div:last-child]:!mt-0.5" action={<RowLegend dense inline />}>
      <div className="text-xs font-bold leading-[14px] text-[var(--text-secondary)]">{v3.directionLabels[String(dir)]}</div>
      {stretch && <div className="text-xs leading-[14px] text-[var(--text-muted)]">{stretch}</div>}
      <PatternRows rows={rows} scale={runTimeRowScale(rows)} dense unitOnNumbers hideMainLabel={!!stretch} />
    </Widget>
  );
}
