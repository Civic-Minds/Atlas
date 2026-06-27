import React, { useState, useEffect } from 'react';
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
      className={`relative inline-flex h-5 w-9 shrink-0 rounded-full transition-colors duration-200 ${
        on ? 'bg-[var(--accent)]' : 'bg-[var(--border-primary)]'
      }`}
    >
      <span
        className={`absolute top-1 h-3 w-3 rounded-full bg-white shadow-sm transition-transform duration-200 ${
          on ? 'translate-x-5' : 'translate-x-1'
        }`}
      />
    </span>
  );
}

const SETTINGS = [
  {
    id: 'corridors',
    icon: Zap,
    label: 'Combined corridors',
    description: 'Highlights segments where multiple routes overlap, showing the combined frequency instead of each route separately. Useful for identifying corridors with de-facto rapid transit.',
  },
  {
    id: 'live',
    icon: Radio,
    label: 'Live tracking only',
    description: 'Show only routes covered by Atlas\'s real-time schedule adherence monitoring. Currently limited to a small set of agencies.',
  },
  {
    id: 'span',
    icon: () => <span className="w-4 h-4 flex items-center justify-center text-[10px] font-black leading-none shrink-0">≠</span>,
    label: 'Hide irregular routes',
    description: 'Hides peak-only routes, school buses, and demand-responsive shuttles — anything that doesn\'t run a consistent all-day schedule. Useful for focusing on everyday service.',
  },
] as const;

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
  const [open, setOpen] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (open) {
      const id = requestAnimationFrame(() => setVisible(true));
      return () => cancelAnimationFrame(id);
    } else {
      setVisible(false);
    }
  }, [open]);

  const close = () => setOpen(false);

  const hasActiveFilters = hideSpan || livePollingOnly || showCorridors;

  const values: Record<string, boolean> = {
    corridors: showCorridors,
    live: livePollingOnly,
    span: hideSpan,
  };

  const toggles: Record<string, () => void> = {
    corridors: () => setShowCorridors(v => !v),
    live: () => setLivePollingOnly(v => !v),
    span: () => setHideSpan(v => !v),
  };

  return (
    <>
      <div className="flex items-center gap-2">
        <button
          onClick={() => setLightMode((v) => !v)}
          className="w-8 h-8 flex items-center justify-center bg-[var(--bg-panel)] backdrop-blur-md border border-[var(--border-primary)] rounded-full shadow-lg text-[var(--text-primary)] hover:text-[var(--accent)] transition-colors"
          aria-label="Toggle light mode"
        >
          {lightMode ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
        </button>
        <button
          onClick={() => setOpen(v => !v)}
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
      </div>

      {open && (
        <div
          className="fixed inset-0 z-[1500]"
          onClick={close}
        >
          <div
            className={`absolute top-0 right-0 h-full w-72 bg-[var(--bg-panel)] border-l border-[var(--border-primary)] shadow-2xl backdrop-blur-md flex flex-col transition-transform duration-300 ease-out ${visible ? 'translate-x-0' : 'translate-x-full'}`}
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-6 py-5 border-b border-[var(--border-primary)] shrink-0">
              <h2 className="text-xs font-black text-[var(--text-primary)] uppercase tracking-wide">Settings</h2>
              <button
                onClick={close}
                className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-[var(--bg-btn-hover)] text-[var(--text-dim)] transition-colors"
                aria-label="Close settings"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-5 flex flex-col divide-y divide-[var(--border-primary)]">
              {SETTINGS.map(({ id, icon: Icon, label, description }) => (
                <div key={id} className="flex items-start justify-between gap-4 py-4 first:pt-0 last:pb-0">
                  <div className="flex items-start gap-3 min-w-0">
                    <Icon className="w-4 h-4 mt-0.5 shrink-0 text-[var(--text-dim)]" />
                    <div className="min-w-0">
                      <p className="text-[11px] font-bold text-[var(--text-primary)] leading-tight">{label}</p>
                      <p className="text-[10px] text-[var(--text-muted)] mt-1 leading-relaxed">{description}</p>
                    </div>
                  </div>
                  <button
                    onClick={toggles[id]}
                    aria-label={label}
                    className="mt-0.5 shrink-0"
                  >
                    <Toggle on={values[id]} />
                  </button>
                </div>
              ))}
            </div>

            <div className="shrink-0 px-6 py-4 border-t border-[var(--border-primary)]">
              <button
                onClick={() => { close(); onInfoOpen?.(); }}
                className="w-full flex items-center justify-between px-3 py-2 rounded-xl bg-[var(--bg-app)] border border-[var(--border-primary)] hover:border-[var(--accent)] transition-colors group"
              >
                <span className="text-xs font-bold text-[var(--text-primary)] group-hover:text-[var(--accent)] transition-colors">About Atlas</span>
                <Info className="w-3.5 h-3.5 text-[var(--text-dim)] group-hover:text-[var(--accent)] transition-colors" />
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
