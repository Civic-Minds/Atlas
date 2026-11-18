import MapKey from '../ui/MapKey';
import { MAP_BADGE, MAP_BADGE_LABEL } from '../../styles';
import { MAP_STEP_LIMITS, measureLabel, type MapMeasure } from './routeMapModel';
import { STEP_LABELS, stepColor, type Step } from './routeStripModel';
import { LATE_THRESHOLD, NOT_MEASURED_LABEL } from '../../../shared/liveWording';
import { percentText } from '../../../shared/numberText';
import { minutesText } from '../../../shared/liveFormat';
import { headwayBandLabel } from '../../../shared/headwayText';
import { MAP_COLOURS_LABEL } from '../../content/noticeCopy';

/** The three step labels of a measure's key: the bunching key the strips already use, and the same shape for the others. */
function stepLabels(measure: MapMeasure): [string, string, string] {
  if (measure === 'bunching') return [...STEP_LABELS.bunching] as [string, string, string];
  const [a, b] = MAP_STEP_LIMITS[measure];
  if (measure === 'late') return [`Under ${percentText(a)}`, `${percentText(a)}–${percentText(b)}`, `${percentText(b)} or more`];
  return [`Under ${minutesText(a)}`, headwayBandLabel(a, b), `${minutesText(b)} or more`];
}

/** Delay starts' definition, after its name in the key (Ryan, 2026-10-26, word for word). */
export const DELAY_STARTS_NOTE = 'delay added that lasts 3+ stops';

/** The picked measure's one-line definition, first in the key (Ryan, 2026-10-26, word for word; Late's is the one late line, LATE_THRESHOLD, 2026-11-17). Run time has none; Delay starts' is its note. */
const KEY_DEFINITION: Partial<Record<MapMeasure, string>> = { late: LATE_THRESHOLD, extraWait: 'wait beyond the scheduled gap', bunching: 'gaps under 2 min or over 2× scheduled', delayStarts: DELAY_STARTS_NOTE };

/**
 * The Live map's key, as a row of pills (the regular map's legend pills): the measure's definition, then its three colour
 * steps. Shared by the Live map and the "Stops most often late" map (CIV-1405); the caller places it.
 */
export default function LiveMapKey({ measure, notMeasured = true, variant = 'pills' }: { measure: MapMeasure; /** Whether the key lists NOT_MEASURED_LABEL (a map whose every mark is measured leaves it out). */ notMeasured?: boolean; /** `card`: the definition and the steps for the regular map's key card (the Live tool's map, CIV-1821); `one`: in one pill; `pills`: two pills. */ variant?: 'pills' | 'one' | 'card' }) {
  const labels = stepLabels(measure);
  const steps = [
    ...labels.map((l, i) => ({ color: stepColor(measure === 'bunching' ? 'bunching' : 'delay', i as Step), label: <span className={`${MAP_BADGE_LABEL} whitespace-nowrap`}>{l}</span> })),
    ...(notMeasured ? [{ color: 'var(--strip-delay-0)', swatchClassName: 'opacity-45', label: <span className={`${MAP_BADGE_LABEL} whitespace-nowrap`}>{NOT_MEASURED_LABEL}</span> }] : []),
  ];
  if (variant === 'card') return (
    <>
      <p className="m-0 mb-1.5 text-xs font-bold text-[var(--text-muted)]">{measureLabel(measure)}{KEY_DEFINITION[measure] && <span className="font-normal"> · {KEY_DEFINITION[measure]}</span>}</p>
      <MapKey stepsClassName="grid grid-cols-2 gap-x-2 gap-y-0.5" steps={[
        ...labels.map((l, i) => ({ color: stepColor(measure === 'bunching' ? 'bunching' : 'delay', i as Step), label: l, className: 'text-xs text-[var(--text-primary)]' })),
        ...(notMeasured ? [{ color: 'var(--strip-delay-0)', swatchClassName: 'opacity-45', label: NOT_MEASURED_LABEL, className: 'text-xs text-[var(--text-primary)]' }] : []),
      ]} />
    </>
  );
  if (variant === 'one') return (
    <div className={`${MAP_BADGE} min-h-8 max-w-full flex-wrap gap-x-3 gap-y-1.5 py-1.5`} role="group" aria-label={MAP_COLOURS_LABEL}>
      <span className="whitespace-nowrap text-xs font-bold leading-none text-[var(--text-secondary)]">{measureLabel(measure)}{KEY_DEFINITION[measure] && <span className="font-normal text-[var(--text-muted)]"> · {KEY_DEFINITION[measure]}</span>}</span>
      <MapKey steps={steps} />
    </div>
  );
  return (
    // On a phone the pills wrap inside the map's width; each label keeps its words on one line (#1151).
    <div className="flex max-w-full flex-wrap items-center justify-end gap-2">
      {KEY_DEFINITION[measure] && <div className={`${MAP_BADGE} min-h-8 max-w-full py-1`}><span className={MAP_BADGE_LABEL}>{KEY_DEFINITION[measure]}</span></div>}
      <div className={`${MAP_BADGE} min-h-8 max-w-full flex-wrap gap-x-3 gap-y-1.5 py-1.5`} role="group" aria-label={MAP_COLOURS_LABEL}>
        <span className="whitespace-nowrap text-xs font-bold leading-none text-[var(--text-secondary)]">{measureLabel(measure)}</span>
        <MapKey steps={[
          ...labels.map((l, i) => ({ color: stepColor(measure === 'bunching' ? 'bunching' : 'delay', i as Step), label: <span className={`${MAP_BADGE_LABEL} whitespace-nowrap`}>{l}</span> })),
          ...(notMeasured ? [{ color: 'var(--strip-delay-0)', swatchClassName: 'opacity-45', label: <span className={`${MAP_BADGE_LABEL} whitespace-nowrap`}>{NOT_MEASURED_LABEL}</span> }] : []),
        ]} />
      </div>
    </div>
  );
}
