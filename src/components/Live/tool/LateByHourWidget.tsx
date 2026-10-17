import { periodKeyForHour } from '../../../../shared/config';
import type { DashboardBand } from '../../../../shared/liveDashboard';
import { lateCount, lateHourLine, LATE_BY_HOUR_TITLE } from '../../../../shared/liveWording';
import { liveChartHours } from '../../../utils/sparklinePeriods';
import HourSpark, { type HourValue } from '../../charts/HourSpark';
import Widget from './Widget';

const pct = (x: number) => `${Math.round(x * 100)}%`;

/** Late share by hour over the whole 5am–4am day with the chosen time of day shaded: the lite page's chart in a medium widget. */
export default function LateByHourWidget({ hours, band, overall }: { hours: readonly HourValue[]; band: DashboardBand; overall: number | null }) {
  if (!hours.length) return null;
  const max = Math.max(0.1, ...hours.filter(h => h.n >= 30).map(h => h.value));
  return (
    <Widget title={LATE_BY_HOUR_TITLE} size="medium">
      <HourSpark
        departures height={44} values={hours} scale={{ min: 0, max: Math.ceil(max * 10) / 10 }} color="var(--status-negative-text)" format={pct} unit="departures" valueHeader="Late"
        hours={liveChartHours(h => hours.some(x => x.hour === h && x.n >= 30))}
        shade={band === 'all' ? undefined : h => periodKeyForHour(h) === band}
        hoverLine={(t, v) => lateHourLine(t, lateCount(v.value, v.n), v.n)}
        ariaLabel={`Share of departures late by hour of the day${overall != null ? `, ${pct(overall)} late overall` : ''}.`}
      />
    </Widget>
  );
}
