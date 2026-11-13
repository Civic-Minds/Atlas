import MapKey from '../ui/MapKey';
import { MAP_BADGE, MAP_BADGE_LABEL } from '../../styles';
import { MAP_STEP_LIMITS, measureLabel, type MapMeasure } from './routeMapModel';
import { STEP_LABELS, stepColor, type Step } from './routeStripModel';
import { pct } from './sections/figures';

/** The three step labels of a measure's key: the bunching key the strips already use, and the same shape for the others. */
function stepLabels(measure: MapMeasure): [string, string, string] {
  if (measure === 'bunching') return [...STEP_LABELS.bunching] as [string, string, string];
  const [a, b] = MAP_STEP_LIMITS[measure];
  if (measure === 'late') return [`Under ${pct(a)}`, `${pct(a)}–${pct(b)}`, `${pct(b)} or more`];
  const m = (x: number) => `${x} min`;
  return [`Under ${m(a)}`, `${a}–${m(b)}`, `${m(b)} or more`];
}

/** Delay starts' definition, after its name in the key (Ryan, 2026-10-26, word for word). */
export const DELAY_STARTS_NOTE = 'delay added that lasts 3+ stops';

/** The picked measure's one-line definition, first in the key (Ryan, 2026-10-26, word for word). Run time has none; Delay starts' is its note. */
const KEY_DEFINITION: Partial<Record<MapMeasure, string>> = { late: '5½+ min late', extraWait: 'wait beyond the scheduled gap', bunching: 'gaps under 2 min or over 2× scheduled', delayStarts: DELAY_STARTS_NOTE };

/**
 * The Live map's key, as a row of pills (the regular map's legend pills): the measure's definition, then its three colour
 * steps. Shared by the Live map and the "Stops most often late" map (CIV-1405); the caller places it.
 */
export default function LiveMapKey({ measure, notMeasured = true }: { measure: MapMeasure; /** Whether the key lists "Not measured" (a map whose every mark is measured leaves it out). */ notMeasured?: boolean }) {
  const labels = stepLabels(measure);
  return (
    // On a phone the pills wrap inside the map's width; each label keeps its words on one line (#1151).
    <div className="flex max-w-full flex-wrap items-center justify-end gap-2">
      {KEY_DEFINITION[measure] && <div className={`${MAP_BADGE} min-h-8 max-w-full py-1`}><span className={MAP_BADGE_LABEL}>{KEY_DEFINITION[measure]}</span></div>}
      <div className={`${MAP_BADGE} min-h-8 max-w-full flex-wrap gap-x-3 gap-y-1.5 py-1.5`} role="group" aria-label="Map colours">
        <span className="whitespace-nowrap text-xs font-bold leading-none text-[var(--text-secondary)]">{measureLabel(measure)}</span>
        <MapKey steps={[
          ...labels.map((l, i) => ({ color: stepColor(measure === 'bunching' ? 'bunching' : 'delay', i as Step), label: <span className={`${MAP_BADGE_LABEL} whitespace-nowrap`}>{l}</span> })),
          ...(notMeasured ? [{ color: 'var(--strip-delay-0)', swatchClassName: 'opacity-45', label: <span className={`${MAP_BADGE_LABEL} whitespace-nowrap`}>Not measured</span> }] : []),
        ]} />
      </div>
    </div>
  );
}
