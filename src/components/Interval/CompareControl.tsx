import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown, Columns2, X } from 'lucide-react';
import { CHIP_BASE, FLOATING_CARD, PANEL_ENTER_TOP } from '../../styles';
import { DAY_TYPES, type DayType } from '../../../shared/dayTypes';
import { PERIOD_KEYS, PERIOD_LABELS, type TimePeriod } from '../../hooks/useIntervalStats';
import { describeDayAndPeriod } from '../../utils/mapExportDetails';

/** One side of compare mode: the shared filter applied to this day and time. */
export interface CompareSide {
  day: DayType;
  period: TimePeriod;
}

/** A sensible second side when compare starts: same time, a different day. */
export function defaultCompareSide(a: CompareSide): CompareSide {
  return { day: a.day === 'Saturday' ? 'Sunday' : 'Saturday', period: a.period };
}

/** "Saturday midday", "Weekday AM peak", "Sunday, all day" — capitalised for a heading. */
export function compareSideLabel(side: CompareSide): string {
  return describeDayAndPeriod(side.day, side.period);
}

export function SideBadge({ side }: { side: 'A' | 'B' }) {
  return (
    <span className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-[var(--text-primary)] text-[9px] font-black text-[var(--bg-panel)]" aria-hidden="true">
      {side}
    </span>
  );
}

const chip = (active: boolean) =>
  `relative h-8 px-3.5 flex items-center justify-center gap-1.5 ${CHIP_BASE} text-xs font-bold transition-colors whitespace-nowrap ${
    active
      ? 'border-[var(--accent-border)] text-[var(--accent)]'
      : 'border-[var(--border-primary)] text-[var(--text-primary)] hover:text-[var(--accent)]'
  }`;

const option = (active: boolean) =>
  `h-7 px-2.5 flex items-center justify-center text-[11px] font-bold rounded-full border transition-colors ${
    active
      ? 'bg-[var(--accent-bg)] border-[var(--accent-border)] text-[var(--accent)]'
      : 'bg-[var(--control-inactive-bg)] border-[var(--control-inactive-border)] text-[var(--control-inactive-fg)] hover:bg-[var(--control-hover-bg)]'
  }`;

/** Day and time buttons for side B. */
export function CompareSidePicker({ side, onChange }: { side: CompareSide; onChange: (side: CompareSide) => void }) {
  return (
    <div className="flex flex-col gap-3">
      <div>
        <p className="mb-1.5 text-[10px] font-black text-[var(--text-dim)]">Day</p>
        <div className="flex gap-1">
          {DAY_TYPES.map(day => (
            <button key={day} type="button" onClick={() => onChange({ ...side, day })} className={option(side.day === day)} aria-pressed={side.day === day}>
              {day}
            </button>
          ))}
        </div>
      </div>
      <div>
        <p className="mb-1.5 text-[10px] font-black text-[var(--text-dim)]">Time</p>
        <div className="flex flex-wrap gap-1">
          {(['all', ...PERIOD_KEYS] as TimePeriod[]).map(period => (
            <button key={period} type="button" onClick={() => onChange({ ...side, period })} className={option(side.period === period)} aria-pressed={side.period === period}>
              {PERIOD_LABELS[period]}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

interface CompareControlProps {
  /** Side B while comparing; null when compare is off. */
  compareSide: CompareSide | null;
  onStart: () => void;
  onExit: () => void;
  onChange: (side: CompareSide) => void;
}

/**
 * Header control next to the filter chips. Off: a "Compare" chip. On: side B's day and time
 * (the filter chips keep controlling side A and the shared filter) and a button to stop comparing.
 */
export function CompareControl({ compareSide, onStart, onExit, onChange }: CompareControlProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  if (!compareSide) {
    return (
      <button type="button" onClick={onStart} className={chip(false)}>
        <Columns2 className="h-3.5 w-3.5" aria-hidden="true" />
        Compare
      </button>
    );
  }

  return (
    <div ref={ref} className="relative flex items-center gap-2">
      <span className="text-xs font-bold text-[var(--text-dim)]">vs</span>
      <button type="button" onClick={() => setOpen(value => !value)} aria-expanded={open} className={chip(open)}>
        <SideBadge side="B" />
        {compareSideLabel(compareSide)}
        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
      </button>
      <button type="button" onClick={onExit} aria-label="Stop comparing" className={`${chip(false)} !px-2.5`}>
        <X className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
      {open && (
        <div className={`absolute top-10 right-0 ${FLOATING_CARD} ${PANEL_ENTER_TOP} w-72 p-3`}>
          <CompareSidePicker side={compareSide} onChange={onChange} />
        </div>
      )}
    </div>
  );
}
