import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Search } from 'lucide-react';
import { HEADWAY_TIERS, getTierColor } from '../../utils/colors';
import { FLOATING_CARD, CHIP_BASE, PANEL_ENTER_TOP } from '../../styles';
import type { Agency } from '../../App';
import type { AgencyLayers } from '../../hooks/useAgencyData';
import { VIRTUAL_LRT_MODE, PERIOD_LABELS } from '../../hooks/useIntervalStats';
import type { TimePeriod } from '../../hooks/useIntervalStats';
import { TIME_PERIODS } from '../../../shared/config';

interface FilterChipsProps {
  maxHeadway: number;
  setMaxHeadway: (h: number) => void;
  selectedModes: Set<number>;
  setSelectedModes: React.Dispatch<React.SetStateAction<Set<number>>>;
  day: 'Weekday' | 'Saturday' | 'Sunday';
  setDay: (d: 'Weekday' | 'Saturday' | 'Sunday') => void;
  period: TimePeriod;
  setPeriod: (p: TimePeriod) => void;
  agencies: Agency[];
  selectedAgencies: Set<string>;
  setSelectedAgencies: React.Dispatch<React.SetStateAction<Set<string>>>;
  layers: AgencyLayers;
}

const MODES = [
  { id: 1, label: 'Subway' },
  { id: VIRTUAL_LRT_MODE, label: 'LRT' },
  { id: 0, label: 'Streetcar' },
  { id: 2, label: 'Rail' },
  { id: 3, label: 'Bus' },
  { id: 4, label: 'Ferry' },
];


const PERIODS: TimePeriod[] = ['amPeak', 'midday', 'pmPeak', 'evening', 'lateNight'];

function fmtHour(h: number): string {
  const h12 = h % 24;
  if (h12 === 0 || h12 === 24) return '12a';
  if (h12 === 12) return '12p';
  return h12 < 12 ? `${h12}a` : `${h12 - 12}p`;
}

function periodRange(key: string): string {
  const p = TIME_PERIODS.find(t => t.key === key);
  if (!p) return '';
  return `${fmtHour(p.startHour)}–${fmtHour(p.endHour)}`;
}

export function getNowDay(): 'Weekday' | 'Saturday' | 'Sunday' {
  const d = new Date().getDay();
  if (d === 0) return 'Sunday';
  if (d === 6) return 'Saturday';
  return 'Weekday';
}

export function getNowPeriod(): TimePeriod {
  const h = new Date().getHours();
  const matched = TIME_PERIODS.find(p => h >= p.startHour && h < p.endHour);
  return (matched?.key as TimePeriod) || 'all';
}

type ChipId = 'frequency' | 'day' | 'period' | 'mode' | 'agencies' | 'compact';

const PANEL = `absolute top-10 right-0 ${FLOATING_CARD} p-2 ${PANEL_ENTER_TOP} flex flex-col gap-1`;

const compactOptBtn = (active: boolean) =>
  `h-7 px-2.5 flex items-center justify-center text-[11px] font-bold rounded-full border transition-colors ${
    active
      ? 'bg-[var(--accent-bg)] border-[var(--accent-border)] text-[var(--accent)]'
      : 'border-[var(--border-primary)] text-[var(--text-dim)] hover:text-[var(--text-primary)]'
  }`;

const rowBtn = (active: boolean) =>
  `w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md text-[11px] font-bold transition-all border text-left min-w-0 ${
    active
      ? 'bg-[var(--accent-bg)] border-[var(--accent-border)] text-[var(--accent)]'
      : 'bg-[var(--bg-btn)] border-[var(--border-primary)] text-[var(--text-dim)] hover:text-[var(--text-primary)]'
  }`;

interface AgenciesPanelProps {
  agencies: Agency[];
  selectedAgencies: Set<string>;
  setSelectedAgencies: React.Dispatch<React.SetStateAction<Set<string>>>;
  layers: AgencyLayers;
  agencyQuery: string;
  setAgencyQuery: (q: string) => void;
  agencySearchRef: React.RefObject<HTMLInputElement | null>;
}

function AgenciesPanel({ agencies, selectedAgencies, setSelectedAgencies, layers, agencyQuery, setAgencyQuery, agencySearchRef }: AgenciesPanelProps) {
  const [showAll, setShowAll] = useState(false);

  // Build deduplicated groups, tagging each with whether it's loaded in the current viewport
  const allGroups = useMemo(() => {
    const groups: { name: string; slugs: string[]; region: string; loaded: boolean }[] = [];
    for (const a of agencies) {
      const region = a.region ?? 'Other';
      const g = groups.find(x => x.name === a.name && x.region === region);
      if (g) { g.slugs.push(a.slug); if (a.slug in layers) g.loaded = true; }
      else groups.push({ name: a.name, slugs: [a.slug], region, loaded: a.slug in layers });
    }
    return groups;
  }, [agencies, layers]);

  const byRegion = useMemo(() => {
    const q = agencyQuery.toLowerCase();
    const source = (showAll || q) ? allGroups : allGroups.filter(g => g.loaded);
    const filtered = q ? source.filter(g => g.name.toLowerCase().includes(q) || g.region.toLowerCase().includes(q)) : source;
    const map = new Map<string, typeof allGroups>();
    for (const g of filtered) {
      if (!map.has(g.region)) map.set(g.region, []);
      map.get(g.region)!.push(g);
    }
    return map;
  }, [allGroups, agencyQuery, showAll]);

  const loadedSlugs = useMemo(() => allGroups.filter(g => g.loaded).flatMap(g => g.slugs), [allGroups]);
  const allSlugs = useMemo(() => agencies.map(a => a.slug), [agencies]);
  const scopedSlugs = (showAll || agencyQuery) ? allSlugs : loadedSlugs;
  const allOn = scopedSlugs.every(s => selectedAgencies.has(s));
  const allOff = scopedSlugs.every(s => !selectedAgencies.has(s));

  return (
    <div className={`${PANEL} w-56`}>
      <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-[var(--bg-btn)] border border-[var(--border-primary)]">
        <Search className="w-3 h-3 text-[var(--text-dim)] shrink-0" />
        <input
          ref={agencySearchRef}
          value={agencyQuery}
          onChange={e => setAgencyQuery(e.target.value)}
          placeholder="Search…"
          className="flex-1 bg-transparent text-[11px] font-bold text-[var(--text-primary)] placeholder:text-[var(--text-dim)] outline-none"
        />
      </div>
      <div className="flex gap-1 px-1 pt-1">
        <button
          onClick={() => setSelectedAgencies(new Set(scopedSlugs))}
          disabled={allOn}
          className="flex-1 text-[10px] font-bold py-0.5 rounded-md border border-[var(--border-primary)] text-[var(--text-dim)] hover:text-[var(--text-primary)] hover:border-[var(--accent-border)] disabled:opacity-30 disabled:cursor-default transition-colors"
        >
          All
        </button>
        <button
          onClick={() => setSelectedAgencies(new Set())}
          disabled={allOff}
          className="flex-1 text-[10px] font-bold py-0.5 rounded-md border border-[var(--border-primary)] text-[var(--text-dim)] hover:text-[var(--text-primary)] hover:border-[var(--accent-border)] disabled:opacity-30 disabled:cursor-default transition-colors"
        >
          None
        </button>
      </div>
      <div className="max-h-64 overflow-y-auto custom-scrollbar flex flex-col gap-0.5">
        {byRegion.size === 0 && (
          <p className="px-2 py-2 text-[10px] text-[var(--text-dim)]">No agencies in view.</p>
        )}
        {[...byRegion.entries()].map(([region, groups]) => (
          <div key={region}>
            <p className="px-2 pt-2 pb-0.5 text-[8px] font-black text-[var(--text-dim)] uppercase tracking-widest">{region}</p>
            {groups.map(g => {
              const active = g.slugs.every(s => selectedAgencies.has(s));
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
                  aria-label={g.name}
                >
                  <span className="truncate flex-1">{g.name}</span>
                  {active && (
                    <span className="ml-auto w-2 h-2 rounded-full bg-current shrink-0" />
                  )}
                </button>
              );
            })}
          </div>
        ))}
        {!agencyQuery && (
          <button
            onClick={() => setShowAll(v => !v)}
            className="mt-1 mb-0.5 mx-2 text-[10px] font-bold text-[var(--text-dim)] hover:text-[var(--accent)] transition-colors text-left"
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
  layers,
}) => {
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

  const toggleAgency = (slug: string) => {
    const next = new Set(selectedAgencies);
    if (next.has(slug)) next.delete(slug); else next.add(slug);
    setSelectedAgencies(next);
  };

  const chipClass = (active: boolean) =>
    `relative h-8 px-3.5 flex items-center justify-center ${CHIP_BASE} text-xs font-bold transition-colors whitespace-nowrap ${
      active
        ? 'border-[var(--accent-border)] text-[var(--accent)]'
        : 'border-[var(--border-primary)] text-[var(--text-primary)] hover:text-[var(--accent)]'
    }`;

  const Dot = ({ show }: { show: boolean }) =>
    show ? <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-[var(--accent)] border border-[var(--bg-panel)]" /> : null;

  const toggle = (id: ChipId) => setOpenChip(c => c === id ? null : id);

  const hasActiveCoreFilter = maxHeadway !== Infinity || period !== 'all' || selectedModes.size > 0;

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
              <p className="text-[8px] font-black text-[var(--text-dim)] uppercase tracking-widest mb-1.5">Frequency</p>
              <div className="flex flex-wrap gap-1">
                {HEADWAY_TIERS.map(({ max, label }) => {
                  const color = isFinite(max) ? getTierColor(String(max)) : 'var(--text-dim)';
                  return (
                    <button key={label} onClick={() => setMaxHeadway(max)} className={compactOptBtn(maxHeadway === max)}>
                      <span className="w-1.5 h-1.5 rounded-full mr-1.5 shrink-0" style={{ background: color }} />
                      {label === 'Infrequent' ? 'All routes' : label}
                    </button>
                  );
                })}
              </div>
            </div>
            {/* Day */}
            <div>
              <p className="text-[8px] font-black text-[var(--text-dim)] uppercase tracking-widest mb-1.5">Day</p>
              <div className="flex gap-1">
                {(['Weekday', 'Saturday', 'Sunday'] as const).map(d => (
                  <button key={d} onClick={() => setDay(d)} className={compactOptBtn(day === d)}>
                    {d === 'Saturday' ? 'Sat' : d === 'Sunday' ? 'Sun' : 'Weekday'}
                  </button>
                ))}
              </div>
            </div>
            {/* Time */}
            <div>
              <p className="text-[8px] font-black text-[var(--text-dim)] uppercase tracking-widest mb-1.5">Time</p>
              <div className="flex flex-wrap gap-1">
                {PERIODS.map(p => (
                  <button key={p} onClick={() => setPeriod(period === p ? 'all' : p)} className={compactOptBtn(period === p)}>
                    {PERIOD_LABELS[p]}
                  </button>
                ))}
              </div>
            </div>
            {/* Mode */}
            <div>
              <p className="text-[8px] font-black text-[var(--text-dim)] uppercase tracking-widest mb-1.5">Mode</p>
              <div className="flex flex-wrap gap-1">
                {MODES.map(m => (
                  <button key={m.id} onClick={() => toggleMode(m.id)} className={compactOptBtn(selectedModes.has(m.id))}>
                    {m.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Frequency */}
      <div className="relative hidden lg:block">
        <button onClick={() => toggle('frequency')} className={chipClass(maxHeadway !== Infinity)}>
          Frequency
          <Dot show={maxHeadway !== Infinity} />
        </button>
        {openChip === 'frequency' && (
          <div className={`${PANEL} w-36`}>
            {HEADWAY_TIERS.map(({ max, label }) => {
              const isSelected = maxHeadway === max;
              const color = isFinite(max) ? getTierColor(String(max)) : 'var(--text-dim)';
              return (
                <button
                  key={label}
                  onClick={() => { setMaxHeadway(max); setOpenChip(null); }}
                  className={rowBtn(isSelected)}
                  aria-label={max === Infinity ? 'Show all routes' : `Every ${max} min or better`}
                >
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ background: color }} />
                  {label === 'Infrequent' ? 'All' : label}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Day */}
      <div className="relative hidden lg:block">
        <button onClick={() => toggle('day')} className={chipClass(day !== 'Weekday')}>
          Day
          <Dot show={day !== 'Weekday'} />
        </button>
        {openChip === 'day' && (
          <div className={`${PANEL} w-36`}>
            {(['Weekday', 'Saturday', 'Sunday'] as const).map((d) => (
              <button
                key={d}
                onClick={() => { setDay(d); setOpenChip(null); }}
                className={rowBtn(day === d)}
              >
                {d}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Period */}
      <div className="relative hidden lg:block">
        <button onClick={() => toggle('period')} className={chipClass(period !== 'all')}>
          Time
          <Dot show={period !== 'all'} />
        </button>
        {openChip === 'period' && (
          <div className={`${PANEL} w-36`}>
            {PERIODS.map((p) => (
              <button
                key={p}
                onClick={() => { setPeriod(period === p ? 'all' : p); setOpenChip(null); }}
                className={`${rowBtn(period === p)} flex items-center justify-between gap-3`}
              >
                <span>{PERIOD_LABELS[p]}</span>
                <span className="text-[9px] text-[var(--text-dim)] shrink-0">{periodRange(p)}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Mode */}
      <div className="relative hidden lg:block">
        <button onClick={() => toggle('mode')} className={chipClass(selectedModes.size > 0)}>
          Mode
          <Dot show={selectedModes.size > 0} />
        </button>
        {openChip === 'mode' && (
          <div className={`${PANEL} w-36`}>
            {MODES.map((m) => (
              <button
                key={m.id}
                onClick={() => toggleMode(m.id)}
                className={rowBtn(selectedModes.has(m.id))}
              >
                {m.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Agencies */}
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
            layers={layers}
            agencyQuery={agencyQuery}
            setAgencyQuery={setAgencyQuery}
            agencySearchRef={agencySearchRef}
          />
        )}
      </div>

    </div>
  );
};
