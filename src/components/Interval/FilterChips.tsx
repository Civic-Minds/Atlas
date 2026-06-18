import React, { useState, useRef, useEffect } from 'react';
import { Search } from 'lucide-react';
import { HEADWAY_TIERS, getTierColor } from '../../utils/colors';
import type { Agency } from '../../App';
import type { AgencyLayers } from '../../hooks/useAgencyData';
import { VIRTUAL_LRT_MODE, PERIOD_LABELS } from '../../hooks/useIntervalStats';
import type { TimePeriod } from '../../hooks/useIntervalStats';

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

// Tier value → tier key used by getTierColor
const TIER_FOR_MAX: Record<number, string> = {
  10: '10', 15: '15', 20: '20', 30: '30', 60: '60',
};

const PERIODS: TimePeriod[] = ['all', 'amPeak', 'midday', 'pmPeak', 'evening'];

type ChipId = 'frequency' | 'day' | 'period' | 'mode' | 'agencies';

const PANEL = 'absolute top-10 right-0 bg-[var(--bg-panel)] backdrop-blur-md border border-[var(--border-primary)] p-2 rounded-2xl shadow-2xl animate-in fade-in zoom-in-95 slide-in-from-top-1 origin-top-right duration-150 ease-out flex flex-col gap-1';

const rowBtn = (active: boolean) =>
  `w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md text-[11px] font-bold transition-all border text-left whitespace-nowrap ${
    active
      ? 'bg-[var(--accent-bg)] border-[var(--accent-border)] text-[var(--accent)]'
      : 'bg-[var(--bg-btn)] border-[var(--border-primary)] text-[var(--text-dim)] hover:text-[var(--text-primary)]'
  }`;

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
    `relative h-8 px-3.5 flex items-center justify-center bg-[var(--bg-panel)] backdrop-blur-md border rounded-full shadow-lg text-xs font-bold transition-colors whitespace-nowrap ${
      active
        ? 'border-[var(--accent-border)] text-[var(--accent)]'
        : 'border-[var(--border-primary)] text-[var(--text-primary)] hover:text-[var(--accent)]'
    }`;

  const Dot = ({ show }: { show: boolean }) =>
    show ? <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-[var(--accent)] border border-[var(--bg-panel)]" /> : null;

  const toggle = (id: ChipId) => setOpenChip(c => c === id ? null : id);

  return (
    <div ref={rowRef} className="flex items-center gap-2">

      {/* Frequency */}
      <div className="relative">
        <button onClick={() => toggle('frequency')} className={chipClass(true)}>
          {maxHeadway === Infinity ? 'Frequency' : (HEADWAY_TIERS.find(t => t.max === maxHeadway)?.label ?? 'Frequency')}
          <Dot show={true} />
        </button>
        {openChip === 'frequency' && (
          <div className={`${PANEL} w-36`}>
            {HEADWAY_TIERS.map(({ max, label }) => {
              const isSelected = maxHeadway === max;
              const tierKey = TIER_FOR_MAX[max];
              const color = tierKey ? getTierColor(tierKey) : 'var(--text-dim)';
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
      <div className="relative">
        <button onClick={() => toggle('day')} className={chipClass(true)}>
          {day}
          <Dot show={true} />
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
      <div className="relative">
        <button onClick={() => toggle('period')} className={chipClass(period !== 'all')}>
          {PERIOD_LABELS[period]}
          <Dot show={period !== 'all'} />
        </button>
        {openChip === 'period' && (
          <div className={`${PANEL} w-36`}>
            {PERIODS.map((p) => (
              <button
                key={p}
                onClick={() => { setPeriod(p); setOpenChip(null); }}
                className={rowBtn(period === p)}
              >
                {PERIOD_LABELS[p]}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Mode */}
      <div className="relative">
        {(() => {
          const modeLabel = selectedModes.size === 0
            ? 'Mode'
            : selectedModes.size === 1
              ? (MODES.find(m => selectedModes.has(m.id))?.label ?? 'Mode')
              : `${selectedModes.size} modes`;
          return (
            <button onClick={() => toggle('mode')} className={chipClass(selectedModes.size > 0)}>
              {modeLabel}
              <Dot show={selectedModes.size > 0} />
            </button>
          );
        })()}
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
          const hiddenCount = agencies.length - selectedAgencies.size;
          const label = allOn
            ? 'Agencies'
            : hiddenCount === agencies.length - 1
              ? (agencies.find(a => selectedAgencies.has(a.slug))?.name ?? '1 agency')
              : `${selectedAgencies.size} agencies`;
          return (
            <button onClick={() => toggle('agencies')} className={chipClass(!allOn)}>
              {label}
              <Dot show={!allOn} />
            </button>
          );
        })()}
        {openChip === 'agencies' && (
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
            <div className="max-h-52 overflow-y-auto custom-scrollbar flex flex-col gap-1">
              {(() => {
                // Group agencies by display name (e.g. NFTA bus + rail → one chip)
                const groups: { name: string; slugs: string[] }[] = [];
                for (const a of agencies) {
                  const g = groups.find(x => x.name === a.name);
                  if (g) g.slugs.push(a.slug);
                  else groups.push({ name: a.name, slugs: [a.slug] });
                }
                return groups
                  .filter(g => g.name.toLowerCase().includes(agencyQuery.toLowerCase()))
                  .map(g => {
                    const active = g.slugs.every(s => selectedAgencies.has(s));
                    const loaded = g.slugs.some(s => s in layers);
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
                        {g.name}
                        {active && !loaded && (
                          <span className="ml-auto w-2 h-2 rounded-full border border-current opacity-40 shrink-0" />
                        )}
                      </button>
                    );
                  });
              })()}
            </div>
          </div>
        )}
      </div>

    </div>
  );
};
