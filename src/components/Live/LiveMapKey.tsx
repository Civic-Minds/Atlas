import MapKey from '../ui/MapKey';
import { dashedLineSwatch, MAP_BADGE, MAP_BADGE_LABEL } from '../../styles';
import { MAP_STEP_LIMITS, measureLabel, type MapMeasure } from './routeMapModel';
import { STEP_LABELS, stepColor, type Step } from './routeStripModel';
import { useState } from 'react';
import { NOT_MEASURED_LABEL, lateKeyLimit, type OnTimeWords } from '../../../shared/liveWording';
import { FLOATING_CARD } from '../../styles';
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

/** CIV-2912: a not-measured stretch is dashed on the map, so its key is dashed too, never a second grey beside step 0's. */
const NOT_MEASURED_SWATCH = dashedLineSwatch('var(--strip-delay-0)');

/** Delay starts' definition, after its name in the key (Ryan, 2026-10-26, word for word). */
export const DELAY_STARTS_NOTE = 'delay added that lasts 3+ stops';

/** The picked measure's one-line definition, first in the key (Ryan, 2026-10-26, word for word). Run time has none; Delay starts' is its note. */
const KEY_DEFINITION: Partial<Record<MapMeasure, string>> = { late: `${lateKeyLimit()} late`, extraWait: 'wait beyond the scheduled gap', bunching: 'gaps under 2 min or over 2× scheduled', delayStarts: DELAY_STARTS_NOTE };
/** The definition at the agency's own late limit where it has one (CIV-3151). */
const keyDefinition = (measure: MapMeasure, window?: OnTimeWords | null): string | undefined => (measure === 'late' ? `${lateKeyLimit(window)} late` : KEY_DEFINITION[measure]);

/**
 * The Live map's key, as a row of pills (the regular map's legend pills): the measure's definition, then its three colour
 * steps. Shared by the Live map and the "Stops most often late" map (CIV-1405); the caller places it.
 */
export default function LiveMapKey({ measure, notMeasured = true, variant = 'pills', window }: { measure: MapMeasure; /** The agency's on-time window, for the late limit. */ window?: OnTimeWords | null; /** Whether the key lists NOT_MEASURED_LABEL (a map whose every mark is measured leaves it out). */ notMeasured?: boolean; /** `card`: the definition and the steps for the regular map's key card (the Live tool's map, CIV-1821); `one`: in one pill; `pills`: two pills. */ variant?: 'pills' | 'one' | 'card' }) {
  const labels = stepLabels(measure);
  const steps = [
    ...labels.map((l, i) => ({ color: stepColor(measure === 'bunching' ? 'bunching' : 'delay', i as Step), label: <span className={`${MAP_BADGE_LABEL} whitespace-nowrap`}>{l}</span> })),
    ...(notMeasured ? [{ ...NOT_MEASURED_SWATCH, label: <span className={`${MAP_BADGE_LABEL} whitespace-nowrap`}>{NOT_MEASURED_LABEL}</span> }] : []),
  ];
  if (variant === 'card') return (
    <>
      <p className="m-0 mb-1.5 text-xs font-bold text-[var(--text-muted)]">{measureLabel(measure)}{keyDefinition(measure, window) && <span className="font-normal"> · {keyDefinition(measure, window)}</span>}</p>
      <MapKey stepsClassName="grid grid-cols-2 gap-x-2 gap-y-0.5" steps={[
        ...labels.map((l, i) => ({ color: stepColor(measure === 'bunching' ? 'bunching' : 'delay', i as Step), label: l, className: 'text-xs text-[var(--text-primary)]' })),
        ...(notMeasured ? [{ ...NOT_MEASURED_SWATCH, label: NOT_MEASURED_LABEL, className: 'text-xs text-[var(--text-primary)]' }] : []),
      ]} />
    </>
  );
  if (variant === 'one') return (
    <div className={`${MAP_BADGE} min-h-8 max-w-full flex-wrap gap-x-3 gap-y-1.5 py-1.5`} role="group" aria-label={MAP_COLOURS_LABEL}>
      <span className="whitespace-nowrap text-xs font-bold leading-none text-[var(--text-secondary)]">{measureLabel(measure)}{keyDefinition(measure, window) && <span className="font-normal text-[var(--text-muted)]"> · {keyDefinition(measure, window)}</span>}</span>
      <MapKey steps={steps} />
    </div>
  );
  return (
    // On a phone the pills wrap inside the map's width; each label keeps its words on one line (#1151).
    <div className="flex max-w-full flex-wrap items-center justify-end gap-2">
      {keyDefinition(measure, window) && <div className={`${MAP_BADGE} min-h-8 max-w-full py-1`}><span className={MAP_BADGE_LABEL}>{keyDefinition(measure, window)}</span></div>}
      <div className={`${MAP_BADGE} min-h-8 max-w-full flex-wrap gap-x-3 gap-y-1.5 py-1.5`} role="group" aria-label={MAP_COLOURS_LABEL}>
        <span className="whitespace-nowrap text-xs font-bold leading-none text-[var(--text-secondary)]">{measureLabel(measure)}</span>
        <MapKey steps={[
          ...labels.map((l, i) => ({ color: stepColor(measure === 'bunching' ? 'bunching' : 'delay', i as Step), label: <span className={`${MAP_BADGE_LABEL} whitespace-nowrap`}>{l}</span> })),
          ...(notMeasured ? [{ ...NOT_MEASURED_SWATCH, label: <span className={`${MAP_BADGE_LABEL} whitespace-nowrap`}>{NOT_MEASURED_LABEL}</span> }] : []),
        ]} />
      </div>
    </div>
  );
}

/**
 * The Live map's key as one bottom pill (Ryan, 2026-11-27: "should this be a pill at the bottom instead of this ugly shit",
 * picked 1): "Late · 5½+ min", in the map's pill style beside "Data up to…", opening the full key above it when tapped.
 */
export function LiveMapKeyPill({ measure, window, notMeasured = true }: { measure: MapMeasure; window?: OnTimeWords | null; notMeasured?: boolean }) {
  const [open, setOpen] = useState(false);
  const short = measure === 'late' ? lateKeyLimit(window) : keyDefinition(measure, window);
  return (
    <div className="relative pointer-events-auto">
      <button type="button" aria-expanded={open} aria-label={MAP_COLOURS_LABEL} onClick={() => setOpen(o => !o)} className={`${MAP_BADGE} h-8 max-sm:h-[32px] cursor-pointer`}>
        <span className={`${MAP_BADGE_LABEL} whitespace-nowrap`}>{measureLabel(measure)}{short && ` · ${short}`}</span>
      </button>
      {open && (
        <div role="group" aria-label={MAP_COLOURS_LABEL} className={`${FLOATING_CARD} absolute bottom-full right-0 mb-2 w-72 max-w-[calc(100vw-2.5rem)] p-3`}>
          <LiveMapKey measure={measure} window={window} notMeasured={notMeasured} variant="card" />
        </div>
      )}
    </div>
  );
}
