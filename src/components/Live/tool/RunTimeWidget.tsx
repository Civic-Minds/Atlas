import { periodKeyForHour } from '../../../../shared/config';
import type { DashboardBand, LiveV3 } from '../../../../shared/liveDashboard';
import RunTimeChart, { runTimeScale } from '../../charts/RunTimeChart';
import Widget from './Widget';

/** Run time by the hour a trip starts for the picked direction, over the whole day with the chosen time of day shaded. */
export default function RunTimeWidget({ v3, dir, band }: { v3: LiveV3; dir: number; band: DashboardBand }) {
  const hours = (v3.runningTime?.byHour[String(dir)] ?? []).filter(h => h.n >= 1);
  if (hours.length < 2) return null;
  return (
    <Widget title="Run time" size="medium">
      <RunTimeChart
        hours={hours} scale={runTimeScale([hours])} height={73} caption={false} compact
        shade={band === 'all' ? undefined : h => periodKeyForHour(h) === band}
        ariaLabel={`${v3.directionLabels[String(dir)]}: run time against the schedule by the hour the trip starts.`}
      />
    </Widget>
  );
}
