/**
 * The planner map's stop card, in two labelled groups so the two kinds of figure never read as one (CIV-946): how late
 * vehicles run against their timetable time, and how long a rider waits against the scheduled gaps. The same facts as
 * the strip's stop hover (stopDetail); only the grouping and labels differ. Every heading and line here is wording to
 * confirm with Ryan.
 */
import { USUALLY_ON_TIME, usuallyOffBy } from '../../../shared/liveWording';
import { tenth } from '../../../shared/liveFormat';
import { bunchParts, type RouteStripStop } from './routeStripModel';

export interface CardGroup { heading: string | null; lines: string[] }

export const STOP_CARD_WORDS = {
  vehicles: 'Vehicles vs timetable',
  wait: 'Rider wait at this stop',
  lateShare: (pct: string) => `${pct} are 5½+ min late`,
  // The measures keep the names the switcher and the table use, with the key's approved definitions.
  extraWait: (min: string) => `Extra wait: ${min} min beyond the scheduled gap`,
  noExtraWait: 'Extra wait: none beyond the scheduled gap',
  gaps: (close: string, far: string) => `Bunching: ${close} too close · ${far} too far apart`,
  gapsTotal: (total: string) => `Bunching: ${total} too close or too far apart`,
  notMeasured: 'Delay not measured',
  lessExact: 'Less exact here: vehicles report their location less often',
} as const;

const pct = (x: number) => `${Math.round(x * 100)}%`;

/** `extraWaitMin`: the stop's extra wait (null where service is less frequent than every 15 min, or not measured). */
export function stopCardGroups(stop: RouteStripStop, extraWaitMin: number | null): CardGroup[] {
  const W = STOP_CARD_WORDS;
  const vehicles: string[] = [];
  if (stop.n > 0 && stop.delayMin != null) {
    vehicles.push(Math.abs(stop.delayMin) < 0.05 || (stop.delayMin < 0 && stop.timepoint === false) ? USUALLY_ON_TIME : usuallyOffBy(tenth(Math.abs(stop.delayMin)), stop.delayMin > 0 ? 'late' : 'early'));
    if (stop.lateShare != null) vehicles.push(W.lateShare(pct(stop.lateShare)));
  } else vehicles.push(W.notMeasured);
  const wait: string[] = [];
  if (extraWaitMin != null) {
    const m = Math.max(0, extraWaitMin);
    wait.push(m < 0.05 ? W.noExtraWait : W.extraWait(tenth(m)));
  }
  const parts = bunchParts(stop);
  if (parts && stop.bunchedShare != null && stop.gappedShare != null) wait.push(W.gaps(`${parts.bunched}%`, `${parts.tooLong}%`));
  else if (parts) wait.push(W.gapsTotal(`${parts.total}%`));
  return [
    { heading: W.vehicles, lines: vehicles },
    ...(wait.length ? [{ heading: W.wait, lines: wait }] : []),
    ...(stop.uncertain ? [{ heading: null, lines: [W.lessExact] }] : []),
  ];
}
