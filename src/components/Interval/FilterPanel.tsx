import React, { useState, useEffect, useMemo } from 'react';
import { Settings, SlidersHorizontal, X, ArrowLeft, Search } from 'lucide-react';
import { CompareSidePicker, SideBadge, type CompareSide } from './CompareControl';
import { ICON_BTN, DROPDOWN_PANEL, SEARCH_FIELD, SEARCH_PILL, CONTROL_ACTIVE, CONTROL_INACTIVE, dropdownAnim, TRANSITION_BASE, Z_MODAL_TOP } from '../../styles';
import Pill from '../ui/Pill';
import Toggle from '../ui/Toggle';
import { HEADWAY_TIERS, getTierColor } from '../../utils/colors';
import { AVAILABLE_FILTER_MODES } from '../../utils/shareUrlState';
import { DAY_TYPES } from '../../../shared/dayTypes';
import { PERIOD_LABELS } from '../../hooks/useIntervalStats';
import { ATLAS_MODE, FEATURES, R2_PUBLIC_URL } from '../../../shared/config';
import { plural } from '../../../shared/overflowText';
import type { Agency } from '../../App';
import { agencyDisplayParts, formatStoredDate } from '../../utils/format';
import { presentFeedQualityReason, qualityStatusLabel } from '../../../shared/feedQuality';
import { useColorVision } from '../../context/ColorVisionContext';


interface FilterPanelProps {
  lightMode: boolean;
  setLightMode: (v: boolean | ((prev: boolean) => boolean)) => void;
  hideSpan: boolean;
  setHideSpan: (v: boolean | ((prev: boolean) => boolean)) => void;
  hideLimitedService: boolean;
  setHideLimitedService: (v: boolean | ((prev: boolean) => boolean)) => void;
  limitedServiceRouteCount?: number | null;
  limitedServiceRoutes?: HiddenRoute[];
  livePollingOnly: boolean;
  setLivePollingOnly: (v: boolean | ((prev: boolean) => boolean)) => void;
  onInfoOpen?: (tab?: 'about' | 'agencies' | 'live') => void;
  inFrequency?: boolean;
  /** 'filters' renders the phone-only Filters sheet; 'settings' (default) renders the Settings sheet. */
  mode?: 'settings' | 'filters';

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
  allAgencies?: Agency[];
  selectedAgencies?: Set<string>;
  setSelectedAgencies?: (agencies: Set<string>) => void;
  bounds?: any;
  hideLowQuality: boolean;
  setHideLowQuality: (v: boolean | ((prev: boolean) => boolean)) => void;
  feedQualityEnabled?: boolean;
  showMapLegend: boolean;
  setShowMapLegend: (v: boolean | ((prev: boolean) => boolean)) => void;
  dataSaver: boolean;
  setDataSaver: (v: boolean | ((prev: boolean) => boolean)) => void;
  /** Compare mode controls (phones reach them here); undefined when compare is unavailable. */
  compare?: {
    side: CompareSide | null;
    onStart: () => void;
    onExit: () => void;
    onChange: (side: CompareSide) => void;
  };
}

export interface HiddenRoute {
  key: string;
  agencySlug: string;
  agencyName: string;
  region?: string | null;
  routeShortName: string;
  routeLongName?: string | null;
}

export function getHiddenFeedAgencies(agencies: Agency[]): Agency[] {
  return agencies
    .filter(agency => agency.feedQuality?.status === 'degraded' || agency.feedQuality?.status === 'unusable')
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function updateHiddenRouteRegions(current: Set<string>, region: string): Set<string> {
  if (region === '') return new Set();
  const next = new Set(current);
  if (next.has(region)) next.delete(region);
  else next.add(region);
  return next;
}

const SETTINGS = [
  {
    id: 'span',
    label: 'Hide one-off routes',
    description: 'School runs, a few trips a day, on-demand.',
  },
] as const;

export const FilterPanel: React.FC<FilterPanelProps> = ({
  compare,
  lightMode,
  setLightMode,
  hideSpan,
  setHideSpan,
  hideLimitedService,
  setHideLimitedService,
  limitedServiceRouteCount,
  limitedServiceRoutes,
  livePollingOnly,
  setLivePollingOnly,
  onInfoOpen,
  inFrequency = true,
  mode = 'settings',
  maxHeadway,
  setMaxHeadway,
  selectedModes,
  setSelectedModes,
  day,
  setDay,
  period,
  setPeriod,
  agencies,
  allAgencies,
  selectedAgencies,
  setSelectedAgencies,
  bounds,
  hideLowQuality,
  setHideLowQuality,
  feedQualityEnabled = false,
  showMapLegend,
  setShowMapLegend,
  dataSaver,
  setDataSaver,
}) => {
  const { colorVisionFriendly, setColorVisionFriendly } = useColorVision();
  const isFilters = mode === 'filters';
  const colorMode = colorVisionFriendly ? 'friendly' : 'default';
  const [open, setOpen] = useState(false);
  const [visible, setVisible] = useState(false);
  const [view, setView] = useState<'settings' | 'hidden-routes' | 'limited-routes' | 'degraded-feeds'>('settings');
  const [hiddenRoutes, setHiddenRoutes] = useState<HiddenRoute[]>([]);
  const [hiddenRoutesLoaded, setHiddenRoutesLoaded] = useState(false);
  const [hiddenRoutesLoading, setHiddenRoutesLoading] = useState(false);
  const [hiddenRoutesQuery, setHiddenRoutesQuery] = useState('');
  const [hiddenRegionFilter, setHiddenRegionFilter] = useState<Set<string>>(new Set());
  const [degradedFeedsQuery, setDegradedFeedsQuery] = useState('');
  const [degradedFeedsStatus, setDegradedFeedsStatus] = useState<'all' | 'degraded' | 'unusable'>('all');
  const [degradedFeedsSort, setDegradedFeedsSort] = useState<'name' | 'status'>('name');

  useEffect(() => {
    if (open) {
      const id = requestAnimationFrame(() => setVisible(true));
      return () => cancelAnimationFrame(id);
    } else {
      setVisible(false);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open]);

  useEffect(() => {
    if (!open || hiddenRoutesLoaded || isFilters) return;
    let cancelled = false;
    setHiddenRoutesLoading(true);
    fetch(`${R2_PUBLIC_URL}/atlas/hidden-routes.json`, { cache: 'no-store' })
      .then(response => response.ok ? response.json() : { routes: [] })
      .then(data => {
        if (!cancelled) {
          setHiddenRoutes(Array.isArray(data?.routes) ? data.routes : []);
          setHiddenRoutesLoaded(true);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setHiddenRoutes([]);
          setHiddenRoutesLoaded(true);
        }
      })
      .finally(() => {
        if (!cancelled) setHiddenRoutesLoading(false);
      });
    return () => { cancelled = true; };
  }, [hiddenRoutesLoaded, open]);

  const close = () => {
    setOpen(false);
    setView('settings');
    setHiddenRoutesQuery('');
    setHiddenRegionFilter(new Set());
    setDegradedFeedsQuery('');
    setDegradedFeedsStatus('all');
    setDegradedFeedsSort('name');
  };

  const selectHiddenRouteRegion = (region: string) => {
    if (region === '') {
      setHiddenRegionFilter(new Set());
      setHiddenRoutesQuery('');
      return;
    }
    setHiddenRegionFilter(prev => updateHiddenRouteRegions(prev, region));
  };

  // The route-list view serves both filters: irregular routes (global inventory) and
  // limited-service routes (computed from the loaded map data, so no separate fetch).
  const limitedView = view === 'limited-routes';
  const regionBySlug = useMemo(
    () => new Map((allAgencies ?? agencies ?? []).map(agency => [agency.slug, agency.region ?? null] as const)),
    [allAgencies, agencies],
  );
  const listRoutes = useMemo<HiddenRoute[]>(
    () => limitedView
      ? (limitedServiceRoutes ?? []).map(route => ({ ...route, region: regionBySlug.get(route.agencySlug) ?? null }))
      : hiddenRoutes,
    [limitedView, limitedServiceRoutes, regionBySlug, hiddenRoutes],
  );

  const filteredHiddenRoutes = useMemo(() => {
    const q = hiddenRoutesQuery.trim().toLowerCase();
    return listRoutes.filter(route => [
      route.routeShortName,
      route.routeLongName ?? '',
      route.agencyName,
      route.region ?? '',
    ].some(value => value.toLowerCase().includes(q))
      && (hiddenRegionFilter.size === 0 || hiddenRegionFilter.has(route.region ?? 'Other')));
  }, [listRoutes, hiddenRoutesQuery, hiddenRegionFilter]);

  const hiddenRouteRegions = useMemo(
    () => [...new Set(listRoutes.map(route => route.region ?? 'Other'))].sort(),
    [listRoutes],
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

  const agencyCatalog = allAgencies ?? agencies ?? [];
  const hiddenFeedAgencies = useMemo(() => getHiddenFeedAgencies(agencyCatalog), [agencyCatalog]);

  const filteredDegradedFeeds = useMemo(() => {
    const q = degradedFeedsQuery.trim().toLowerCase();
    return hiddenFeedAgencies
      .filter(agency => degradedFeedsStatus === 'all' || agency.feedQuality?.status === degradedFeedsStatus)
      .filter(agency => {
        if (!q) return true;
        const quality = agency.feedQuality!;
        return [agency.name, ...(agency.cities ?? []), agency.displayArea ?? '', quality.status, ...quality.reasons.map(presentFeedQualityReason)]
          .some(value => value.toLowerCase().includes(q));
      })
      .sort((a, b) => {
        if (degradedFeedsSort === 'status') {
          const byStatus = (a.feedQuality?.status ?? '').localeCompare(b.feedQuality?.status ?? '');
          if (byStatus !== 0) return byStatus;
        }
        return a.name.localeCompare(b.name);
      });
  }, [degradedFeedsQuery, degradedFeedsSort, degradedFeedsStatus, hiddenFeedAgencies]);

  const agencyCitiesBySlug = useMemo(
    () => new Map(agencyCatalog.map(agency => [agency.slug, agency.cities] as const)),
    [agencyCatalog],
  );
  const agencyDisplayAreasBySlug = useMemo(
    () => new Map(agencyCatalog.map(agency => [agency.slug, agency.displayArea] as const)),
    [agencyCatalog],
  );

  const hasActiveCoreFilter = maxHeadway !== undefined && (maxHeadway !== Infinity || period !== 'all' || (selectedModes && selectedModes.size > 0));
  // Day is not counted: it defaults to today, so it is never "unset".
  const activeFilterCount = (maxHeadway !== undefined && maxHeadway !== 60 ? 1 : 0)
    + (period !== undefined && period !== 'all' ? 1 : 0)
    + (selectedModes && selectedModes.size > 0 ? 1 : 0)
    + (compare?.side ? 1 : 0);
  const hasActiveFilters = hideSpan || hideLimitedService || livePollingOnly || hasActiveCoreFilter || hideLowQuality;

  const values: Record<string, boolean> = {
    live: livePollingOnly,
    span: hideSpan,
    limited: hideLimitedService,
    quality: hideLowQuality,
  };

  const toggles: Record<string, () => void> = {
    live: () => setLivePollingOnly(v => !v),
    span: () => setHideSpan(v => !v),
    limited: () => setHideLimitedService(v => !v),
    quality: () => setHideLowQuality(v => !v),
  };

  const settings = [
    ...SETTINGS,
    {
      // #720: part-time routes are on public too. Rush-hour-only routes join this switch once the
      // pipeline classes them time-limited (they are still irregular in today's data).
      id: 'limited',
      label: 'Hide part-time routes',
      description: 'Only at rush hour, evenings, or some days.',
    },
    ...(feedQualityEnabled ? [{
      id: 'quality',
      label: 'Hide degraded feeds',
      description: 'Hides agencies with known data-quality problems. Feeds still being reviewed remain visible.',
    }] : []),
  ];

  return (
    <>
      {isFilters ? (
        maxHeadway !== undefined && (
          <button
            onClick={() => setOpen(v => !v)}
            className={`relative sm:hidden ${ICON_BTN}`}
            aria-label="Filters"
          >
            <SlidersHorizontal className="w-4 h-4" />
            {activeFilterCount > 0 && (
              <span className="absolute -top-1 -right-1 min-w-4 h-4 px-1 flex items-center justify-center rounded-full bg-[var(--accent)] text-xs font-bold text-white">
                {activeFilterCount}
              </span>
            )}
          </button>
        )
      ) : (
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
      )}

      {open && (
        <div
          className={`fixed inset-0 ${Z_MODAL_TOP}`}
          onClick={close}
        >
          <div
            className={`${DROPDOWN_PANEL} ${dropdownAnim(visible)}`}
            onClick={e => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="settings-panel-title"
          >
            <div className="flex items-center justify-between px-5 py-2 border-b border-[var(--border-primary)] shrink-0">
              <div className="flex items-center gap-1.5">
                {view !== 'settings' && (
                  <button
                    onClick={() => { setView('settings'); setHiddenRoutesQuery(''); setHiddenRegionFilter(new Set()); }}
                    className="w-7 h-7 -ml-1 flex items-center justify-center rounded-full hover:bg-[var(--bg-btn-hover)] text-[var(--text-dim)] transition-colors"
                    aria-label="Back to settings"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                  </button>
                )}
                <h2 id="settings-panel-title" className="text-xs font-black text-[var(--text-primary)]">
                  {view === 'hidden-routes'
                    ? 'Hidden routes'
                    : view === 'limited-routes'
                      ? 'Limited-service routes'
                    : view === 'degraded-feeds'
                      ? (hideLowQuality ? 'Hidden feeds' : 'Degraded feeds')
                      : isFilters ? 'Filters' : 'Settings'}
                </h2>
              </div>
              <button
                onClick={close}
                className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-[var(--bg-btn-hover)] text-[var(--text-dim)] transition-colors"
                aria-label={isFilters ? 'Close filters' : 'Close settings'}
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="overflow-y-auto flex flex-col">
              {view === 'hidden-routes' || view === 'limited-routes' ? (
                <>
                  <div className="px-5 pt-4 pb-3">
                    <label className={SEARCH_PILL}>
                      <Search className="w-3 h-3 text-[var(--text-dim)] shrink-0" />
                      <input
                        value={hiddenRoutesQuery}
                        onChange={event => setHiddenRoutesQuery(event.target.value)}
                        placeholder={limitedView ? 'Search limited-service routes…' : 'Search hidden routes…'}
                        className={SEARCH_FIELD}
                        autoFocus
                      />
                    </label>
                    <div className="flex gap-1.5 overflow-x-auto items-center mt-2 [&::-webkit-scrollbar]:hidden" style={{ scrollbarWidth: 'none' }}>
                      {['All', ...hiddenRouteRegions].map(region => {
                        const key = region === 'All' ? '' : region;
                        const active = key === '' ? hiddenRegionFilter.size === 0 : hiddenRegionFilter.has(key);
                        return (
                          <Pill
                            key={region}
                            onClick={() => selectHiddenRouteRegion(key)}
                            selected={active}
                            className="shrink-0"
                          >
                            {region}
                          </Pill>
                        );
                      })}
                    </div>
                  </div>
                  {hiddenRoutesLoading && !limitedView ? (
                    <p className="px-5 py-4 text-xs text-[var(--text-muted)]">Loading hidden routes…</p>
                  ) : filteredHiddenRoutes.length === 0 ? (
                    <p className="px-5 py-4 text-xs text-[var(--text-muted)]">
                      {listRoutes.length === 0
                        ? (limitedView ? 'No limited-service routes in view.' : 'The hidden-route list is unavailable right now.')
                        : (limitedView ? 'No limited-service routes match your search.' : 'No hidden routes match your search.')}
                    </p>
                  ) : (
                    <div className="px-5 pb-4">
                      {hiddenRoutesByAgency.map(([agencySlug, group]) => {
                        const { primary, secondary } = agencyDisplayParts(group.agencyName, agencyCitiesBySlug.get(agencySlug), agencyDisplayAreasBySlug.get(agencySlug));
                        return (
                        <div key={agencySlug}>
                          <p className="pt-2 pb-1 text-xs font-bold text-[var(--text-primary)]">
                            {primary}
                            {secondary && <span className="font-normal text-[var(--text-dim)]"> · {secondary}</span>}
                          </p>
                          <div className="divide-y divide-[var(--border-primary)]">
                            {group.routes.map(route => (
                              <div key={route.key} className="py-2.5">
                                <div className="flex items-baseline justify-between gap-3">
                                  <p className="text-xs font-bold text-[var(--text-primary)] line-clamp-2 break-words" title={route.routeShortName}>{route.routeShortName}</p>
                                </div>
                                {route.routeLongName && route.routeLongName !== route.routeShortName && (
                                  <p className="text-xs text-[var(--text-secondary)] line-clamp-2 break-words mt-0.5" title={route.routeLongName}>{route.routeLongName}</p>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                        );
                      })}
                    </div>
                  )}
                </>
              ) : view === 'degraded-feeds' ? (
                <div className="px-5 py-3">
                  <p className="text-xs text-[var(--text-muted)] leading-relaxed pb-2">
                    Atlas found serious data problems or an expired schedule in these agencies.
                  </p>
                  {hiddenFeedAgencies.length > 0 && (
                    <>
                      <label className={SEARCH_PILL}>
                        <Search className="w-3 h-3 text-[var(--text-dim)] shrink-0" />
                        <input
                          value={degradedFeedsQuery}
                          onChange={event => setDegradedFeedsQuery(event.target.value)}
                          placeholder="Search feeds…"
                          className={SEARCH_FIELD}
                          autoFocus
                        />
                      </label>
                      <div className="flex items-center gap-1.5 mt-2">
                        {(['all', 'degraded', 'unusable'] as const).map(status => (
                          <Pill
                            key={status}
                            onClick={() => setDegradedFeedsStatus(status)}
                            selected={degradedFeedsStatus === status}
                          >
                            {status === 'all' ? 'All' : qualityStatusLabel(status)}
                          </Pill>
                        ))}
                        <select
                          value={degradedFeedsSort}
                          onChange={event => setDegradedFeedsSort(event.target.value as 'name' | 'status')}
                          aria-label="Sort degraded feeds"
                          className="ml-auto h-6 rounded-md bg-[var(--bg-app)] border border-[var(--border-primary)] px-1.5 text-xs text-[var(--text-muted)] outline-none"
                        >
                          <option value="name">Name</option>
                          <option value="status">Status</option>
                        </select>
                      </div>
                    </>
                  )}
                  {hiddenFeedAgencies.length === 0 ? (
                    <p className="py-4 text-xs text-[var(--text-muted)]">
                      No degraded or unusable feeds are currently recorded.
                    </p>
                  ) : filteredDegradedFeeds.length === 0 ? (
                    <p className="py-4 text-xs text-[var(--text-muted)]">
                      No feeds match your search or filter.
                    </p>
                  ) : (
                    <div className="divide-y divide-[var(--border-primary)]">
                      {filteredDegradedFeeds.map(agency => {
                        const quality = agency.feedQuality!;
                        const { primary, secondary } = agencyDisplayParts(agency.name, agency.cities, agency.displayArea);
                        const checkedDate = formatStoredDate(quality.checkedAt.slice(0, 10)) || quality.checkedAt;
                        return (
                          <div key={agency.slug} className="py-3 first:pt-2">
                            <p className="text-xs font-bold text-[var(--text-primary)] min-w-0">
                              {primary}
                              {secondary && <span className="font-normal text-[var(--text-dim)]"> · {secondary}</span>}
                            </p>
                            {quality.reasons.length > 0 && (
                              <ul className="mt-1.5 space-y-0.5 text-xs text-[var(--text-muted)] leading-relaxed">
                                {quality.reasons.map(reason => <li key={reason}>{presentFeedQualityReason(reason)}</li>)}
                              </ul>
                            )}
                            <p className="mt-1 text-xs text-[var(--text-dim)]">Checked {checkedDate}</p>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              ) : (
                <>
              {!isFilters && (
              <>
              {/* Appearance. Sections use spacing only, no divider lines (guarded by settingsNoDividers.test.ts). */}
              <div className="px-5 pt-4 pb-1">
                <p className="text-xs font-bold text-[var(--text-dim)]">Appearance</p>
              </div>
              <div className="px-5 pb-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-center min-w-0">
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-[var(--text-primary)] leading-tight">Dark mode</p>
                      <p className="text-xs text-[var(--text-muted)] mt-1 leading-relaxed">Uses a dark colour theme across Atlas.</p>
                    </div>
                  </div>
                  <Toggle on={!lightMode} onToggle={() => setLightMode(v => !v)} label="Toggle light/dark mode" />
                </div>
                <div className="flex items-center justify-between mt-2 pt-2">
                  <div className="flex items-center min-w-0">
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-[var(--text-primary)] leading-tight">High contrast mode</p>
                      <p className="text-xs text-[var(--text-muted)] mt-1 leading-relaxed">Uses stronger colours and thicker lines for easier route distinction.</p>
                    </div>
                  </div>
                  <Toggle on={colorVisionFriendly} onToggle={() => setColorVisionFriendly(v => !v)} label="Toggle high contrast mode" />
                </div>
              </div>

              {FEATURES.persistedSettings && (
                <>
                  <div className="px-5 pt-4 pb-1">
                    <p className="text-xs font-bold text-[var(--text-dim)]">Map</p>
                  </div>
                  <div className="px-5 pb-3">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-start min-w-0">
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-[var(--text-primary)] leading-tight">Persistent legend</p>
                          <p className="text-xs text-[var(--text-muted)] mt-1 leading-relaxed">Keeps the map legend visible while you explore.</p>
                        </div>
                      </div>
                      <Toggle on={showMapLegend} onToggle={() => setShowMapLegend(v => !v)} label="Toggle persistent legend" className="mt-0.5 shrink-0" />
                    </div>
                  </div>
                </>
              )}

              {FEATURES.persistedSettings && (
                <>
                  <div className="px-5 pt-4 pb-1">
                    <p className="text-xs font-bold text-[var(--text-dim)]">Data &amp; performance</p>
                  </div>
                  <div className="px-5 pb-3">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-start min-w-0">
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-[var(--text-primary)] leading-tight">Data saver</p>
                          <p className="text-xs text-[var(--text-muted)] mt-1 leading-relaxed">Loads fewer networks at once to reduce data use on slower connections.</p>
                        </div>
                      </div>
                      <Toggle on={dataSaver} onToggle={() => setDataSaver(v => !v)} label="Toggle data saver" className="mt-0.5 shrink-0" />
                    </div>
                  </div>
                </>
              )}

              {/* Filters */}
              <div className="px-5 pt-4 pb-1">
                <p className="text-xs font-bold text-[var(--text-dim)]">Routes shown</p>
                {!inFrequency && (
                  <p className="text-xs text-[var(--text-muted)] mt-1">These settings apply to the Frequency map.</p>
                )}
              </div>
              <div className="px-5 pb-3 flex flex-col gap-4 pt-1">
                {settings.map(({ id, label, description }) => (
                  <div key={id} className={`flex items-start justify-between gap-4 transition-opacity ${TRANSITION_BASE} ${inFrequency ? 'opacity-100' : 'opacity-40'}`}>
                    <div className="flex items-start min-w-0">
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-[var(--text-primary)] leading-tight">{label}</p>
                        <p className="text-xs text-[var(--text-muted)] mt-1 leading-relaxed">{description}</p>
                        {id === 'span' && (
                          <>
                            <button
                              onClick={() => setView('hidden-routes')}
                              className="mt-1 text-xs text-[var(--accent)] hover:underline"
                            >
                              See all hidden routes{hiddenRoutesLoaded ? ` (${hiddenRoutes.length.toLocaleString()})` : ' (…)'} →
                            </button>
                          </>
                        )}
                        {id === 'limited' && limitedServiceRouteCount != null && (
                          <button
                            onClick={() => setView('limited-routes')}
                            className="mt-1 text-xs text-[var(--accent)] hover:underline"
                          >
                            {limitedServiceRouteCount.toLocaleString()} {plural(limitedServiceRouteCount, 'route')} affected →
                          </button>
                        )}
                        {id === 'quality' && (
                          <button
                            onClick={() => setView('degraded-feeds')}
                            className="mt-1 text-xs text-[var(--accent)] hover:underline"
                          >
                            {hideLowQuality ? 'See hidden feeds' : 'Review degraded feeds'}
                            {hiddenFeedAgencies.length ? ` (${hiddenFeedAgencies.length.toLocaleString()})` : ''} →
                          </button>
                        )}
                      </div>
                    </div>
                    <Toggle on={values[id]} onToggle={toggles[id]} label={label} className="mt-0.5 shrink-0" />
                  </div>
                ))}
              </div>

              </>
              )}

              {/* Mobile-only Core Filters */}
              {isFilters && maxHeadway !== undefined && (
                <div className="block sm:hidden pb-4">
                  {/* Frequency */}
                  <div className="px-5 pt-4 pb-1">
                    <p className="text-xs font-bold text-[var(--text-dim)]">Frequency</p>
                  </div>
                  <div className="px-5 pb-3 flex flex-wrap gap-1.5">
                    {HEADWAY_TIERS.map(({ max, label }) => {
                      const color = isFinite(max) ? getTierColor(String(max), colorMode) : 'var(--text-dim)';
                      const active = maxHeadway === max;
                      return (
                        <Pill
                          key={label}
                          onClick={() => setMaxHeadway?.(max)}
                          size="segment"
                          selected={active}
                        >
                          <span className="w-1.5 h-1.5 rounded-full mr-1.5 shrink-0" style={{ background: color }} />
                          {label === 'Infrequent' ? 'All routes' : label}
                        </Pill>
                      );
                    })}
                  </div>

                  {/* Day of Service */}
                  <div className="px-5 pt-2 pb-1">
                    <p className="text-xs font-bold text-[var(--text-dim)]">Day of service</p>
                  </div>
                  <div className="px-5 pb-3 flex gap-1.5">
                    {DAY_TYPES.map(dayType => {
                      const active = day === dayType;
                      return (
                        <button
                          key={dayType}
                          onClick={() => setDay?.(dayType)}
                          aria-pressed={active}
                          className={`flex-1 h-7 flex items-center justify-center text-xs font-bold rounded-full border transition-colors ${
                            active ? CONTROL_ACTIVE : CONTROL_INACTIVE
                          }`}
                        >
                          {dayType}
                        </button>
                      );
                    })}
                  </div>

                  {/* Time Period */}
                  <div className="px-5 pt-2 pb-1">
                    <p className="text-xs font-bold text-[var(--text-dim)]">Time period</p>
                  </div>
                  <div className="px-5 pb-3 flex flex-wrap gap-1.5">
                    {Object.entries(PERIOD_LABELS).map(([key, label]) => {
                      const active = period === key;
                      return (
                        <Pill
                          key={key}
                          onClick={() => setPeriod?.(key)}
                          size="segment"
                          selected={active}
                        >
                          {label}
                        </Pill>
                      );
                    })}
                  </div>

                  {compare?.side && (
                    <div className="px-5 pt-2 pb-3">
                      <p className="mb-2 flex items-center gap-1.5 text-xs font-bold text-[var(--text-dim)]"><SideBadge side="B" /> The frequency, day and time above are map A; pick map B here. Modes and agencies apply to both maps. Leave Compare from the More menu.</p>
                      <CompareSidePicker side={compare.side} onChange={compare.onChange} />
                    </div>
                  )}

                  {/* Transit Modes */}
                  <div className="px-5 pt-2 pb-1">
                    <p className="text-xs font-bold text-[var(--text-dim)]">Transit modes</p>
                  </div>
                  <div className="px-5 pb-3 flex flex-wrap gap-1.5">
                    {AVAILABLE_FILTER_MODES.map(({ id, label }) => {
                      const active = selectedModes?.has(id) ?? false;
                      return (
                        <Pill
                          key={id}
                          onClick={() => {
                            if (!selectedModes || !setSelectedModes) return;
                            const next = new Set(selectedModes);
                            if (next.has(id)) next.delete(id); else next.add(id);
                            setSelectedModes(next);
                          }}
                          size="segment"
                          selected={active}
                        >
                          {label}
                        </Pill>
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
