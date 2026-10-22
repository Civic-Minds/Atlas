import ModeTab from '../ModeTab';
import { Columns2, Lock, LockOpen } from 'lucide-react';
import { MAP_BADGE } from '../../styles';
import Pill from '../ui/Pill';
import RoundIconButton from '../ui/RoundIconButton';
import { FilterChips } from './FilterChips';
import { DayPicker, FrequencyPicker, PeriodPicker, PickerSection } from './pickers';
import { compareSideHeading, type CompareSide } from '../../utils/compareSides';
import { plural } from '../../../shared/overflowText';

export { compareSideLabel, defaultCompareSide, type CompareSide } from '../../utils/compareSides';

export function SideBadge({ side }: { side: 'A' | 'B' }) {
  return (
    <span className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-[var(--text-primary)] text-2xs font-black text-[var(--bg-panel)]" aria-hidden="true">
      {side}
    </span>
  );
}


/** Frequency, day and time buttons for one compare side (the phone filter panel uses this for B). */
export function CompareSidePicker({ side, onChange }: { side: CompareSide; onChange: (side: CompareSide) => void }) {
  return (
    <div className="flex flex-col gap-3">
      <PickerSection title="Frequency"><FrequencyPicker value={side.maxHeadway} onChange={maxHeadway => onChange({ ...side, maxHeadway })} /></PickerSection>
      <PickerSection title="Day"><DayPicker value={side.day} onChange={day => onChange({ ...side, day })} /></PickerSection>
      <PickerSection title="Time"><PeriodPicker includeAll value={side.period} onChange={period => onChange({ ...side, period })} /></PickerSection>
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

/** Text for the link button (title and screen-reader name); the pressed state says whether the maps are linked. */
export const COMPARE_LINK_LABEL = 'Link map views';

/** The icon for each state: one place to change it. The two shapes differ, so the state never rests on colour alone. */
const COMPARE_LINK_ICONS = { linked: Lock, unlinked: LockOpen };

/**
 * Sits on the divider between the two compare maps. Pressed (the default) means the maps are linked and
 * move together; not pressed, each map moves on its own. Same round icon button and selected look as
 * the other map toggles.
 */
export function CompareLinkToggle({ linked, onChange }: { linked: boolean; onChange: (linked: boolean) => void }) {
  const Icon = linked ? COMPARE_LINK_ICONS.linked : COMPARE_LINK_ICONS.unlinked;
  return (
    <RoundIconButton
      pressed={linked}
      onClick={() => onChange(!linked)}
      aria-label={COMPARE_LINK_LABEL}
      title={COMPARE_LINK_LABEL}
      data-testid="compare-link-toggle"
      className={`h-10! w-10! border-2! shadow-xl ring-4 ring-[var(--bg-panel)] backdrop-blur-md ${linked ? '' : 'bg-[var(--bg-panel)]! border-[var(--border-primary)]!'}`}
    >
      <Icon className="h-5 w-5" strokeWidth={2.25} aria-hidden="true" />
    </RoundIconButton>
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
    <div className="flex flex-col items-center sm:items-end gap-1.5 min-w-0 max-w-full" data-compare-side={side}>
      <div className={`${MAP_BADGE} min-h-8 max-sm:min-h-[32px] py-1 gap-x-1.5 gap-y-0 flex-wrap justify-center max-w-[calc(100vw-2rem)] sm:flex-nowrap sm:max-w-full sm:min-w-0`}>
        <SideBadge side={side} />
        <span className="text-xs font-black text-[var(--text-primary)] whitespace-nowrap sm:shrink-0" data-testid={`compare-heading-${side}`}>{compareSideHeading(settings)}</span>
        {counts && (
          <span className="text-xs font-semibold text-[var(--text-dim)] whitespace-nowrap sm:min-w-0 sm:truncate" data-testid={`compare-counts-${side}`}>
            <span className="hidden sm:inline">· </span>{counts.total} {plural(counts.total, 'route')}, {counts.only} not {otherPhrase}
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
