import type { ReactNode } from 'react';
import { dateRangeText, goodDayCounts, goodDayLimits, type LiveV3 } from '../../../../shared/liveDashboard';
import type { AgencySummary } from '../../../../shared/liveAgency';
import { pct } from '../../../../shared/liveFormat';
import { joinList } from '../../../../shared/overflowText';
import { builtText, coveredRoutesText, DELAY_STARTS_TITLE, METHOD_GROUPS } from '../../../../shared/liveWording';
import { weekWindowParts } from '../../../utils/liveKpi';
import ArrowLink from '../../ui/ArrowLink';
import MethodFootnote, { Term } from '../MethodFootnote';
import { aheadLine, bunchingLine, colourLine, deliveredLine, extraWaitLine, lateLine, networkFiguresLine, positionsLine, recordingGapsLine, runTimeLine, stopsLine, tripMatchLine } from '../methodLines';
import type { Ready } from '../../../LiveRoutePage';

/** The two weeks, then the days left out (nothing when every day counted), running on in the paragraph (CIV-1075). */
const weekWindowItems = (w: Parameters<typeof weekWindowParts>[0]): ReactNode[] => { const p = weekWindowParts(w); return p.days ? [p.weeks, <span key="days" title={p.reason ?? undefined}>{p.days}</span>] : [p.weeks]; };


/**
 * "How this is measured", the one block every Live surface ends with. The scope picks the lines: one route's full
 * method (its Summary and Full analysis alike, CIV-308), or the agency's. Each scope keeps its element id, so #method
 * still anchors.
 */
export type MethodSectionProps =
  | { scope: 'route'; data: Ready }
  | { scope: 'agency'; s: AgencySummary; /** The agency's short name (useLiveAgencyName). */ agencyName: string };

export default function MethodSection(props: MethodSectionProps): ReactNode {
  if (props.scope === 'route') {
    const { data } = props;
    const { v3 } = data;
    // The good days only, the days every figure counts (CIV-910).
    const good = goodDayCounts(v3);
    const [first, last] = [good.dates[0], good.dates[good.dates.length - 1]];
    const lo = v3.leftOut;
    // The unscheduled-trips, mismatched-trip-numbers and near-a-limit figures over the good days too (CIV-910).
    const lim = goodDayLimits(v3);
    const glo = lim.leftOut;
    const unknown = v3.serviceDelivered?.overall.unknown ?? 0;
    return (
      <MethodFootnote id="method" groups={[
      { label: METHOD_GROUPS.numbers, items: [
        lateLine,
        aheadLine(Math.abs(v3.thresholds.earlyAtOrBelowMin)),
        runTimeLine(true),
        extraWaitLine,
        bunchingLine(Math.round(v3.thresholds.bunchedGapSec / 60)),
        deliveredLine(true),
        <Term t={DELAY_STARTS_TITLE}>is the stop where vehicles fall furthest behind and don’t catch up over the next 3 stops (about 1 km).</Term>,
        <Term t="Linked to">shows what was measured in the same stretch. It is not the cause.</Term>,
      ] },
      { label: METHOD_GROUPS.data, items: [
        `Last ${good.days} service days, ${dateRangeText(first, last)}: ${good.runs.toLocaleString()} trips and ${good.stopPassages.toLocaleString()} stop departures.`,
        ...(v3.weekly ? weekWindowItems(v3.weekly) : []),
        positionsLine,
        tripMatchLine(true),
        data.replacementBuses && <Term t="Replacement buses">run this route in this schedule, so every figure describes the buses.</Term>,
        `${builtText(data.generatedAt)}.`,
      ] },
      { label: METHOD_GROUPS.colours, items: [v3.weekly && colourLine] },
      { label: METHOD_GROUPS.limits, items: [
        recordingGapsLine,
        <Term t="Near a limit" colon>{pct(lim.nearCutoffShare)} of trips left their first stop within {Math.round(v3.uncertainty.withinMin * 60)} seconds of the late or ahead cutoff. Because we record each vehicle once a minute, some of these could be labelled wrong.</Term>,
        // The share is of the raw runs seen; the kept count is the trips the figures describe, the header's count (CIV-910).
        glo && glo.noTimetableTrip > 0 && <Term t="Unscheduled trips">are runs whose trip number isn’t on the schedule, such as extra buses. We left out {glo.noTimetableTrip.toLocaleString()} of them ({pct(glo.noTimetableTrip / (glo.kept + glo.noTimetableTrip + glo.excluded))} of trips seen), so the figures cover the {good.runs.toLocaleString()} scheduled trips.</Term>,
        // Counted over the good days, like every other figure (Ryan, CIV-910 Q4).
        glo && glo.excluded > 0 && <Term t="Other services">are runs by {lo?.excludedLabel ?? 'another service'} that shares this route number. We left out {glo.excluded.toLocaleString()} of them.</Term>,
        <Term t="Mismatched trip numbers">are trips that ran far from the time their trip number is scheduled for ({pct(lim.swaps.rate)} of trips). We matched {lim.swaps.reassigned} to the trip they fit and left out {lim.swaps.dropped}.</Term>,
        unknown > 0 && <Term t="Unjudged trips">are trips we couldn’t judge as run or not run. We left out {unknown.toLocaleString()} of them from Delivered.</Term>,
      ] },
    
      ]} />
    );
  }
  const { s, agencyName } = props;
  const coverage = coveredRoutesText(agencyName, s.routes);
  const w = s.weekly;
  return (
    <MethodFootnote id="agency-method" groups={[
          { label: METHOD_GROUPS.numbers, items: [
            lateLine,
            runTimeLine(),
            extraWaitLine,
            bunchingLine(),
            deliveredLine(),
          ] },
          { label: METHOD_GROUPS.data, items: [
            ...(w ? weekWindowItems({ ...w, health: [] }) : []),
            positionsLine,
            tripMatchLine(),
            <Term t="Routes covered" colon>{coverage}{s.held.length ? `, not including ${joinList(s.held.map(h => h.route))}` : ''}.</Term>,
            networkFiguresLine,
            stopsLine,
            builtText(s.generatedAt) + '.',
          ] },
          { label: METHOD_GROUPS.colours, items: [w && colourLine] },
          { label: METHOD_GROUPS.limits, items: [recordingGapsLine] },
        
    ]} after={<p className="mt-2 text-xs"><ArrowLink href="/about/docs#glossary">What these terms mean</ArrowLink></p>} />
  );
}
