/**
 * The Live terms: the one home for their words. The Live agency and route pages' "How this is measured" lines
 * (src/components/Live/methodLines.tsx) are built from these pieces, and the Docs page's Glossary shows LIVE_GLOSSARY.
 * Each `text` is the rest of the sentence after the bold term, no colon (CIV-1075). A page that adds its own clause
 * passes it through the function, so the clause lands before the full stop.
 */
import { COLOURED_CHANGES } from './liveDashboard.js';
import { AGENCY_FIGURES_TERM, BUNCHING_LABEL, DELAY_LEGEND_TITLE, DELAY_STEP_LABELS, DELIVERED_LABEL, EARLY_STEP_LABEL, EXTRA_WAIT_LABEL, LATE_DEFINITION, LATE_LABEL, RECORDING_GAPS, TRIP_TIME_LABEL } from './liveWording.js';

/** `legend`: a chart key rather than a definition, shown as "**Term**: …" (E22) and not on the agency page. */
export interface LiveTerm { term: string; text: string; legend?: boolean }

/** The terms that have no label elsewhere in Live. */
export const POSITIONS_TERM = 'Vehicle positions';
export const TRIP_MATCH_TERM = 'Trip matching';
export const STOPS_TERM = 'Stops';
export const COLOURED_CHANGES_TERM = 'Coloured changes';
export const RECORDING_GAPS_TERM = 'Recording gaps';

/** A definition with an optional page-only clause before its full stop. */
const sentence = (stem: string, clause = '') => `${stem}${clause}.`;

export const tripTimeText = (clause = '') => sentence('is how long a typical trip takes over the main stretch, compared with the schedule', clause);
export const EXTRA_WAIT_TEXT = 'is how much longer riders wait than the schedule says, worked out from the gaps between vehicles at each stop.';
export const bunchingText = (underMin = 2) => `is when the gap between vehicles is under ${underMin} min, or more than twice the scheduled gap.`;
export const deliveredText = (clause = '') => sentence('is the share of scheduled trips that actually ran', clause);
export const POSITIONS_TEXT = 'are recorded once a minute for each vehicle. The time it left each stop is estimated from those and compared with the schedule.';
export const tripMatchText = (clause = '') => sentence('links each vehicle to its scheduled trip by trip number', clause);
export const AGENCY_FIGURES_TEXT = 'combine every trip on every covered route. A route with more trips has more effect on the total.';
export const STOPS_TEXT = 'are listed once they have 30 or more departures, with up to 3 per route direction.';

export const LIVE_GLOSSARY: readonly LiveTerm[] = [
  { term: LATE_LABEL, text: LATE_DEFINITION },
  { term: TRIP_TIME_LABEL, text: tripTimeText() },
  { term: EXTRA_WAIT_LABEL, text: EXTRA_WAIT_TEXT },
  { term: BUNCHING_LABEL, text: bunchingText() },
  { term: DELIVERED_LABEL, text: deliveredText() },
  { term: POSITIONS_TERM, text: POSITIONS_TEXT },
  { term: TRIP_MATCH_TERM, text: tripMatchText() },
  { term: AGENCY_FIGURES_TERM, text: AGENCY_FIGURES_TEXT },
  { term: STOPS_TERM, text: STOPS_TEXT },
  { term: COLOURED_CHANGES_TERM, text: COLOURED_CHANGES },
  { term: RECORDING_GAPS_TERM, text: RECORDING_GAPS },
  { term: DELAY_LEGEND_TITLE, text: [EARLY_STEP_LABEL, ...DELAY_STEP_LABELS].join(' · '), legend: true },
];
