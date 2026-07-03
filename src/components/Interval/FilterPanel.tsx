import React, { useState, useEffect } from 'react';
import { Settings, X, Radio, Sun, Moon, Zap, Info } from 'lucide-react';
import { ICON_BTN, DROPDOWN_PANEL, dropdownAnim, TRANSITION_BASE, Z_MODAL_TOP } from '../../styles';

interface FilterPanelProps {
  lightMode: boolean;
  setLightMode: (v: boolean | ((prev: boolean) => boolean)) => void;
  hideSpan: boolean;
  setHideSpan: (v: boolean | ((prev: boolean) => boolean)) => void;
  livePollingOnly: boolean;
  setLivePollingOnly: (v: boolean | ((prev: boolean) => boolean)) => void;
  showCorridors: boolean;
  setShowCorridors: (v: boolean | ((prev: boolean) => boolean)) => void;
  onInfoOpen?: (tab?: 'about' | 'agencies' | 'live') => void;
  inFrequency?: boolean;
}

function Toggle({ on }: { on: boolean }) {
  return (
    <span
      className={`relative inline-flex h-5 w-9 shrink-0 rounded-full transition-colors ${TRANSITION_BASE} ${
        on ? 'bg-[var(--accent)]' : 'bg-[var(--border-primary)]'
      }`}
    >
      <span
        className={`absolute top-1 h-3 w-3 rounded-full bg-white shadow-sm transition-transform ${TRANSITION_BASE} ${
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
  inFrequency = true,
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
      <button
        onClick={() => setOpen(v => !v)}
        className={`relative ${ICON_BTN}`}
        aria-label="Settings"
      >
        <Settings className="w-4 h-4" />
        {hasActiveFilters && (
          <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-[var(--accent)] border border-[var(--bg-panel)]" />
        )}
      </button>

      {open && (
        <div
          className={`fixed inset-0 ${Z_MODAL_TOP}`}
          onClick={close}
        >
          <div
            className={`${DROPDOWN_PANEL} ${dropdownAnim(visible)}`}
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-2 border-b border-[var(--border-primary)] shrink-0">
              <h2 className="text-xs font-black text-[var(--text-primary)]">Settings</h2>
              <button
                onClick={close}
                className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-[var(--bg-btn-hover)] text-[var(--text-dim)] transition-colors"
                aria-label="Close settings"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="overflow-y-auto px-5 py-2 flex flex-col divide-y divide-[var(--border-primary)]">
              {/* Theme toggle */}
              <div className="flex items-center justify-between py-4 first:pt-3">
                <div className="flex items-start gap-3 min-w-0">
                  {lightMode ? <Moon className="w-4 h-4 mt-0.5 shrink-0 text-[var(--text-dim)]" /> : <Sun className="w-4 h-4 mt-0.5 shrink-0 text-[var(--text-dim)]" />}
                  <p className="text-[11px] font-bold text-[var(--text-primary)] leading-tight">
                    {lightMode ? 'Dark mode' : 'Light mode'}
                  </p>
                </div>
                <button
                  onClick={() => setLightMode(v => !v)}
                  aria-label="Toggle light/dark mode"
                  className="mt-0.5 shrink-0"
                >
                  <Toggle on={!lightMode} />
                </button>
              </div>

              {!inFrequency && (
                <p className="text-[10px] text-[var(--text-muted)] pt-3 pb-1">These settings apply to the Frequency map.</p>
              )}
              {SETTINGS.map(({ id, icon: Icon, label, description }) => (
                <div key={id} className={`flex items-start justify-between gap-4 py-4 first:pt-3 last:pb-3 transition-opacity ${TRANSITION_BASE} ${inFrequency ? 'opacity-100' : 'opacity-40'}`}>
                  <div className="flex items-start gap-3 min-w-0">
                    <Icon className="w-4 h-4 mt-0.5 shrink-0 text-[var(--text-dim)]" />
                    <div className="min-w-0">
                      <p className="text-[11px] font-bold text-[var(--text-primary)] leading-tight">{label}</p>
                      <p className="text-[10px] text-[var(--text-muted)] mt-1 leading-relaxed">{description}</p>
                      {id === 'live' && onInfoOpen && (
                        <button
                          onClick={() => { onInfoOpen('live'); close(); }}
                          className="mt-1 text-[10px] text-[var(--accent)] hover:underline"
                        >
                          See which routes →
                        </button>
                      )}
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

              {/* About link */}
              {onInfoOpen && (
                <div className="py-4 last:pb-3">
                  <button
                    onClick={() => { onInfoOpen(); close(); }}
                    className="flex items-center gap-2 text-[11px] font-bold text-[var(--accent)] hover:underline"
                  >
                    <Info className="w-3.5 h-3.5 shrink-0" />
                    About Atlas
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
};
