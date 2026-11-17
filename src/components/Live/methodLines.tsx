/**
 * The lines of "How this is measured" that the agency page and the route pages share, so the same item reads the same
 * way everywhere. Their words live in shared/liveGlossary (the Docs Glossary's one home); only the page-only clauses
 * and the Ahead line are written here.
 */
import { AGENCY_FIGURES_TEXT, COLOURED_CHANGES_TERM, EXTRA_WAIT_TEXT, POSITIONS_TERM, POSITIONS_TEXT, RECORDING_GAPS_TERM, STOPS_TERM, STOPS_TEXT, TRIP_MATCH_TERM, bunchingText, deliveredText, tripMatchText, tripTimeText } from '../../../shared/liveGlossary';
import { COLOURED_CHANGES } from '../../../shared/liveDashboard';
import { AGENCY_FIGURES_TERM, BUNCHING_LABEL, DELIVERED_LABEL, EXTRA_WAIT_LABEL, LATE_DEFINITION, LATE_LABEL, RECORDING_GAPS, TRIP_TIME_LABEL } from '../../../shared/liveWording';
import { Term } from './MethodFootnote';

// E9–E23 as Ryan approved them (CIV-1075): each line is the bold term, then the rest of its sentence, no colon.

export const lateLine = <Term t={LATE_LABEL}>{LATE_DEFINITION}</Term>;
/** What "ahead" means, its own line after the Late definition. */
export const aheadLine = (aheadMin: number) => <Term t="Ahead">is {aheadMin} min or more ahead of schedule.</Term>;
export const runTimeLine = (shortTurns = false) => (
  <Term t={TRIP_TIME_LABEL}>{tripTimeText(shortTurns ? '; only trips seen at both ends count, so short turns are left out' : '')}</Term>
);
export const extraWaitLine = <Term t={EXTRA_WAIT_LABEL}>{EXTRA_WAIT_TEXT}</Term>;
export const bunchingLine = (underMin = 2) => <Term t={BUNCHING_LABEL}>{bunchingText(underMin)}</Term>;
export const deliveredLine = (rule = false) => (
  <Term t={DELIVERED_LABEL}>{deliveredText(rule ? '; a trip counts as run when a vehicle was seen under its trip number' : '')}</Term>
);

export const positionsLine = <Term t={POSITIONS_TERM}>{POSITIONS_TEXT}</Term>;
export const tripMatchLine = (rule = false) => (
  <Term t={TRIP_MATCH_TERM}>{tripMatchText(rule ? '; a trip 15+ minutes off its own slot counts as another trip that fits within 3 minutes at most stops, or else is left out' : '')}</Term>
);

export const colourLine = <Term t={COLOURED_CHANGES_TERM}>{COLOURED_CHANGES}</Term>;
export const recordingGapsLine = <Term t={RECORDING_GAPS_TERM}>{RECORDING_GAPS}</Term>;

/** The agency page's own lines. */
export const networkFiguresLine = <Term t={AGENCY_FIGURES_TERM}>{AGENCY_FIGURES_TEXT}</Term>;
export const stopsLine = <Term t={STOPS_TERM}>{STOPS_TEXT}</Term>;
