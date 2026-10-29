/**
 * The Live terms, in the words the Live agency page's "How this is measured" uses (a test keeps the two identical).
 * The Docs page's Glossary shows them. `text` is the rest of the sentence after the bold term, no colon (CIV-1075).
 */
import { COLOURED_CHANGES } from './liveDashboard.js';
import { DELAY_LEGEND_TITLE, DELAY_STEP_LABELS, EARLY_STEP_LABEL, LATE_DEFINITION, RECORDING_GAPS } from './liveWording.js';

/** `legend`: a chart key rather than a definition, shown as "**Term**: …" (E22) and not on the agency page. */
export interface LiveTerm { term: string; text: string; legend?: boolean }

export const LIVE_GLOSSARY: readonly LiveTerm[] = [
  { term: 'Late', text: LATE_DEFINITION },
  { term: 'Run time', text: 'is how long a typical trip takes over the main stretch, compared with the schedule.' },
  { term: 'Extra wait', text: 'is how much longer riders wait than the schedule says, worked out from the gaps between vehicles at each stop.' },
  { term: 'Bunching', text: 'is when the gap between vehicles is under 2 min, or more than twice the scheduled gap.' },
  { term: 'Delivered', text: 'is the share of scheduled trips that actually ran.' },
  { term: 'Vehicle positions', text: 'are recorded once a minute for each vehicle. The time it left each stop is estimated from those and compared with the schedule.' },
  { term: 'Trip matching', text: 'links each vehicle to its scheduled trip by trip number.' },
  { term: 'Network figures', text: 'combine every trip on every covered route. A route with more trips has more effect on the total.' },
  { term: 'Stops', text: 'are listed once they have 30 or more departures, with up to 3 per route direction.' },
  { term: 'Coloured changes', text: COLOURED_CHANGES },
  { term: 'Recording gaps', text: RECORDING_GAPS },
  { term: DELAY_LEGEND_TITLE, text: [EARLY_STEP_LABEL, ...DELAY_STEP_LABELS].join(' · '), legend: true },
];
