import type { ReactNode } from 'react';
import { dateRangeText, type LiveV3 } from '../../../../shared/liveDashboard';
import type { AgencySummary } from '../../../../shared/liveAgency';
import { builtText, coveredRoutesText, METHOD_GROUPS } from '../../../../shared/liveWording';
import { weekWindowParts } from '../../../utils/liveKpi';
import ArrowLink from '../../ui/ArrowLink';
import MethodFootnote, { OwnLine, Term } from '../MethodFootnote';
import { aheadLine, bunchingLine, colourLine, deliveredLine, delaysStartLine, extraWaitLine, lateLine, networkFiguresLine, positionsLine, recordingGapsLine, runTimeLine, stopsLine, tripMatchLine } from '../methodLines';
import type { Ready } from '../../../LiveRoutePage';

/** The two weeks, then the days left out on a line of their own (no line when every day counted). */
const weekWindowItems = (w: NonNullable<LiveV3['weekly']>): ReactNode[] => { const p = weekWindowParts(w); return p.days ? [p.weeks, <OwnLine key="days">{p.days}</OwnLine>] : [p.weeks]; };

const pct = (x: number) => `${Math.round(x * 100)}%`;

/**
 * "How this is measured", the one block every Live surface ends with. The scope picks the lines: the week comparison
 * (dashboard), one route's full method, or the agency's. Each scope keeps its element id, so #method still anchors.
 */
export type MethodSectionProps =
  | { scope: 'week'; v3: LiveV3; toFull: (hash: string) => void }
  | { scope: 'route'; data: Ready }
  | { scope: 'agency'; s: AgencySummary };

export default function MethodSection(props: MethodSectionProps): ReactNode {
  if (props.scope === 'week') {
    const { v3, toFull } = props;
    if (!v3.weekly) return null;
    return (
      <MethodFootnote id="dash-method" after={<p className="mt-2 text-xs"><ArrowLink href="?view=analysis#method" onClick={(e: React.MouseEvent) => { e.preventDefault(); toFull('method'); }}>The full method, in Full analysis</ArrowLink></p>}
        groups={[
          { label: METHOD_GROUPS.data, items: weekWindowItems(v3.weekly) },
          { label: METHOD_GROUPS.colours, items: [colourLine] },
          { label: METHOD_GROUPS.limits, items: [recordingGapsLine] },
        ]} />
    );
  }
  if (props.scope === 'route') {
    const { data } = props;
    const { v3 } = data;
    const [first, last] = [v3.window.dates[0], v3.window.dates[v3.window.dates.length - 1]];
    const lo = v3.leftOut;
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
        <Term t="Where delay builds up">the biggest jump in delay that holds for the next few stops (3 stops or about 1 km).</Term>,
        <Term t="Linked to">measured in the same stretch, not the cause.</Term>,
      ] },
      { label: METHOD_GROUPS.data, items: [
        `Last ${v3.window.days} service days, ${dateRangeText(first, last)}: ${v3.totals.runs.toLocaleString()} trips and ${v3.totals.stopPassages.toLocaleString()} stop departures.`,
        ...(v3.weekly ? weekWindowItems(v3.weekly) : []),
        positionsLine,
        tripMatchLine(true),
        data.replacementBuses && <Term t="Replacement buses">this route is run by replacement buses in this timetable, so every figure describes the buses.</Term>,
        `${builtText(data.generatedAt)}.`,
      ] },
      { label: METHOD_GROUPS.colours, items: [v3.weekly && colourLine] },
      { label: METHOD_GROUPS.limits, items: [
        recordingGapsLine,
        <Term t="Near a limit">vehicles are seen only about once a minute, so the {pct(v3.uncertainty.nearCutoffShare)} of trips leaving the end of the line within {Math.round(v3.uncertainty.withinMin * 60)} seconds of a limit could land on either side of it.</Term>,
        lo && lo.noTimetableTrip > 0 && <Term t="Unscheduled trips">{lo.noTimetableTrip.toLocaleString()} runs ({pct(lo.noTimetableTrip / (lo.kept + lo.noTimetableTrip + lo.excluded))} of the vehicle trips seen) under a trip number not on the timetable, such as extra or unscheduled buses, are left out; the figures describe the {lo.kept.toLocaleString()} timetabled trips kept.</Term>,
        lo && lo.excluded > 0 && <Term t="Other services">{lo.excluded.toLocaleString()} runs by {lo.excludedLabel ?? 'another service'} that share this route number are left out.</Term>,
        <Term t="Mismatched trip numbers">{pct(v3.swaps.rate)} of trips ran under a trip number that did not fit their own timetable slot: {v3.swaps.reassigned} were matched to the slot that fit, {v3.swaps.dropped} were left out.</Term>,
        unknown > 0 && <Term t="Unjudged trips">{unknown.toLocaleString()} trips that could not be judged are left out of Delivered.</Term>,
      ] },
    
      ]} />
    );
  }
  const { s } = props;
  const coverage = coveredRoutesText(s.agency, s.routes);
  const w = s.weekly;
  return (
    <MethodFootnote id="agency-method" groups={[
          { label: METHOD_GROUPS.numbers, items: [
            lateLine,
            runTimeLine(),
            extraWaitLine,
            bunchingLine(),
            deliveredLine(),
            delaysStartLine,
          ] },
          { label: METHOD_GROUPS.data, items: [
            ...(w ? weekWindowItems({ ...w, health: [] }) : []),
            positionsLine,
            tripMatchLine(),
            <Term t="Covered">{coverage}{s.held.length ? ` (${s.held.map(h => h.route).join(', ')} not included)` : ''}.</Term>,
            networkFiguresLine,
            stopsLine,
            builtText(s.generatedAt) + '.',
          ] },
          { label: METHOD_GROUPS.colours, items: [w && colourLine] },
          { label: METHOD_GROUPS.limits, items: [recordingGapsLine] },
        
    ]} after={<p className="mt-2 text-xs"><ArrowLink href="/about/docs#glossary">What these terms mean</ArrowLink></p>} />
  );
}
