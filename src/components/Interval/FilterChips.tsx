import React, { useState, useRef, useEffect } from 'react';
import { HEADWAY_TIERS } from '../../utils/colors';
import type { Agency } from '../../App';

interface FilterChipsProps {
  maxHeadway: number;
  setMaxHeadway: (h: number) => void;
  selectedModes: Set<number>;
  setSelectedModes: React.Dispatch<React.SetStateAction<Set<number>>>;
  day: 'Weekday' | 'Saturday' | 'Sunday';
  setDay: (d: 'Weekday' | 'Saturday' | 'Sunday') => void;
  agencies: Agency[];
  selectedAgencies: Set<string>;
  setSelectedAgencies: React.Dispatch<React.SetStateAction<Set<string>>>;
}

const MODES = [
  { id: 1, label: 'Subway' },
  { id: 0, label: 'Streetcar' },
  { id: 2, label: 'Rail' },
  { id: 3, label: 'Bus' },
];

type ChipId = 'frequency' | 'day' | 'mode' | 'agencies';

export const FilterChips: React.FC<FilterChipsProps> = ({
  maxHeadway,
  setMaxHeadway,
  selectedModes,
  setSelectedModes,
  day,
  setDay,
  agencies,
  selectedAgencies,
  setSelectedAgencies,
}) => {
  const [openChip, setOpenChip] = useState<ChipId | null>(null);
  const rowRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!openChip) return;
    const onClick = (e: MouseEvent) => {
      if (rowRef.current && !rowRef.current.contains(e.target as Node)) setOpenChip(null);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [openChip]);

  const toggleMode = (modeId: number) => {
    const next = new Set(selectedModes);
    if (next.has(modeId)) next.delete(modeId);
    else next.add(modeId);
    setSelectedModes(next);
  };

  const toggleAgency = (slug: string) => {
    const next = new Set(selectedAgencies);
    if (next.has(slug)) next.delete(slug);
    else next.add(slug);
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

  return (
    <div ref={rowRef} className="flex items-center gap-2">
      <div className="relative">
        <button onClick={() => setOpenChip((c) => (c === 'frequency' ? null : 'frequency'))} className={chipClass(true)}>
          Frequency
          <Dot show={true} />
        </button>
        {openChip === 'frequency' && (
          <div className="absolute top-10 right-0 bg-[var(--bg-panel)] backdrop-blur-md border border-[var(--border-primary)] p-2 rounded-2xl shadow-2xl animate-in fade-in slide-in-from-top-1 duration-200 flex gap-1">
            {HEADWAY_TIERS.map(({ max, label }) => {
              const isSelected = maxHeadway === max;
              return (
                <button
                  key={label}
                  onClick={() => {
                    setMaxHeadway(max);
                    setOpenChip(null);
                  }}
                  className={`px-3 py-1.5 rounded-md text-[11px] font-bold transition-all border whitespace-nowrap ${
                    isSelected
                      ? 'bg-[var(--accent-bg)] border-[var(--accent-border)] text-[var(--text-primary)]'
                      : 'bg-[var(--bg-btn)] border-[var(--border-primary)] text-[var(--text-legend)] hover:text-[var(--text-primary)]'
                  }`}
                  title={max === Infinity ? 'Show all routes' : `Show routes running every ${max} min or better`}
                >
                  {label === 'Infrequent' ? 'All' : label}
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="relative">
        <button onClick={() => setOpenChip((c) => (c === 'day' ? null : 'day'))} className={chipClass(true)}>
          Day
          <Dot show={true} />
        </button>
        {openChip === 'day' && (
          <div className="absolute top-10 right-0 bg-[var(--bg-panel)] backdrop-blur-md border border-[var(--border-primary)] p-2 rounded-2xl shadow-2xl animate-in fade-in slide-in-from-top-1 duration-200 flex gap-1">
            {(['Weekday', 'Saturday', 'Sunday'] as const).map((d) => (
              <button
                key={d}
                onClick={() => {
                  setDay(d);
                  setOpenChip(null);
                }}
                className={`px-3 py-1.5 rounded-md text-[11px] font-bold transition-all border whitespace-nowrap ${
                  day === d
                    ? 'bg-[var(--accent-bg)] border-[var(--accent-border)] text-[var(--accent)]'
                    : 'bg-[var(--bg-btn)] border-[var(--border-primary)] text-[var(--text-dim)] hover:text-[var(--text-primary)]'
                }`}
              >
                {d}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="relative">
        <button onClick={() => setOpenChip((c) => (c === 'mode' ? null : 'mode'))} className={chipClass(selectedModes.size > 0)}>
          Mode
          <Dot show={selectedModes.size > 0} />
        </button>
        {openChip === 'mode' && (
          <div className="absolute top-10 right-0 bg-[var(--bg-panel)] backdrop-blur-md border border-[var(--border-primary)] p-2 rounded-2xl shadow-2xl animate-in fade-in slide-in-from-top-1 duration-200 flex gap-1">
            {MODES.map((m) => {
              const isActive = selectedModes.has(m.id);
              return (
                <button
                  key={m.id}
                  onClick={() => toggleMode(m.id)}
                  className={`px-2.5 py-1.5 rounded-md text-[11px] font-bold transition-all border ${
                    isActive
                      ? 'bg-[var(--accent-bg)] border-[var(--accent-border)] text-[var(--accent)]'
                      : 'bg-[var(--bg-btn)] border-[var(--border-primary)] text-[var(--text-dim)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  {m.label}
                </button>
              );
            })}
          </div>
        )}
      </div>
      <div className="relative">
        <button onClick={() => setOpenChip((c) => (c === 'agencies' ? null : 'agencies'))} className={chipClass(selectedAgencies.size > 0)}>
          Agencies
          <Dot show={selectedAgencies.size > 0} />
        </button>
        {openChip === 'agencies' && (
          <div className="absolute top-10 right-0 w-56 max-h-[calc(100vh-160px)] overflow-y-auto custom-scrollbar bg-[var(--bg-panel)] backdrop-blur-md border border-[var(--border-primary)] p-2 rounded-2xl shadow-2xl animate-in fade-in slide-in-from-top-1 duration-200 flex flex-wrap gap-1">
            {agencies.map((a) => {
              const isActive = selectedAgencies.has(a.slug);
              return (
                <button
                  key={a.slug}
                  onClick={() => toggleAgency(a.slug)}
                  className={`px-2.5 py-1.5 rounded-md text-[11px] font-bold transition-all border whitespace-nowrap ${
                    isActive
                      ? 'bg-[var(--accent-bg)] border-[var(--accent-border)] text-[var(--accent)]'
                      : 'bg-[var(--bg-btn)] border-[var(--border-primary)] text-[var(--text-dim)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  {a.name}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
