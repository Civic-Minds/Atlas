/**
 * The Live terms, in the words the Live agency page's "How this is measured" uses (a test keeps the two identical).
 * The Docs page's Glossary shows them. `text` reads after "Term:".
 */
import { NOISE_RULE } from './liveDashboard.js';
import { LATE_DEFINITION, RECORDING_GAPS } from './liveWording.js';

export interface LiveTerm { term: string; text: string }

export const LIVE_GLOSSARY: readonly LiveTerm[] = [
  { term: 'Late', text: LATE_DEFINITION },
  { term: 'Run time', text: 'the typical trip over the main stretch against its scheduled time.' },
  { term: 'Extra wait', text: 'how much longer riders wait than the schedule says, worked out from the gaps between vehicles at each stop.' },
  { term: 'Bunching', text: "gaps under 2 minutes or over twice the schedule's." },
  { term: 'Delivered', text: 'scheduled trips that ran.' },
  { term: 'Where delays start', text: 'the stretch where delay jumps and stays up; directions where delay builds slowly have no single place and are left out.' },
  { term: 'Vehicle positions', text: 'each vehicle is seen about once a minute; the moment it left each stop is estimated from that and compared with the schedule.' },
  { term: 'Trip matching', text: 'vehicles are matched to scheduled trips by trip number.' },
  { term: 'Network figures', text: 'every departure, trip or gap on the covered routes added up, not an average of route figures, so busy routes weigh more.' },
  { term: 'Stops', text: 'at least 30 departures, at most 3 from one route direction.' },
  { term: 'How changes are coloured', text: NOISE_RULE },
  { term: 'Recording gaps', text: RECORDING_GAPS },
];
