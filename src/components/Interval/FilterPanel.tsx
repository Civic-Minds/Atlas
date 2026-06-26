import React, { useState, useRef, useEffect } from 'react';
import { Settings, X, Radio, Sun, Moon, Zap, Info } from 'lucide-react';

interface FilterPanelProps {
  lightMode: boolean;
  setLightMode: (v: boolean | ((prev: boolean) => boolean)) => void;
  hideSpan: boolean;
  setHideSpan: (v: boolean | ((prev: boolean) => boolean)) => void;
  livePollingOnly: boolean;
  setLivePollingOnly: (v: boolean | ((prev: boolean) => boolean)) => void;
  showCorridors: boolean;
  setShowCorridors: (v: boolean | ((prev: boolean) => boolean)) => void;
  onInfoOpen?: () => void;
}

function Toggle({ on }: { on: boolean }) {
  return (
    <span
      className={`relative inline-flex h-4 w-7 shrink-0 rounded-full transition-colors duration-200 ${
        on ? 'bg-[var(--accent)]' : 'bg-[var(--border-primary)]'
      }`}
    >
      <span
        className={`absolute top-0.5 h-3 w-3 rounded-full bg-white shadow-sm transition-transform duration-200 ${
          on ? 'translate-x-3.5' : 'translate-x-0.5'
        }`}
      />
    </span>
  );
}

export const FilterPanel: React.FC<FilterPanelProps> = ({
  lightMode,
  setLightMode,
  hideSpan,
  setHideSpan,
  livePollingOnly,
  setLivePollingOnly,
  showCorridors,
  setShowCorridors,
  onInfoOpen,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const onClick = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setIsOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [isOpen]);

  const hasActiveFilters = hideSpan || livePollingOnly || showCorridors;

  const row = (
    label: string,
    icon: React.ReactNode,
    value: boolean,
    toggle: () => void,
    ariaLabel: string,
  ) => (
    <button
      onClick={toggle}
      aria-label={ariaLabel}
      className="w-full flex items-center justify-between gap-3 py-1.5 text-[11px] font-bold text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
    >
      <span className="flex items-center gap-2">
        {icon}
        {label}
      </span>
      <Toggle on={value} />
    </button>
  );

  return (
    <div ref={panelRef} className="relative flex items-center gap-2">
      <button
        onClick={() => setLightMode((v) => !v)}
        className="w-8 h-8 flex items-center justify-center bg-[var(--bg-panel)] backdrop-blur-md border border-[var(--border-primary)] rounded-full shadow-lg text-[var(--text-primary)] hover:text-[var(--accent)] transition-colors"
        aria-label="Toggle light mode"
      >
        {lightMode ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
      </button>
      <button
        onClick={() => setIsOpen((v) => !v)}
        className="relative w-8 h-8 flex items-center justify-center bg-[var(--bg-panel)] backdrop-blur-md border border-[var(--border-primary)] rounded-full shadow-lg hover:text-[var(--accent)] text-[var(--text-primary)] transition-colors"
        aria-label="Settings"
      >
        <Settings className="w-4 h-4" />
        {hasActiveFilters && (
          <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-[var(--accent)] border border-[var(--bg-panel)]" />
        )}
      </button>
      {onInfoOpen && (
        <button
          onClick={onInfoOpen}
          className="w-8 h-8 flex items-center justify-center bg-[var(--bg-panel)] backdrop-blur-md border border-[var(--border-primary)] rounded-full shadow-lg hover:text-[var(--accent)] text-[var(--text-primary)] transition-colors"
          aria-label="About Atlas"
        >
          <Info className="w-4 h-4" />
        </button>
      )}

      {isOpen && (
        <div className="absolute top-10 right-0 w-56 bg-[var(--bg-panel)] backdrop-blur-md border border-[var(--border-primary)] px-4 py-3.5 rounded-2xl shadow-2xl animate-in fade-in zoom-in-95 slide-in-from-top-1 origin-top-right duration-150 ease-out">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-[10px] font-black tracking-wide text-[var(--text-dim)]">Settings</h3>
            <button onClick={() => setIsOpen(false)} className="text-[var(--text-dim)] hover:text-[var(--text-primary)] transition-colors" aria-label="Close settings">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="divide-y divide-[var(--border-primary)]">
            {row('Combined corridors', <Zap className="w-3 h-3 shrink-0" />, showCorridors, () => setShowCorridors(v => !v), 'Show shared segments where overlapping routes provide higher combined frequency')}
            {row('Live polling only', <Radio className="w-3 h-3 shrink-0" />, livePollingOnly, () => setLivePollingOnly(v => !v), 'Show only routes with live GTFS-RT schedule-adherence polling')}
            {row('Hide irregular routes', <span className="w-3 h-3 shrink-0 flex items-center justify-center text-[9px] font-black leading-none">≠</span>, hideSpan, () => setHideSpan(v => !v), 'Hide routes with no sustained frequency tier (peak-only, school runs, shuttles)')}
          </div>
        </div>
      )}
    </div>
  );
};
