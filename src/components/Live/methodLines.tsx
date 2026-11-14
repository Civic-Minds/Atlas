/**
 * The lines of "How this is measured" that the agency page and the route pages share, so the same item reads the same
 * way everywhere. Page-only lines are written next to their page.
 */
import { COLOURED_CHANGES } from '../../../shared/liveDashboard';
import { LATE_DEFINITION, RECORDING_GAPS, TRIP_TIME_LABEL } from '../../../shared/liveWording';
import { Term } from './MethodFootnote';

// E9–E23 as Ryan approved them (CIV-1075): each line is the bold term, then the rest of its sentence, no colon.

/** The definitions' text (after the term), shared by the footnote lines and the planner's visible explanations. */
export const RUN_TIME_TEXT = 'is how long a typical trip takes over the main stretch, compared with the schedule';
export const EXTRA_WAIT_TEXT = 'is how much longer riders wait than the schedule says, worked out from the gaps between vehicles at each stop.';
export const bunchingText = (underMin = 2) => `is when the gap between vehicles is under ${underMin} min, or more than twice the scheduled gap.`;

export const lateLine = <Term t="Late">{LATE_DEFINITION}</Term>;
/** What "ahead" means, its own line after the Late definition. */
export const aheadLine = (aheadMin: number) => <Term t="Ahead">is {aheadMin} min or more ahead of schedule.</Term>;
export const runTimeLine = (shortTurns = false) => (
  <Term t={TRIP_TIME_LABEL}>{RUN_TIME_TEXT}{shortTurns ? '; only trips seen at both ends count, so short turns are left out' : ''}.</Term>
);
export const extraWaitLine = <Term t="Extra wait">{EXTRA_WAIT_TEXT}</Term>;
export const bunchingLine = (underMin = 2) => <Term t="Bunching">{bunchingText(underMin)}</Term>;
export const deliveredLine = (rule = false) => (
  <Term t="Delivered">is the share of scheduled trips that actually ran{rule ? '; a trip counts as run when a vehicle was seen under its trip number' : ''}.</Term>
);

export const positionsLine = <Term t="Vehicle positions">are recorded once a minute for each vehicle. The time it left each stop is estimated from those and compared with the schedule.</Term>;
export const tripMatchLine = (rule = false) => (
  <Term t="Trip matching">links each vehicle to its scheduled trip by trip number{rule ? '; a trip 15+ minutes off its own slot counts as another trip that fits within 3 minutes at most stops, or else is left out' : ''}.</Term>
);

export const colourLine = <Term t="Coloured changes">{COLOURED_CHANGES}</Term>;
export const recordingGapsLine = <Term t="Recording gaps">{RECORDING_GAPS}</Term>;

/** The agency page's own lines, here so the Docs glossary can be checked against them. */
export const networkFiguresLine = <Term t="Network figures">combine every trip on every covered route. A route with more trips has more effect on the total.</Term>;
export const stopsLine = <Term t="Stops">are listed once they have 30 or more departures, with up to 3 per route direction.</Term>;
