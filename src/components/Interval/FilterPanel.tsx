import React, { useState, useEffect, useMemo } from 'react';
import { Settings, X, Radio, Sun, Moon, Zap, ArrowLeft, Search } from 'lucide-react';
import { ICON_BTN, DROPDOWN_PANEL, dropdownAnim, TRANSITION_BASE, Z_MODAL_TOP } from '../../styles';
import { HEADWAY_TIERS, getTierColor } from '../../utils/colors';
import { FILTER_MODES } from '../../../shared/modes';
import { DAY_TYPES } from '../../../shared/dayTypes';
import { PERIOD_LABELS } from '../../hooks/useIntervalStats';
import { R2_PUBLIC_URL } from '../../../shared/config';
import type { Agency } from '../../App';

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

  // New optional props for mobile filters
  maxHeadway?: number;
  setMaxHeadway?: (h: number) => void;
  selectedModes?: Set<number>;
  setSelectedModes?: (modes: Set<number>) => void;
  day?: string;
  setDay?: (d: any) => void;
  period?: string;
  setPeriod?: (p: any) => void;
  agencies?: Agency[];
  selectedAgencies?: Set<string>;
  setSelectedAgencies?: (agencies: Set<string>) => void;
  bounds?: any;
}

export interface HiddenRoute {
  key: string;
  agencySlug: string;
  agencyName: string;
  region?: string | null;
  routeShortName: string;
  routeLongName?: string | null;
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
    description: 'Highlights segments where multiple routes overlap and shows their combined service in one band.',
  },
  {
    id: 'live',
    icon: Radio,
    label: 'Live tracking only',
    description: 'Show only routes covered by Atlas\'s real-time schedule adherence monitoring. Currently limited to a small set of agencies.',
  },
  {
    id: 'span',
    icon: ({ className }: { className?: string }) => <span className={`w-4 h-4 flex items-center justify-center text-[10px] font-black leading-none shrink-0 ${className ?? ''}`}>≠</span>,
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
}) => {
  const [open, setOpen] = useState(false);
  const [visible, setVisible] = useState(false);
  const [view, setView] = useState<'settings' | 'hidden-routes'>('settings');
  const [hiddenRoutes, setHiddenRoutes] = useState<HiddenRoute[]>([]);
  const [hiddenRoutesLoading, setHiddenRoutesLoading] = useState(false);
  const [hiddenRoutesQuery, setHiddenRoutesQuery] = useState('');
  const [hiddenRegionFilter, setHiddenRegionFilter] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (open) {
      const id = requestAnimationFrame(() => setVisible(true));
      return () => cancelAnimationFrame(id);
    } else {
      setVisible(false);
    }
  }, [open]);

  useEffect(() => {
    if (view !== 'hidden-routes' || hiddenRoutes.length > 0) return;
    let cancelled = false;
    setHiddenRoutesLoading(true);
    fetch(`${R2_PUBLIC_URL}/atlas/hidden-routes.json`, { cache: 'no-store' })
      .then(response => response.ok ? response.json() : { routes: [] })
      .then(data => {
        if (!cancelled) setHiddenRoutes(Array.isArray(data?.routes) ? data.routes : []);
      })
      .catch(() => {
        if (!cancelled) setHiddenRoutes([]);
      })
      .finally(() => {
        if (!cancelled) setHiddenRoutesLoading(false);
      });
    return () => { cancelled = true; };
  }, [hiddenRoutes.length, view]);

  const close = () => {
    setOpen(false);
    setView('settings');
    setHiddenRoutesQuery('');
    setHiddenRegionFilter(new Set());
  };

  const filteredHiddenRoutes = useMemo(() => {
    const q = hiddenRoutesQuery.trim().toLowerCase();
    return hiddenRoutes.filter(route => [
      route.routeShortName,
      route.routeLongName ?? '',
      route.agencyName,
      route.region ?? '',
    ].some(value => value.toLowerCase().includes(q))
      && (hiddenRegionFilter.size === 0 || hiddenRegionFilter.has(route.region ?? 'Other')));
  }, [hiddenRoutes, hiddenRoutesQuery, hiddenRegionFilter]);

  const hiddenRouteRegions = useMemo(
    () => [...new Set(hiddenRoutes.map(route => route.region ?? 'Other'))].sort(),
    [hiddenRoutes],
  );

  useEffect(() => {
    if (hiddenRegionFilter.size === 0) return;
    const next = new Set([...hiddenRegionFilter].filter(region => hiddenRouteRegions.includes(region)));
    if (next.size !== hiddenRegionFilter.size) setHiddenRegionFilter(next);
  }, [hiddenRegionFilter, hiddenRouteRegions]);

  const hiddenRoutesByAgency = useMemo(() => {
    const grouped = new Map<string, { agencyName: string; routes: HiddenRoute[] }>();
    for (const route of filteredHiddenRoutes) {
      const group = grouped.get(route.agencySlug) ?? { agencyName: route.agencyName, routes: [] };
      group.routes.push(route);
      grouped.set(route.agencySlug, group);
    }
    return [...grouped.entries()]
      .sort(([, a], [, b]) => a.agencyName.localeCompare(b.agencyName))
      .map(([agencySlug, group]) => [
        agencySlug,
        {
          ...group,
          routes: group.routes.sort((a, b) =>
            a.routeShortName.localeCompare(b.routeShortName, undefined, { numeric: true })
            || (a.routeLongName ?? '').localeCompare(b.routeLongName ?? ''),
          ),
        },
      ] as const);
  }, [filteredHiddenRoutes]);

  const hasActiveCoreFilter = maxHeadway !== undefined && (maxHeadway !== Infinity || period !== 'all' || (selectedModes && selectedModes.size > 0));
  const hasActiveFilters = hideSpan || livePollingOnly || showCorridors || hasActiveCoreFilter;

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
              <div className="flex items-center gap-1.5">
                {view === 'hidden-routes' && (
                  <button
                    onClick={() => { setView('settings'); setHiddenRoutesQuery(''); }}
                    className="w-7 h-7 -ml-1 flex items-center justify-center rounded-full hover:bg-[var(--bg-btn-hover)] text-[var(--text-dim)] transition-colors"
                    aria-label="Back to settings"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                  </button>
                )}
                <h2 className="text-xs font-black text-[var(--text-primary)]">
                  {view === 'hidden-routes' ? 'Hidden routes' : 'Settings'}
                </h2>
              </div>
              <button
                onClick={close}
                className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-[var(--bg-btn-hover)] text-[var(--text-dim)] transition-colors"
                aria-label="Close settings"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="overflow-y-auto flex flex-col">
              {view === 'hidden-routes' ? (
                <>
                  <div className="px-5 pt-4 pb-3">
                    <label className="relative block">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--text-dim)]" />
                      <input
                        value={hiddenRoutesQuery}
                        onChange={event => setHiddenRoutesQuery(event.target.value)}
                        placeholder="Search hidden routes…"
                        className="w-full h-8 pl-9 pr-3 rounded-lg bg-[var(--bg-app)] border border-[var(--border-primary)] text-[11px] text-[var(--text-primary)] placeholder:text-[var(--text-dim)] outline-none focus:border-[var(--accent-border)]"
                        autoFocus
                      />
                    </label>
                    <div className="flex gap-1.5 overflow-x-auto items-center mt-2 [&::-webkit-scrollbar]:hidden" style={{ scrollbarWidth: 'none' }}>
                      {['All', ...hiddenRouteRegions].map(region => {
                        const key = region === 'All' ? '' : region;
                        const active = key === '' ? hiddenRegionFilter.size === 0 : hiddenRegionFilter.has(key);
                        return (
                          <button
                            key={region}
                            onClick={() => setHiddenRegionFilter(prev => {
                              if (key === '') return new Set();
                              const next = new Set(prev);
                              if (next.has(key)) next.delete(key);
                              else next.add(key);
                              return next;
                            })}
                            aria-pressed={active}
                            className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border transition-colors whitespace-nowrap shrink-0 ${
                              active
                                ? 'bg-[var(--bg-btn-hover)] text-[var(--text-primary)] border-[var(--text-primary)]'
                                : 'bg-[var(--bg-app)] text-[var(--text-muted)] border-[var(--border-primary)] hover:text-[var(--text-primary)] hover:border-[var(--text-dim)]'
                            }`}
                          >
                            {region}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  {hiddenRoutesLoading ? (
                    <p className="px-5 py-4 text-[10px] text-[var(--text-muted)]">Loading hidden routes…</p>
                  ) : filteredHiddenRoutes.length === 0 ? (
                    <p className="px-5 py-4 text-[10px] text-[var(--text-muted)]">
                      {hiddenRoutes.length === 0 ? 'The hidden-route list is unavailable right now.' : 'No hidden routes match your search.'}
                    </p>
                  ) : (
                    <div className="px-5 pb-4">
                      {hiddenRoutesByAgency.map(([agencySlug, group]) => (
                        <div key={agencySlug}>
                          <p className="pt-2 pb-1 text-[8px] font-black text-[var(--text-dim)] uppercase tracking-widest">{group.agencyName}</p>
                          <div className="divide-y divide-[var(--border-primary)]">
                            {group.routes.map(route => (
                              <div key={route.key} className="py-2.5">
                                <div className="flex items-baseline justify-between gap-3">
                                  <p className="text-[11px] font-bold text-[var(--text-primary)] truncate">{route.routeShortName}</p>
                                </div>
                                {route.routeLongName && route.routeLongName !== route.routeShortName && (
                                  <p className="text-[10px] text-[var(--text-secondary)] truncate mt-0.5">{route.routeLongName}</p>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <>
              {/* Appearance */}
              <div className="px-5 pt-4 pb-1">
                <p className="text-[9px] font-bold text-[var(--text-dim)]">Appearance</p>
              </div>
              <div className="px-5 pb-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3 min-w-0">
                    {lightMode ? <Moon className="w-4 h-4 shrink-0 text-[var(--text-dim)]" /> : <Sun className="w-4 h-4 shrink-0 text-[var(--text-dim)]" />}
                    <p className="text-[11px] font-bold text-[var(--text-primary)] leading-tight">
                      {lightMode ? 'Dark mode' : 'Light mode'}
                    </p>
                  </div>
                  <button
                    onClick={() => setLightMode(v => !v)}
                    aria-label="Toggle light/dark mode"
                    className="shrink-0"
                  >
                    <Toggle on={!lightMode} />
                  </button>
                </div>
              </div>

              {/* Filters */}
              <div className="border-t border-[var(--border-primary)] px-5 pt-4 pb-1">
                <p className="text-[9px] font-bold text-[var(--text-dim)]">Filters</p>
                {!inFrequency && (
                  <p className="text-[10px] text-[var(--text-muted)] mt-1">These settings apply to the Frequency map.</p>
                )}
              </div>
              <div className="px-5 pb-3 flex flex-col divide-y divide-[var(--border-primary)]">
                {SETTINGS.map(({ id, icon: Icon, label, description }) => (
                  <div key={id} className={`flex items-start justify-between gap-4 py-4 last:pb-2 transition-opacity ${TRANSITION_BASE} ${inFrequency ? 'opacity-100' : 'opacity-40'}`}>
                    <div className="flex items-start gap-3 min-w-0">
                      <Icon className="w-4 h-4 mt-0.5 shrink-0 text-[var(--text-dim)]" />
                      <div className="min-w-0">
                        <p className="text-[11px] font-bold text-[var(--text-primary)] leading-tight">{label}</p>
                        <p className="text-[10px] text-[var(--text-muted)] mt-1 leading-relaxed">{description}</p>
                        {id === 'span' && (
                          <>
                            <button
                              onClick={() => setView('hidden-routes')}
                              className="mt-1 text-[10px] text-[var(--accent)] hover:underline"
                            >
                              See all hidden routes{hiddenRoutes.length ? ` (${hiddenRoutes.length})` : ''} →
                            </button>
                          </>
                        )}
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
              </div>

              {/* Mobile-only Core Filters */}
              {maxHeadway !== undefined && (
                <div className="block sm:hidden border-t border-[var(--border-primary)] pb-4">
                  {/* Frequency */}
                  <div className="px-5 pt-4 pb-1">
                    <p className="text-[9px] font-bold text-[var(--text-dim)] uppercase tracking-wide">Frequency</p>
                  </div>
                  <div className="px-5 pb-3 flex flex-wrap gap-1.5">
                    {HEADWAY_TIERS.map(({ max, label }) => {
                      const color = isFinite(max) ? getTierColor(String(max)) : 'var(--text-dim)';
                      const active = maxHeadway === max;
                      return (
                        <button
                          key={label}
                          onClick={() => setMaxHeadway?.(max)}
                          className={`h-7 px-2.5 flex items-center justify-center text-[10px] font-bold rounded-full border transition-colors ${
                            active
                              ? 'bg-[var(--accent-bg)] border-[var(--accent-border)] text-[var(--accent)]'
                              : 'border-[var(--border-primary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                          }`}
                        >
                          <span className="w-1.5 h-1.5 rounded-full mr-1.5 shrink-0" style={{ background: color }} />
                          {label === 'Infrequent' ? 'All routes' : label}
                        </button>
                      );
                    })}
                  </div>

                  {/* Day of Service */}
                  <div className="px-5 pt-2 pb-1">
                    <p className="text-[9px] font-bold text-[var(--text-dim)] uppercase tracking-wide">Day of Service</p>
                  </div>
                  <div className="px-5 pb-3 flex gap-1.5">
                    {DAY_TYPES.map(dayType => {
                      const active = day === dayType;
                      return (
                        <button
                          key={dayType}
                          onClick={() => setDay?.(dayType)}
                          className={`flex-1 h-7 flex items-center justify-center text-[10px] font-bold rounded-full border transition-colors ${
                            active
                              ? 'bg-[var(--accent-bg)] border-[var(--accent-border)] text-[var(--accent)]'
                              : 'border-[var(--border-primary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                          }`}
                        >
                          {dayType}
                        </button>
                      );
                    })}
                  </div>

                  {/* Time Period */}
                  <div className="px-5 pt-2 pb-1">
                    <p className="text-[9px] font-bold text-[var(--text-dim)] uppercase tracking-wide">Time Period</p>
                  </div>
                  <div className="px-5 pb-3 flex flex-wrap gap-1.5">
                    {Object.entries(PERIOD_LABELS).map(([key, label]) => {
                      const active = period === key;
                      return (
                        <button
                          key={key}
                          onClick={() => setPeriod?.(key)}
                          className={`h-7 px-2.5 flex items-center justify-center text-[10px] font-bold rounded-full border transition-colors ${
                            active
                              ? 'bg-[var(--accent-bg)] border-[var(--accent-border)] text-[var(--accent)]'
                              : 'border-[var(--border-primary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                          }`}
                        >
                          {label}
                        </button>
                      );
                    })}
                  </div>

                  {/* Transit Modes */}
                  <div className="px-5 pt-2 pb-1">
                    <p className="text-[9px] font-bold text-[var(--text-dim)] uppercase tracking-wide">Transit Modes</p>
                  </div>
                  <div className="px-5 pb-3 flex flex-wrap gap-1.5">
                    {FILTER_MODES.map(({ id, label }) => {
                      const active = selectedModes?.has(id) ?? false;
                      return (
                        <button
                          key={id}
                          onClick={() => {
                            if (!selectedModes || !setSelectedModes) return;
                            const next = new Set(selectedModes);
                            if (next.has(id)) next.delete(id); else next.add(id);
                            setSelectedModes(next);
                          }}
                          className={`h-7 px-2.5 flex items-center justify-center text-[10px] font-bold rounded-full border transition-colors ${
                            active
                              ? 'bg-[var(--accent-bg)] border-[var(--accent-border)] text-[var(--accent)]'
                              : 'border-[var(--border-primary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                          }`}
                        >
                          {label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
};
