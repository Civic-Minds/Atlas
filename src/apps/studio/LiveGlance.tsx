import Card from '../../components/ui/Card';
import SplitBar from '../../components/charts/SplitBar';
import { PanelSection, usePanelSections } from '../../components/Live/panelSections';
import { STUDIO_GLANCE as G } from '../../../shared/liveWording';
import { percentText } from '../../../shared/numberText';
import type { AgencySummary } from '../../../shared/liveAgency';

/**
 * CIV-1878: Studio Live's opening lines, from the Live data (Ryan's pick, the mockup's words): this week's departures split
 * between on time and more than 5½ min late (the shared late definition) in the split bar the research pages use. The
 * count of recorded routes sits beside the Live tab's name instead, as History's count does (CIV-2193).
 */
export default function LiveGlance({ s }: { s: AgencySummary }) {
  const sections = usePanelSections();
  const late = s.weekly?.thisWeek.late;
  const lateShare = late && late.n > 0 ? late.share : null;
  const lateText = lateShare != null ? percentText(lateShare) : null;
  // The two parts add up to 100: on time is what is left of the rounded late share.
  const onTimeText = lateShare != null ? percentText(1 - Math.round(lateShare * 100) / 100) : null;
  const bar = lateShare != null ? [
    { key: 'onTime', value: 1 - lateShare, fill: 'var(--strip-delay-0)', sentence: `${G.onTime} ${onTimeText}`, legend: <span><span className="font-black">{onTimeText}</span> {G.onTime}</span> },
    { key: 'late', value: lateShare, fill: 'var(--strip-delay-1)', sentence: `${G.late} ${lateText}`, legend: <span><span className="font-black">{lateText}</span> {G.late}</span> },
  ] : null;
  if (!bar) return null;
  const splitBar = <SplitBar segments={bar} label={`${G.barTitle}: ${G.onTime} ${onTimeText}, ${G.late} ${lateText}`} />;
  // CIV-3098: inside Studio's panel, a section of the panel under the shared section heading, with no box.
  if (sections) return <PanelSection label={G.barTitle}>{splitBar}</PanelSection>;
  return (
    <Card as="section" tone="surface" aria-label={G.barTitle} className="mb-3 px-3 py-2.5 text-sm">
      <p className="m-0">{G.barTitle}</p>
      {splitBar}
    </Card>
  );
}
