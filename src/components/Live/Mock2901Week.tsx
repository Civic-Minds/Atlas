import { useState } from 'react';
import { useLiveDashboard } from '../../hooks/useLiveDashboard';
import { KpiRow } from '../../LiveDashboardView';
import LateByHourSection from './sections/LateByHourSection';
import WorstStopsSection from './sections/WorstStopsSection';
import ExpandDialog from '../ui/ExpandDialog';
import { CardDirectionRow } from '../Interval/cardUi';
import { LATE_BY_HOUR_TITLE, LATE_STOPS_TITLE, WEEK_COMPARE_TITLE } from '../../../shared/liveWording';
import { CLOSE_PLACES, closeLabel } from '../../content/noticeCopy';

/**
 * MOCK for Ryan's review (CIV-2901 B on the #1877 mock C card, not for merge): the week section under the card's
 * destination rows, from the same parts the Live route page uses. ?mockWeek=1: the hourly chart stays, and one row
 * ("This week compared with last week ›") opens the week figures and stops in the app's expand dialog. ?mockWeek=2:
 * the week figures and chart stay, with only the stops behind a tap.
 */
export default function Mock2901Week({ slug, route, option }: { slug: string; route: string; option: string }) {
  const state = useLiveDashboard(slug, route);
  const [open, setOpen] = useState(false);
  if (state.kind !== 'done' || state.data.status !== 'ready') return null;
  const v3 = state.data.v3;
  const data = v3.bands.all;
  const uncertain = state.data.uncertainStart ?? [];
  const hours = <LateByHourSection chart="spark" title={LATE_BY_HOUR_TITLE} v3={v3} data={data} band="all" dir={null} allOnly />;
  const stops = <WorstStopsSection v3={v3} data={data} dir={null} uncertain={uncertain} limit={5} columns="compact" title={LATE_STOPS_TITLE} />;
  const title = option === '1' ? WEEK_COMPARE_TITLE : LATE_STOPS_TITLE;
  return (
    <div className="mt-4 border-t border-[var(--border-primary)] pt-3">
      {option === '2' && <KpiRow v3={v3} />}
      {hours}
      <CardDirectionRow label={title} labelWeight="regular" chevron onClick={() => setOpen(true)} />
      {open && (
        <ExpandDialog title={title} ariaLabel={title} closeLabel={closeLabel(CLOSE_PLACES.chart)} onClose={() => setOpen(false)}>
          {option === '1' && <KpiRow v3={v3} />}
          {stops}
        </ExpandDialog>
      )}
    </div>
  );
}
