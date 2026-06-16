import React, { useState, useRef, useEffect } from 'react';
import { Settings, X, Radio, Sun, Moon } from 'lucide-react';

interface FilterPanelProps {
  lightMode: boolean;
  setLightMode: (v: boolean | ((prev: boolean) => boolean)) => void;
  hideSpan: boolean;
  setHideSpan: (v: boolean | ((prev: boolean) => boolean)) => void;
  livePollingOnly: boolean;
  setLivePollingOnly: (v: boolean | ((prev: boolean) => boolean)) => void;
}

export const FilterPanel: React.FC<FilterPanelProps> = ({
  lightMode,
  setLightMode,
  hideSpan,
  setHideSpan,
  livePollingOnly,
  setLivePollingOnly,
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

  const hasActiveFilters = hideSpan || livePollingOnly;

  return (
    <div ref={panelRef} className="relative flex items-center gap-2">
      <button
        onClick={() => setIsOpen((v) => !v)}
        className="relative w-8 h-8 flex items-center justify-center bg-[var(--bg-panel)] backdrop-blur-md border border-[var(--border-primary)] rounded-full shadow-lg hover:text-indigo-400 text-[var(--text-primary)] transition-colors"
        aria-label="Settings"
      >
        <Settings className="w-4 h-4" />
        {hasActiveFilters && (
          <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-indigo-500 border border-[var(--bg-panel)]" />
        )}
      </button>
      <button
        onClick={() => setLightMode((v) => !v)}
        className="w-8 h-8 flex items-center justify-center bg-[var(--bg-panel)] backdrop-blur-md border border-[var(--border-primary)] rounded-full shadow-lg text-[var(--text-primary)] hover:text-indigo-400 transition-colors"
        aria-label="Toggle light mode"
      >
        {lightMode ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
      </button>

      {isOpen && (
        <div className="absolute top-10 right-0 w-64 max-h-[calc(100vh-120px)] overflow-y-auto custom-scrollbar bg-[var(--bg-panel)] backdrop-blur-md border border-[var(--border-primary)] p-5 rounded-2xl shadow-2xl animate-in fade-in slide-in-from-top-1 duration-200 space-y-5">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-black tracking-wide text-[var(--text-dim)]">Settings</h3>
            <button onClick={() => setIsOpen(false)} className="text-[var(--text-dim)] hover:text-[var(--text-primary)]">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Live polling */}
          <button
            onClick={() => setLivePollingOnly((v) => !v)}
            className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-md text-[10px] font-bold transition-all border ${
              livePollingOnly
                ? 'bg-indigo-600/20 border-indigo-500/50 text-indigo-400'
                : 'bg-[var(--bg-btn)] border-[var(--border-primary)] text-[var(--text-dim)] hover:text-[var(--text-primary)]'
            }`}
            title="Show only routes with live GTFS-RT schedule-adherence polling"
          >
            <span className="flex items-center gap-1.5">
              <Radio className="w-3 h-3" />
              Live polling only
            </span>
            {livePollingOnly && <X className="w-2.5 h-2.5 shrink-0" />}
          </button>

          {/* Irregular service */}
          <button
            onClick={() => setHideSpan((v) => !v)}
            className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-md text-[10px] font-bold transition-all border ${
              hideSpan
                ? 'bg-indigo-600/20 border-indigo-500/50 text-indigo-400'
                : 'bg-[var(--bg-btn)] border-[var(--border-primary)] text-[var(--text-dim)] hover:text-[var(--text-primary)]'
            }`}
            title="Hide routes with no sustained frequency tier (peak-only, school runs, shuttles)"
          >
            <span>Hide irregular / peak-only routes</span>
            {hideSpan && <X className="w-2.5 h-2.5 shrink-0" />}
          </button>
        </div>
      )}
    </div>
  );
};
