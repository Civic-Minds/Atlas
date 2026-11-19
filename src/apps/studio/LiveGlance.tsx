import Card from '../../components/ui/Card';
import SplitBar from '../../components/charts/SplitBar';
import { STUDIO_GLANCE as G } from '../../../shared/liveWording';
import { dateRange } from '../../../shared/dateText';
import { countText, percentText } from '../../../shared/numberText';
import type { AgencySummary } from '../../../shared/liveAgency';

/**
 * CIV-1878: Studio Live's opening lines, from the Live data (Ryan's pick, the mockup's words): how many routes are recorded, how
 * many days of data and which, and this week's departures split between on time and more than 5½ min late (the shared late
 * definition) in the split bar the research pages use.
 */
export default function LiveGlance({ s, days }: { s: AgencySummary; days: readonly string[] }) {
  const late = s.weekly?.thisWeek.late;
  const lateShare = late && late.n > 0 ? late.share : null;
  const lateText = lateShare != null ? percentText(lateShare) : null;
  // The two parts add up to 100: on time is what is left of the rounded late share.
  const onTimeText = lateShare != null ? percentText(1 - Math.round(lateShare * 100) / 100) : null;
  const bar = lateShare != null ? [
    { key: 'onTime', value: 1 - lateShare, fill: 'var(--strip-delay-0)', sentence: `${G.onTime} ${onTimeText}`, legend: <span><span className="font-black">{onTimeText}</span> {G.onTime}</span> },
    { key: 'late', value: lateShare, fill: 'var(--strip-delay-1)', sentence: `${G.late} ${lateText}`, legend: <span><span className="font-black">{lateText}</span> {G.late}</span> },
  ] : null;
  return (
    <Card as="section" tone="surface" aria-label={G.barTitle} className="mb-3 px-3 py-2.5 text-sm">
      <p className="m-0"><span className="font-black">{countText(s.covered.length)}</span> {G.routes}</p>
      {days.length > 0 && <p className="m-0"><span className="font-black">{countText(days.length)}</span> {G.days(dateRange(days[0], days[days.length - 1]))}</p>}
      {bar && (
        <div className="mt-2">
          <p className="m-0">{G.barTitle}</p>
          <SplitBar segments={bar} label={`${G.barTitle}: ${G.onTime} ${onTimeText}, ${G.late} ${lateText}`} />
        </div>
      )}
    </Card>
  );
}
