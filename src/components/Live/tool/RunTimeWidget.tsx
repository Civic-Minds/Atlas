import type { DashboardBand, LiveV3 } from '../../../../shared/liveDashboard';
import { titleCase } from '../../../utils/format';
import { shortStopName } from '../../../utils/stopLabel';
import { PatternRows, RowLegend, runTimeStretchOf } from '../sections/RunTimeSection';
import { patternRunTimeRows, runTimeRowScale, runTimeRows } from '../sections/runTimeRows';
import Widget from './Widget';

const nice = (n: string) => shortStopName(titleCase(n));

/**
 * The picked direction's run time. With per-pattern figures (CIV-945): one row per regular pattern, each timed on its own
 * trips, the main pattern first and each row naming its stops. Older files: the main stretch as one dot on a line.
 */
export default function RunTimeWidget({ v3, dir, band }: { v3: LiveV3; dir: number; band: DashboardBand }) {
  const own = patternRunTimeRows(v3, band, dir, nice);
  if (!own?.length && !v3.runningTime?.bands[band]?.[String(dir)]) return null;
  const rows = own?.length ? own : (runTimeRows(v3, band, [dir], nice)[dir] ?? []).filter(r => r.main);
  const stretch = own?.length ? null : runTimeStretchOf(v3, dir);
  return (
    <Widget title="Run time" size="medium" className="!p-2.5 [&>div:last-child]:!mt-0.5" action={<RowLegend dense inline />}>
      <div className="text-xs font-bold leading-[14px] text-[var(--text-secondary)]">{v3.directionLabels[String(dir)]}</div>
      {stretch && <div className="text-xs leading-[14px] text-[var(--text-muted)]">{stretch}</div>}
      <PatternRows rows={rows} scale={runTimeRowScale(rows)} dense unitOnNumbers hideMainLabel={!!stretch} />
    </Widget>
  );
}
