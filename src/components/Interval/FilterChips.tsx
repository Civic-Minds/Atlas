import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Search } from 'lucide-react';
import { HEADWAY_TIERS, getTierColor } from '../../utils/colors';
import { FLOATING_CARD, GLASS_PILL, PANEL_ENTER_TOP, CONTROL_ACTIVE, CONTROL_ACTIVE_GLASS, CONTROL_INACTIVE } from '../../styles';
import Pill from '../ui/Pill';
import type { Agency } from '../../App';
import { PERIOD_LABELS, PERIOD_KEYS } from '../../hooks/useIntervalStats';
import type { TimePeriod, ViewportBounds } from '../../hooks/useIntervalStats';
import { FEATURES, formatPeriodRange, periodKeyForHour } from '../../../shared/config';
import { agencyDisplayParts } from '../../utils/format';
import { bboxInViewport } from '../../utils/agencySearch';
import { filterModeOptions } from '../../../shared/modes';
import { DAY_TYPES, getNowDay, type DayType } from '../../../shared/dayTypes';
import type { FrequentServiceFrequency, FrequentServiceWindow } from '../../../shared/frequentService';
import type { NightServiceFrequency } from '../../../shared/nightService';
import { useColorVision } from '../../context/ColorVisionContext';
import { headwayAmount, headwayBandLabel, headwayFilterLabel, headwayTierLabel } from '../../utils/headwayText';

export { getNowDay };

interface FilterChipsProps {
  maxHeadway: number;
  setMaxHeadway: (h: number) => void;
  selectedModes: Set<number>;
  setSelectedModes: React.Dispatch<React.SetStateAction<Set<number>>>;
  day: DayType;
  setDay: (d: DayType) => void;
  period: TimePeriod;
  setPeriod: (p: TimePeriod) => void;
  agencies: Agency[];
  selectedAgencies: Set<string>;
  setSelectedAgencies: React.Dispatch<React.SetStateAction<Set<string>>>;
  bounds: ViewportBounds | null;
  researchMode?: boolean;
  researchDays?: DayType[];
  setResearchDays?: (days: DayType[]) => void;
  researchFrequency?: FrequentServiceFrequency;
  setResearchFrequency?: (frequency: FrequentServiceFrequency) => void;
  researchWindow?: FrequentServiceWindow;
  setResearchWindow?: (window: FrequentServiceWindow) => void;
  nightServiceMode?: boolean;
  nightServiceFrequency?: NightServiceFrequency;
  setNightServiceFrequency?: (frequency: NightServiceFrequency) => void;
  /**
   * Compare mode. 'shared': only the filters both maps share (Mode and Agencies), labelled as
   * such. 'side': only Frequency, Day and Time, for one map's own controls. Same chips and menus
   * as the full bar either way.
   */
  variant?: 'full' | 'shared' | 'side';
  /** Accessible name for the 'side' variant's group, e.g. "Map B settings". */
  groupLabel?: string;
}

const MODES = filterModeOptions(FEATURES.onDemand);

export function getNowPeriod(): TimePeriod {
  return periodKeyForHour(new Date().getHours()) ?? 'all';
}

/**
 * Same as getNowPeriod, but for the current hour where a specific agency
 * actually operates rather than the viewer's own browser-local clock — see
 * #245 (a viewer in Toronto opening a UK/Mexico agency at 11pm local landed on
 * "late/overnight" even when it was mid-afternoon where that agency runs).
 * Falls back to local time when no IANA timezone is known for the agency
 * (most agencies processed before this field existed, or no agency in view
 * yet) — same neutral behavior as getNowPeriod.
 */
export function getNowPeriodForTimezone(timezone?: string | null, now: Date = new Date()): TimePeriod {
  if (!timezone) return periodKeyForHour(now.getHours()) ?? 'all';
  try {
    const hourStr = new Intl.DateTimeFormat('en-US', { hour: 'numeric', hour12: false, timeZone: timezone }).format(now);
    // "24" at midnight in some locales/environments -- normalize to 0.
    const hour = parseInt(hourStr, 10) % 24;
    return periodKeyForHour(hour) ?? 'all';
  } catch {
    // Invalid/unrecognized IANA name (bad upstream agency_timezone value) -- don't crash the app over it.
    return periodKeyForHour(now.getHours()) ?? 'all';
  }
}

type ChipId = 'frequency' | 'day' | 'period' | 'mode' | 'agencies' | 'compact';

const PANEL = `absolute top-10 right-0 ${FLOATING_CARD} p-2 ${PANEL_ENTER_TOP} flex flex-col gap-1`;

const rowBtn = (active: boolean) =>
  `w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md text-xs font-bold transition-all border text-left min-w-0 ${active ? CONTROL_ACTIVE : CONTROL_INACTIVE}`;

interface AgenciesPanelProps {
  agencies: Agency[];
  selectedAgencies: Set<string>;
  setSelectedAgencies: React.Dispatch<React.SetStateAction<Set<string>>>;
  bounds: ViewportBounds | null;
  agencyQuery: string;
  setAgencyQuery: (q: string) => void;
  agencySearchRef: React.RefObject<HTMLInputElement | null>;
}

export function applyAgencyBulkSelection(current: Set<string>, allSlugs: string[], enabled: boolean): Set<string> {
  if (enabled) return new Set(allSlugs);
  const next = new Set(current);
  allSlugs.forEach(s => next.delete(s));
  return next;
}

function AgenciesPanel({ agencies, selectedAgencies, setSelectedAgencies, bounds, agencyQuery, setAgencyQuery, agencySearchRef }: AgenciesPanelProps) {
  const [showAll, setShowAll] = useState(false);

  // Build deduplicated groups, tagging each with whether it overlaps the current viewport
  const allGroups = useMemo(() => {
    const groups: { name: string; slugs: string[]; region: string; loaded: boolean; cities?: string[]; displayArea?: string }[] = [];
    for (const a of agencies) {
      const region = a.region ?? 'Other';
      const inView = bboxInViewport(a, bounds);
      const g = groups.find(x => x.name === a.name && x.region === region);
      if (g) { g.slugs.push(a.slug); if (inView) g.loaded = true; }
      else groups.push({ name: a.name, slugs: [a.slug], region, loaded: inView, cities: a.cities, displayArea: a.displayArea });
    }
    return groups;
  }, [agencies, bounds]);

  const byRegion = useMemo(() => {
    const q = agencyQuery.toLowerCase();
    const source = (showAll || q) ? allGroups : allGroups.filter(g => g.loaded);
    const filtered = q
      ? source.filter(g =>
          g.name.toLowerCase().includes(q)
          || g.region.toLowerCase().includes(q)
          || (g.cities ?? []).some(city => city.toLowerCase().includes(q)))
      : source;
    const map = new Map<string, typeof allGroups>();
    for (const g of filtered) {
      if (!map.has(g.region)) map.set(g.region, []);
      map.get(g.region)!.push(g);
    }
    return map;
  }, [allGroups, agencyQuery, showAll]);

  const allSlugs = useMemo(() => agencies.map(a => a.slug), [agencies]);
  // Bulk actions are global. The list is viewport-scoped for readability, but
  // "All" must never turn agencies outside the current map view off.
  const allOn = allSlugs.length > 0 && allSlugs.every(s => selectedAgencies.has(s));
  const allOff = allSlugs.length > 0 && allSlugs.every(s => !selectedAgencies.has(s));

  return (
    <div className={`${PANEL} w-56`}>
      <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-[var(--bg-btn)] border border-[var(--border-primary)]">
        <Search className="w-3 h-3 text-[var(--text-dim)] shrink-0" />
        <input
          ref={agencySearchRef}
          value={agencyQuery}
          onChange={e => setAgencyQuery(e.target.value)}
          placeholder="Search…"
          className="flex-1 bg-transparent text-xs font-bold text-[var(--text-primary)] placeholder:text-[var(--text-dim)] outline-none"
        />
      </div>
      <div className="flex gap-1 px-1 pt-1">
        <Pill
          tone="outline"
          onClick={() => setSelectedAgencies(applyAgencyBulkSelection(selectedAgencies, allSlugs, true))}
          disabled={allOn}
          className="flex-1"
        >
          All
        </Pill>
        <Pill
          tone="outline"
          onClick={() => setSelectedAgencies(applyAgencyBulkSelection(selectedAgencies, allSlugs, false))}
          disabled={allOff}
          className="flex-1"
        >
          None
        </Pill>
      </div>
      <div className="max-h-64 overflow-y-auto custom-scrollbar flex flex-col gap-0.5">
        {byRegion.size === 0 && (
          <p className="px-2 py-2 text-xs text-[var(--text-dim)]">No agencies in view.</p>
        )}
        {[...byRegion.entries()].map(([region, groups]) => (
          <div key={region}>
            <p className="px-2 pt-2 pb-0.5 text-xs font-black text-[var(--text-dim)]">{region}</p>
            {groups.map(g => {
              const active = g.slugs.every(s => selectedAgencies.has(s));
              const { primary, secondary } = agencyDisplayParts(g.name, g.cities, g.displayArea);
              return (
                <button
                  key={g.name}
                  onClick={() => {
                    const next = new Set(selectedAgencies);
                    if (active) g.slugs.forEach(s => next.delete(s));
                    else g.slugs.forEach(s => next.add(s));
                    setSelectedAgencies(next);
                  }}
                  className={rowBtn(active)}
                  aria-pressed={active}
                  aria-label={g.name}
                >
                  <span className="truncate flex-1 min-w-0">
                    {primary}
                    {secondary && <span className="opacity-60 font-semibold"> · {secondary}</span>}
                  </span>
                  <span className={`ml-auto w-2 h-2 rounded-full shrink-0 ${active ? 'bg-current' : 'border border-current opacity-30'}`} />
                </button>
              );
            })}
          </div>
        ))}
        {!agencyQuery && (
          <button
            onClick={() => setShowAll(v => !v)}
            className="mt-1 mb-0.5 mx-2 text-xs font-bold text-[var(--text-dim)] hover:text-[var(--accent)] transition-colors text-left"
          >
            {showAll ? '← In view only' : `All agencies (${allGroups.length}) →`}
          </button>
        )}
      </div>
    </div>
  );
}

export const FilterChips: React.FC<FilterChipsProps> = ({
  maxHeadway,
  setMaxHeadway,
  selectedModes,
  setSelectedModes,
  day,
  setDay,
  period,
  setPeriod,
  agencies,
  selectedAgencies,
  setSelectedAgencies,
  bounds,
  researchMode = false,
  researchDays = ['Weekday'],
  setResearchDays,
  researchFrequency = 15,
  setResearchFrequency,
  researchWindow = 'daytime',
  setResearchWindow,
  nightServiceMode = false,
  nightServiceFrequency = 60,
  setNightServiceFrequency,
  variant = 'full',
  groupLabel,
}) => {
  const { colorVisionFriendly } = useColorVision();
  const colorMode = colorVisionFriendly ? 'friendly' : 'default';
  const [openChip, setOpenChip] = useState<ChipId | null>(null);
  const [agencyQuery, setAgencyQuery] = useState('');
  const agencySearchRef = useRef<HTMLInputElement>(null);
  const rowRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!openChip) { setAgencyQuery(''); return; }
    const onClick = (e: MouseEvent) => {
      if (rowRef.current && !rowRef.current.contains(e.target as Node)) setOpenChip(null);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [openChip]);

  useEffect(() => {
    if (openChip === 'agencies') setTimeout(() => agencySearchRef.current?.focus(), 50);
  }, [openChip]);

  const toggleMode = (id: number) => {
    const next = new Set(selectedModes);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelectedModes(next);
  };

  // An empty set means no mode restriction, so every mode is active by default.
  const modeIsActive = (id: number) => selectedModes.size === 0 || selectedModes.has(id);

  const toggleAgency = (slug: string) => {
    const next = new Set(selectedAgencies);
    if (next.has(slug)) next.delete(slug); else next.add(slug);
    setSelectedAgencies(next);
  };

  const chipClass = (active: boolean) =>
    `relative h-8 px-3.5 flex items-center justify-center ${GLASS_PILL} border text-xs font-bold transition-colors whitespace-nowrap ${
      active
        ? CONTROL_ACTIVE_GLASS
        : 'bg-[var(--bg-panel)] border-[var(--border-primary)] text-[var(--text-primary)] hover:text-[var(--accent)]'
    }`;

  const Dot = ({ show }: { show: boolean }) =>
    show ? <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-[var(--accent)] border border-[var(--bg-panel)]" /> : null;

  const toggle = (id: ChipId) => setOpenChip(c => c === id ? null : id);

  const hasActiveCoreFilter = maxHeadway !== Infinity || period !== 'all' || selectedModes.size > 0;

  if (nightServiceMode && setNightServiceFrequency) {
    return (
      <div ref={rowRef} className="flex items-center gap-2">
        <div className="flex items-center gap-1 rounded-full border border-[var(--border-primary)] p-0.5">
          {([30, 60] as const).map(value => (
            <Pill size="segment" key={value} onClick={() => setNightServiceFrequency(value)} selected={nightServiceFrequency === value}>
              {headwayAmount(value)}
            </Pill>
          ))}
        </div>
      </div>
    );
  }

  if (researchMode && setResearchDays && setResearchFrequency && setResearchWindow) {
    const researchButton = (active: boolean) => rowBtn(active);
    const toggleResearchDay = (selected: DayType) => {
      const next = researchDays.includes(selected)
        ? researchDays.filter(dayType => dayType !== selected)
        : [...researchDays, selected];
      if (next.length > 0) setResearchDays(DAY_TYPES.filter(dayType => next.includes(dayType)));
    };
    return (
      <div ref={rowRef} className="flex items-center gap-2">
        <div className="relative">
          <button onClick={() => toggle('day')} className={chipClass(true)}>Day<Dot show /></button>
          {openChip === 'day' && <div className={`${PANEL} w-40`}>
            {DAY_TYPES.map(dayType => <button key={dayType} onClick={() => toggleResearchDay(dayType)} className={researchButton(researchDays.includes(dayType))}>{dayType}</button>)}
          </div>}
        </div>
        <div className="flex items-center gap-1 rounded-full border border-[var(--border-primary)] p-0.5">
          {([15, 30] as const).map(value => <Pill size="segment" key={value} onClick={() => setResearchFrequency(value)} selected={researchFrequency === value}>{headwayAmount(value)}</Pill>)}
        </div>
        {researchFrequency === 30 && (
          <div className="hidden xl:flex items-center gap-2 text-xs font-bold text-[var(--text-muted)]" aria-label="30-minute view legend">
            <span className="flex items-center gap-1"><span className="inline-block h-1 rounded-full" style={{ background: getTierColor('15', colorMode), width: 12 }} />{headwayTierLabel(15)}</span>
            <span className="flex items-center gap-1"><span className="inline-block h-0.5 rounded-full" style={{ background: getTierColor('30', colorMode), width: 12 }} />{headwayBandLabel(16, 30)}</span>
          </div>
        )}
        <div className="flex items-center gap-1 rounded-full border border-[var(--border-primary)] p-0.5">
          {([['daytime', '7am–7pm'], ['extended', '7am–midnight']] as const).map(([value, label]) => <Pill size="segment" key={value} onClick={() => setResearchWindow(value)} selected={researchWindow === value}>{label}</Pill>)}
        </div>
        <div className="relative">
          <button onClick={() => toggle('mode')} className={chipClass(selectedModes.size > 0)}>Mode<Dot show={selectedModes.size > 0} /></button>
          {openChip === 'mode' && <div className={`${PANEL} w-56`}>
            <div className="flex flex-wrap gap-1">
              {MODES.map(mode => <Pill key={mode.id} size="segment" onClick={() => toggleMode(mode.id)} selected={modeIsActive(mode.id)}>{mode.label}</Pill>)}
            </div>
          </div>}
        </div>
      </div>
    );
  }

  const frequencyChip = (className: string) => (
    <div className={`relative ${className}`}>
      <button onClick={() => toggle('frequency')} className={chipClass(maxHeadway !== Infinity)}>
        Frequency
        <Dot show={maxHeadway !== Infinity} />
      </button>
      {openChip === 'frequency' && (
        <div className={`${PANEL} w-36`}>
          {HEADWAY_TIERS.map(({ max, label }) => {
            const isSelected = maxHeadway === max;
            const color = isFinite(max) ? getTierColor(String(max), colorMode) : 'var(--text-dim)';
            return (
              <button
                key={label}
                onClick={() => { setMaxHeadway(max); setOpenChip(null); }}
                className={rowBtn(isSelected)}
                aria-pressed={isSelected}
                aria-label={max === Infinity ? 'Show all routes' : `${headwayFilterLabel(max)}`}
              >
                <span className="w-2 h-2 rounded-full shrink-0" style={{ background: color }} />
                {label === 'Infrequent' ? 'All' : label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );

  const dayChip = (className: string) => (
    <div className={`relative ${className}`}>
      <button onClick={() => toggle('day')} className={chipClass(true)}>
        Day
        <Dot show={true} />
      </button>
      {openChip === 'day' && (
        <div className={`${PANEL} w-36`}>
          {DAY_TYPES.map((d) => (
            <button
              key={d}
              onClick={() => { setDay(d); setOpenChip(null); }}
              className={rowBtn(day === d)}
              aria-pressed={day === d}
            >
              {d}
            </button>
          ))}
        </div>
      )}
    </div>
  );

  const periodChip = (className: string) => (
    <div className={`relative ${className}`}>
      <button onClick={() => toggle('period')} className={chipClass(true)}>
        Time
        <Dot show={true} />
      </button>
      {openChip === 'period' && (
        <div className={`${PANEL} w-36`}>
          {PERIOD_KEYS.map((p) => (
            <button
              key={p}
              onClick={() => { setPeriod(p); setOpenChip(null); }}
              className={`${rowBtn(period === p)} flex items-center justify-between gap-3`}
              aria-pressed={period === p}
            >
              <span>{PERIOD_LABELS[p]}</span>
              <span className="text-xs opacity-70 shrink-0">{formatPeriodRange(p)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );

  const agenciesChip = (
    <div className="relative">
      {(() => {
        const allOn = selectedAgencies.size >= agencies.length;
        return (
          <button onClick={() => toggle('agencies')} className={chipClass(!allOn)}>
            Agencies
            <Dot show={!allOn} />
          </button>
        );
      })()}
      {openChip === 'agencies' && (
        <AgenciesPanel
          agencies={agencies}
          selectedAgencies={selectedAgencies}
          setSelectedAgencies={setSelectedAgencies}
          bounds={bounds}
          agencyQuery={agencyQuery}
          setAgencyQuery={setAgencyQuery}
          agencySearchRef={agencySearchRef}
        />
      )}
    </div>
  );

  const modeChip = (className: string) => (
    <div className={`relative ${className}`}>
      <button onClick={() => toggle('mode')} className={chipClass(selectedModes.size > 0)}>
        Mode
        <Dot show={selectedModes.size > 0} />
      </button>
      {openChip === 'mode' && (
        <div className={`${PANEL} w-56`}>
          <div className="flex flex-wrap gap-1">
            {MODES.map((m) => (
              <Pill key={m.id} size="segment" onClick={() => toggleMode(m.id)} selected={modeIsActive(m.id)}>
                {m.label}
              </Pill>
            ))}
          </div>
        </div>
      )}
    </div>
  );

  if (variant === 'side') {
    return (
      <div ref={rowRef} className="flex items-center gap-2" role="group" aria-label={groupLabel}>
        {frequencyChip('')}
        {dayChip('')}
        {periodChip('')}
      </div>
    );
  }

  if (variant === 'shared') {
    return (
      <div ref={rowRef} className="flex items-center gap-2" role="group" aria-label="Filters for both maps">
        <span className="h-8 px-3 flex items-center gap-1.5 rounded-full bg-[var(--bg-panel)] backdrop-blur-md border border-[var(--border-primary)] text-xs font-bold text-[var(--text-primary)] whitespace-nowrap">
          <span className="inline-flex h-4 px-1 items-center justify-center rounded-full bg-[var(--text-primary)] text-2xs font-black text-[var(--bg-panel)]" aria-hidden="true">A+B</span>
          Both maps
        </span>
        {modeChip('')}
        {agenciesChip}
      </div>
    );
  }

  return (
    <div ref={rowRef} className="flex items-center gap-2">

      {/* Compact "More filters" panel — only below lg */}
      <div className="relative lg:hidden">
        <button onClick={() => toggle('compact')} className={chipClass(hasActiveCoreFilter)}>
          More filters
          <Dot show={hasActiveCoreFilter} />
        </button>
        {openChip === 'compact' && (
          <div className={`absolute top-10 right-0 ${FLOATING_CARD} p-3 w-72 ${PANEL_ENTER_TOP} flex flex-col gap-3`}>
            {/* Frequency */}
            <div>
              <p className="text-xs font-black text-[var(--text-dim)] mb-1.5">Frequency</p>
              <div className="flex flex-wrap gap-1">
                {HEADWAY_TIERS.map(({ max, label }) => {
                  const color = isFinite(max) ? getTierColor(String(max), colorMode) : 'var(--text-dim)';
                  return (
                    <Pill size="segment" key={label} onClick={() => setMaxHeadway(max)} selected={maxHeadway === max}>
                      <span className="w-1.5 h-1.5 rounded-full mr-1.5 shrink-0" style={{ background: color }} />
                      {label === 'Infrequent' ? 'All routes' : label}
                    </Pill>
                  );
                })}
              </div>
            </div>
            {/* Day */}
            <div>
              <p className="text-xs font-black text-[var(--text-dim)] mb-1.5">Day</p>
              <div className="flex gap-1">
                {DAY_TYPES.map(d => (
                  <Pill size="segment" key={d} onClick={() => setDay(d)} selected={day === d}>
                    {d === 'Saturday' ? 'Sat' : d === 'Sunday' ? 'Sun' : 'Weekday'}
                  </Pill>
                ))}
              </div>
            </div>
            {/* Time */}
            <div>
              <p className="text-xs font-black text-[var(--text-dim)] mb-1.5">Time</p>
              <div className="flex flex-wrap gap-1">
                {PERIOD_KEYS.map(p => (
                  <Pill size="segment" key={p} onClick={() => setPeriod(p)} selected={period === p}>
                    {PERIOD_LABELS[p]}
                  </Pill>
                ))}
              </div>
            </div>
            {/* Mode */}
            <div>
              <p className="text-xs font-black text-[var(--text-dim)] mb-1.5">Mode</p>
              <div className="flex flex-wrap gap-1">
                {MODES.map(m => (
                  <Pill size="segment" key={m.id} onClick={() => toggleMode(m.id)} selected={modeIsActive(m.id)}>
                    {m.label}
                  </Pill>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Frequency, day and time */}
      {frequencyChip('hidden lg:block')}
      {dayChip('hidden lg:block')}
      {periodChip('hidden lg:block')}
      {/* Mode */}
      {modeChip('hidden lg:block')}

      {/* Agencies */}
      {agenciesChip}

    </div>
  );
};
