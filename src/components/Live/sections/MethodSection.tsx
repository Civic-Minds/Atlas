import type { ReactNode } from 'react';
import { goodDayCounts, goodDayLimits } from '../../../../shared/liveDashboard';
import type { AgencySummary } from '../../../../shared/liveAgency';
import { joinList } from '../../../../shared/overflowText';
import { DELAY_STARTS_TITLE, LINKED_TO_TITLE, METHOD_GROUPS, NEAR_CUTOFF_TERM, coveredRoutesText, serviceDaysText } from '../../../../shared/liveWording';
import { weekWindowParts } from '../../../utils/liveKpi';
import ArrowLink from '../../ui/ArrowLink';
import MethodFootnote, { Term } from '../MethodFootnote';
import { phoneMethodLines, aheadLine, bunchingLine, colourLine, deliveredLine, extraWaitLine, lateLine, networkFiguresLine, positionsLine, recordingGapsLine, runTimeLine, stopsLine, tripMatchLine } from '../methodLines';
import type { Ready } from '../../../LiveRoutePage';
import { percentText, countText } from '../../../../shared/numberText';
import { DOCS_PATH } from '../../../../shared/pagePaths';
import { METHOD_TERMS_LINK } from '../../../../shared/liveGlossary';
import { PHONE_MEDIA_QUERY, useMediaQuery } from '../../../hooks/useMediaQuery';

/** The link under the block to the Docs glossary. */
const termsLink = <p className="mt-2 text-xs"><ArrowLink href={`${DOCS_PATH}#glossary`}>{METHOD_TERMS_LINK}</ArrowLink></p>;

/**
 * The two weeks, then the days left out (nothing when every day counted), running on in the paragraph (CIV-1075). `namedAbove`
 * is the same note when the page already shows it ("Excluding Oct 14"): the days are not named a second time (#1490).
 */
const weekWindowItems = (w: Parameters<typeof weekWindowParts>[0], namedAbove?: string | null): ReactNode[] => {
  const p = weekWindowParts(w);
  return p.days && p.days !== `${namedAbove}.` ? [p.weeks, <span key="days" title={p.reason ?? undefined}>{p.days}</span>] : [p.weeks];
};


/**
 * "How this is measured", the one block every Live surface ends with. The scope picks the lines: one route's full
 * method (its Summary and Full analysis alike, CIV-308), or the agency's. Each scope keeps its element id, so #method
 * still anchors.
 */
export type MethodSectionProps =
  | { scope: 'route'; data: Ready; /** The left-out days' note the page already shows above, if any (#1490). */ namedAbove?: string | null }
  | { scope: 'agency'; s: AgencySummary; /** The agency's short name (useLiveAgencyName). */ agencyName: string };

export default function MethodSection(props: MethodSectionProps): ReactNode {
  // Phones (Ryan, 2026-11-22, #1151 option 1): the short line for each figure, then the glossary link; wider screens keep it all.
  const phone = useMediaQuery(PHONE_MEDIA_QUERY);
  if (phone) {
    const v3 = props.scope === 'route' ? props.data.v3 : null;
    return (
      <MethodFootnote id={props.scope === 'route' ? 'method' : 'agency-method'} groups={[{ label: METHOD_GROUPS.numbers, items: phoneMethodLines(v3
        ? { aheadMin: Math.abs(v3.thresholds.earlyAtOrBelowMin), underMin: Math.round(v3.thresholds.bunchedGapSec / 60) }
        : {}) }]} after={termsLink} />
    );
  }
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
        <Term t={LINKED_TO_TITLE}>shows what was measured in the same stretch. It is not the cause.</Term>,
      ] },
      { label: METHOD_GROUPS.data, items: [
        `${serviceDaysText(good.days, first, last)}: ${countText(good.runs)} trips and ${countText(good.stopPassages)} stop departures.`,
        ...(v3.weekly ? weekWindowItems(v3.weekly, props.namedAbove) : []),
        positionsLine,
        tripMatchLine(true),
        data.replacementBuses && <Term t="Replacement buses">run this route in this schedule, so every figure describes the buses.</Term>,
      ] },
      { label: METHOD_GROUPS.colours, items: [v3.weekly && colourLine] },
      { label: METHOD_GROUPS.limits, items: [
        recordingGapsLine,
        <Term t={NEAR_CUTOFF_TERM} colon>{percentText(lim.nearCutoffShare)} of trips left their first stop within {Math.round(v3.uncertainty.withinMin * 60)} seconds of the late or ahead cutoff. Because we record each vehicle once a minute, some of these could be labelled wrong.</Term>,
        // The share is of the raw runs seen; the kept count is the trips the figures describe, the header's count (CIV-910).
        glo && glo.noTimetableTrip > 0 && <Term t="Unscheduled trips">are runs whose trip number isn’t on the schedule, such as extra buses. We left out {countText(glo.noTimetableTrip)} of them ({percentText(glo.noTimetableTrip / (glo.kept + glo.noTimetableTrip + glo.excluded))} of trips seen), so the figures cover the {countText(good.runs)} scheduled trips.</Term>,
        // Counted over the good days, like every other figure (Ryan, CIV-910 Q4).
        glo && glo.excluded > 0 && <Term t="Other services">are runs by {lo?.excludedLabel ?? 'another service'} that shares this route number. We left out {countText(glo.excluded)} of them.</Term>,
        <Term t="Mismatched trip numbers">are trips that ran far from the time their trip number is scheduled for ({percentText(lim.swaps.rate)} of trips). We matched {lim.swaps.reassigned} to the trip they fit and left out {lim.swaps.dropped}.</Term>,
        unknown > 0 && <Term t="Unjudged trips">are trips we couldn’t judge as run or not run. We left out {countText(unknown)} of them from Delivered.</Term>,
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
          ] },
          { label: METHOD_GROUPS.colours, items: [w && colourLine] },
          { label: METHOD_GROUPS.limits, items: [recordingGapsLine] },
        
    ]} after={termsLink} />
  );
}
