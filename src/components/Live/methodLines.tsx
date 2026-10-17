/**
 * The lines of "How this is measured" that the agency page and the route pages share, so the same item reads the same
 * way everywhere. Page-only lines are written next to their page.
 */
import { LATE_AT_OR_ABOVE_MIN } from '../../../shared/liveDelayStatus';
import { NOISE_RULE } from '../../../shared/liveDashboard';
import { RECORDING_GAPS } from '../../../shared/liveWording';
import { Term } from './MethodFootnote';

/** The definitions' text (after "Term:"), shared by the footnote lines and the planner's visible explanations. */
export const RUN_TIME_TEXT = 'the typical trip over the main stretch against its scheduled time';
export const EXTRA_WAIT_TEXT = 'how much longer riders wait than the timetable says, worked out from the gaps between vehicles at each stop.';
export const bunchingText = (underMin = 2) => `gaps under ${underMin} minutes or over twice the timetable's.`;

export const lateLine = <Term t="Late">trips that left the end of the line more than 5 min late.</Term>;
export const lateAtStopLine = (lateMin: number = LATE_AT_OR_ABOVE_MIN, aheadMin?: number) => (
  <Term t="Late at a stop">left the stop {lateMin}+ minutes after the timetable{aheadMin != null ? `; ahead means ${aheadMin}+ minutes before it` : ''}.</Term>
);
export const runTimeLine = (shortTurns = false) => (
  <Term t="Run time">{RUN_TIME_TEXT}{shortTurns ? '; only trips seen at both ends count, so short turns are left out' : ''}.</Term>
);
export const extraWaitLine = <Term t="Extra wait">{EXTRA_WAIT_TEXT}</Term>;
export const bunchingLine = (underMin = 2) => <Term t="Bunching">{bunchingText(underMin)}</Term>;
export const deliveredLine = (rule = false) => (
  <Term t="Delivered">scheduled trips that ran{rule ? '; a trip counts as run when a vehicle was seen under its trip number' : ''}.</Term>
);

export const positionsLine = <Term t="Vehicle positions">each vehicle is seen about once a minute; the moment it left each stop is estimated from that and compared with the timetable.</Term>;
export const tripMatchLine = (rule = false) => (
  <Term t="Trip matching">vehicles are matched to timetable trips by trip number{rule ? '; a trip 15+ minutes off its own slot counts as another trip that fits within 3 minutes at most stops, or else is left out' : ''}.</Term>
);

export const colourLine = NOISE_RULE;
export const recordingGapsLine = <Term t="Recording gaps">{RECORDING_GAPS}</Term>;
