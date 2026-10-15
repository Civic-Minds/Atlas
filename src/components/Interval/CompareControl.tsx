import ModeTab from '../ModeTab';
import { Columns2 } from 'lucide-react';
import { MAP_BADGE } from '../../styles';
import Pill from '../ui/Pill';
import { FilterChips } from './FilterChips';
import { DAY_TYPES } from '../../../shared/dayTypes';
import { HEADWAY_TIERS } from '../../utils/colors';
import { PERIOD_KEYS, PERIOD_LABELS, type TimePeriod } from '../../hooks/useIntervalStats';
import { compareSideHeading, type CompareSide } from '../../utils/compareSides';
import { headwayFilterLabel } from '../../utils/headwayText';

export { compareSideLabel, defaultCompareSide, type CompareSide } from '../../utils/compareSides';

export function SideBadge({ side }: { side: 'A' | 'B' }) {
  return (
    <span className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-[var(--text-primary)] text-2xs font-black text-[var(--bg-panel)]" aria-hidden="true">
      {side}
    </span>
  );
}

const PERIOD_OPTIONS = ['all', ...PERIOD_KEYS] as TimePeriod[];
const frequencyOptionLabel = (max: number) => (max === Infinity ? 'All routes' : headwayFilterLabel(max));

/** Frequency, day and time buttons for one compare side (the phone filter panel uses this for B). */
export function CompareSidePicker({ side, onChange }: { side: CompareSide; onChange: (side: CompareSide) => void }) {
  return (
    <div className="flex flex-col gap-3">
      <div>
        <p className="mb-1.5 text-xs font-black text-[var(--text-dim)]">Frequency</p>
        <div className="flex flex-wrap gap-1">
          {HEADWAY_TIERS.map(({ max }) => (
            <Pill size="segment" key={max} onClick={() => onChange({ ...side, maxHeadway: max })} selected={side.maxHeadway === max}>
              {frequencyOptionLabel(max)}
            </Pill>
          ))}
        </div>
      </div>
      <div>
        <p className="mb-1.5 text-xs font-black text-[var(--text-dim)]">Day</p>
        <div className="flex gap-1">
          {DAY_TYPES.map(day => (
            <Pill size="segment" key={day} onClick={() => onChange({ ...side, day })} selected={side.day === day}>
              {day}
            </Pill>
          ))}
        </div>
      </div>
      <div>
        <p className="mb-1.5 text-xs font-black text-[var(--text-dim)]">Time</p>
        <div className="flex flex-wrap gap-1">
          {PERIOD_OPTIONS.map(period => (
            <Pill size="segment" key={period} onClick={() => onChange({ ...side, period })} selected={side.period === period}>
              {PERIOD_LABELS[period]}
            </Pill>
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * Top-bar view tab beside History and Live. Compare swaps the whole map for two synced maps, so it
 * sits with the other views rather than with the filter chips. It toggles like the other view tabs:
 * pressed while comparing, and pressing it again goes back to the single map.
 */
export function CompareTab({ active, onStart, onExit }: { active: boolean; onStart: () => void; onExit: () => void }) {
  return (
    <ModeTab
      icon={<Columns2 className="h-3.5 w-3.5" aria-hidden="true" />}
      label="Compare" ariaLabel="Compare two maps"
      active={active}
      onClick={active ? onExit : onStart}
    />
  );
}

/** Phone version of the Compare tab: an item in the top bar's More menu, beside History and Live. */
export function CompareMenuItem({ active, onStart, onExit, onDone }: { active: boolean; onStart: () => void; onExit: () => void; onDone: () => void }) {
  return (
    <ModeTab
      variant="menu" icon={<Columns2 className="h-3.5 w-3.5" aria-hidden="true" />}
      label="Compare" ariaLabel="Compare two maps" active={active}
      onClick={() => { (active ? onExit : onStart)(); onDone(); }}
    />
  );
}

const NO_MODES = new Set<number>();
const NO_AGENCIES = new Set<string>();
const noop = () => {};

interface CompareSideBarProps {
  side: 'A' | 'B';
  settings: CompareSide;
  onChange: (settings: CompareSide) => void;
  /** Routes this map draws in view, and how many of those the other map does not. */
  counts: { total: number; only: number } | null;
  /** "on Saturday", "at every 15 min" or "on map B": where the other side is. */
  otherPhrase: string;
}

/**
 * Sits on each compare map: the side's label (its settings and route counts) and its own
 * Frequency, Day and Time menus (the same chips and menus as the main filter bar), so it is
 * clear which map each control changes.
 */
export function CompareSideBar({ side, settings, onChange, counts, otherPhrase }: CompareSideBarProps) {
  return (
    <div className="flex flex-col items-center sm:items-end gap-1.5" data-compare-side={side}>
      <div className={`${MAP_BADGE} min-h-8 py-1 gap-x-1.5 gap-y-0 flex-wrap justify-center max-w-[calc(100vw-2rem)] sm:flex-nowrap sm:max-w-none`}>
        <SideBadge side={side} />
        <span className="text-xs font-black text-[var(--text-primary)] whitespace-nowrap" data-testid={`compare-heading-${side}`}>{compareSideHeading(settings)}</span>
        {counts && (
          <span className="text-xs font-semibold text-[var(--text-dim)] whitespace-nowrap" data-testid={`compare-counts-${side}`}>
            <span className="hidden sm:inline">· </span>{counts.total} {counts.total === 1 ? 'route' : 'routes'}, {counts.only} not {otherPhrase}
          </span>
        )}
      </div>
      <div className="pointer-events-auto">
        <FilterChips
          variant="side"
          groupLabel={`Map ${side} settings`}
          maxHeadway={settings.maxHeadway}
          setMaxHeadway={maxHeadway => onChange({ ...settings, maxHeadway })}
          day={settings.day}
          setDay={day => onChange({ ...settings, day })}
          period={settings.period}
          setPeriod={period => onChange({ ...settings, period })}
          selectedModes={NO_MODES}
          setSelectedModes={noop}
          agencies={[]}
          selectedAgencies={NO_AGENCIES}
          setSelectedAgencies={noop}
          bounds={null}
        />
      </div>
    </div>
  );
}
