import { useState } from 'react';
import type { DashboardBand } from '../../../../shared/liveDashboard';
import { dateRangeText } from '../../../../shared/liveDashboard';
import Pill from '../../ui/Pill';
import StringLine, { useStrings } from '../StringLine';
import Widget from './Widget';

/** The string-line chart in a large widget: one direction on one of the last three days, over the chosen time of day. */
export default function StringLineWidget({ agency, route, dir, band, dates }: { agency: string; route: string; dir: number; band: DashboardBand; dates: readonly string[] }) {
  const days = dates.slice(-3);
  const [date, setDate] = useState<string | null>(days[days.length - 1] ?? null);
  const state = useStrings(agency, route, date);
  return (
    <Widget title="String line" size="large">
      <div className="flex flex-wrap gap-1" role="group" aria-label="Day">
        {days.map(d => <Pill key={d} size="segment" selected={d === date} onClick={() => setDate(d)}>{dateRangeText(d, d)}</Pill>)}
      </div>
      <div className="mt-2">{state.kind === 'ready' ? <StringLine compact data={state.data} directionId={dir} band={band} /> : null}</div>
    </Widget>
  );
}
