import Card from '../../components/ui/Card';
import SplitBar from '../../components/charts/SplitBar';
import { PanelSection, usePanelSections } from '../../components/Live/panelSections';
import { STUDIO_GLANCE as G } from '../../../shared/liveWording';
import { percentText } from '../../../shared/numberText';
import type { AgencySummary } from '../../../shared/liveAgency';
import { weekForBand, type DashboardBand } from '../../../shared/liveDashboard';
import { agencyWeekScope } from '../../utils/liveAgencyKpi';
import { FIGURE_SCOPE_HEAD } from '../../components/Live/FiguresCard';

/**
 * CIV-1878: Studio Live's opening lines, from the Live data (Ryan's pick, the mockup's words): this week's departures split
 * between on time and more than 5½ min late (the shared late definition) in the split bar the research pages use. The
 * count of recorded routes sits beside the Live tab's name instead, as History's count does (CIV-2193).
 */
export default function LiveGlance({ s, band }: { s: AgencySummary; band: DashboardBand }) {
  const sections = usePanelSections();
  // CIV-2929 (Ryan, 2026-11-27, picked 1: "The bar follows the time of day like the table, titled 'All routes · Evening'"):
  // the picked time of day's week, the same figures and heading as the week table under it, so both show the same %.
  const late = weekForBand(s.weekly, band)?.thisWeek.late;
  const title = agencyWeekScope(band);
  const lateShare = late && late.n > 0 ? late.share : null;
  const lateText = lateShare != null ? percentText(lateShare) : null;
  // The two parts add up to 100: on time is what is left of the rounded late share.
  const onTimeText = lateShare != null ? percentText(1 - Math.round(lateShare * 100) / 100) : null;
  const bar = lateShare != null ? [
    { key: 'onTime', value: 1 - lateShare, fill: 'var(--strip-delay-0)', sentence: `${G.onTime} ${onTimeText}`, legend: <span><span className="font-black">{onTimeText}</span> {G.onTime}</span> },
    { key: 'late', value: lateShare, fill: 'var(--strip-delay-1)', sentence: `${G.late} ${lateText}`, legend: <span><span className="font-black">{lateText}</span> {G.late}</span> },
  ] : null;
  if (!bar) return null;
  const splitBar = <SplitBar segments={bar} label={`${title}: ${G.onTime} ${onTimeText}, ${G.late} ${lateText}`} />;
  // CIV-3098: inside Studio's panel, a section of the panel under the shared section heading, with no box.
  if (sections) return <PanelSection label={title}><p className={`m-0 ${FIGURE_SCOPE_HEAD}`}>{title}</p>{splitBar}</PanelSection>;
  return (
    <Card as="section" tone="surface" aria-label={title} className="mb-3 px-3 py-2.5 text-sm">
      <p className={`m-0 ${FIGURE_SCOPE_HEAD}`}>{title}</p>
      {splitBar}
    </Card>
  );
}
