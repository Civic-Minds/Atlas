import { BACK_PLACES, backLinkLabel } from '../../content/backLinks';
import { shortDate } from '../../../shared/dateText';
import React, { Fragment, useState, useEffect, useMemo } from 'react';
import { Settings, SlidersHorizontal } from 'lucide-react';
import { CompareSidePicker, SideBadge, type CompareSide } from './CompareControl';
import { TOP_BAR_ICON_BTN, DROPDOWN_PANEL, dropdownAnim, TRANSITION_BASE, Z_MODAL_TOP, CARD_NOTE } from '../../styles';
import Pill from '../ui/Pill';
import ActiveDot from '../ui/ActiveDot';
import Toggle from '../ui/Toggle';
import { AVAILABLE_FILTER_MODES } from '../../utils/shareUrlState';
import type { DayType } from '../../../shared/dayTypes';
import type { TimePeriod } from '../../hooks/useIntervalStats';
import { DayPicker, FrequencyPicker, PeriodPicker, PickerSection } from './pickers';
import { FEATURES, R2_PUBLIC_URL } from '../../../shared/config';
import { plural } from '../../../shared/overflowText';
import type { Agency } from '../../App';
import { routeLabels } from '../../utils/format';
import { agencyNames } from '../../utils/agencyName';
import { feedQualityListItems, presentFeedQualityReason } from '../../../shared/feedQuality';
import { useColorVision } from '../../context/ColorVisionContext';
import { useColorMode } from '../../hooks/useColorMode';
import ArrowLink from '../ui/ArrowLink';
import PanelEmpty from '../ui/PanelEmpty';
import AgencyName from '../ui/AgencyName';
import { SEARCH_FEEDS_PLACEHOLDER, SEARCH_HIDDEN_ROUTES_PLACEHOLDER, CLOSE_PLACES, closeLabel, COMPARE_B_PICKER_NOTE, DAY_LABEL, FREQUENCY_LABEL, MODE_LABEL, TIME_LABEL, DATA_QUALITY_AGENCIES_TITLE, HIDE_DEGRADED_FEEDS_SETTING, HIDE_ONE_OFF_SETTING, HIDE_PART_TIME_SETTING, HIDDEN_ROUTES_UNAVAILABLE, loadingText, ON_DEMAND_PARTIAL_COVERAGE, NO_DEGRADED_FEEDS, NO_FEED_MATCHES, NO_LIMITED_ROUTES_IN_VIEW, noSearchMatchText, OTHER_REGION_LABEL, PART_TIME_ROUTES_NOUN, PART_TIME_ROUTES_SEARCH, PART_TIME_ROUTES_TITLE, SETTINGS_APPLY_TO_FREQUENCY_MAP, FILTERS_LABEL, TOGGLE_DARK_MODE_LABEL, TOGGLE_DATA_SAVER_LABEL, TOGGLE_HIGH_CONTRAST_LABEL, TOGGLE_LEGEND_LABEL } from '../../content/noticeCopy';
import { compareAgencyName, compareRegion, compareRouteNumber } from '../../utils/sortCompare';
import PanelHeader from '../ui/PanelHeader';
import { ON_DEMAND_MODE } from '../../../shared/modes';
import MenuButton from '../ui/MenuButton';
import { contextLayerAvailable } from './map/useContextLayer';
import { CONTEXT_CONTROL_TITLE, CONTEXT_OPTION_DENSITY, CONTEXT_OPTION_INCOME, CONTEXT_OPTION_OFF } from '../../content/noticeCopy';
import type { ContextMetric } from '../../utils/contextLayer';
import { ContextKey } from './ContextLegend';
import { countText } from '../../../shared/numberText';
import SearchBox from '../ui/SearchBox';
import { DEFAULT_MAX_HEADWAY } from '../../../shared/rules/limits';

const CONTEXT_OPTIONS = [
  { key: 'off', label: CONTEXT_OPTION_OFF },
  { key: 'density', label: CONTEXT_OPTION_DENSITY },
  { key: 'income', label: CONTEXT_OPTION_INCOME },
] as const;

interface FilterPanelProps {
  lightMode: boolean;
  setLightMode: (v: boolean | ((prev: boolean) => boolean)) => void;
  hideSpan?: boolean;
  setHideSpan?: (v: boolean | ((prev: boolean) => boolean)) => void;
  hideLimitedService?: boolean;
  setHideLimitedService?: (v: boolean | ((prev: boolean) => boolean)) => void;
  limitedServiceRouteCount?: number | null;
  limitedServiceRoutes?: HiddenRoute[];
  livePollingOnly?: boolean;
  setLivePollingOnly?: (v: boolean | ((prev: boolean) => boolean)) => void;
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
  hideLowQuality?: boolean;
  setHideLowQuality?: (v: boolean | ((prev: boolean) => boolean)) => void;
  feedQualityEnabled?: boolean;
  showMapLegend: boolean;
  setShowMapLegend: (v: boolean | ((prev: boolean) => boolean)) => void;
  dataSaver: boolean;
  setDataSaver: (v: boolean | ((prev: boolean) => boolean)) => void;
  /** Population / income shading under the routes (beta only; null is off). */
  contextMetric?: ContextMetric | null;
  setContextMetric?: (metric: ContextMetric | null) => void;
  /** CIV-2006: a section of the page's own after the general settings (Studio's planner cut-offs), and whether it has
   *  anything set (the gear's dot). Without the routes-shown setters the Routes shown section is left out (Studio). */
  extraSection?: { title: string; content: React.ReactNode; active?: boolean };
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
  routeType?: number;
}

export function getHiddenFeedAgencies(agencies: Agency[]): Agency[] {
  return agencies
    .filter(agency => agency.feedQuality?.status === 'degraded' || agency.feedQuality?.status === 'unusable')
    .sort((a, b) => compareAgencyName(a.name, b.name) || a.slug.localeCompare(b.slug));
}

export function updateHiddenRouteRegions(current: Set<string>, region: string): Set<string> {
  if (region === '') return new Set();
  const next = new Set(current);
  if (next.has(region)) next.delete(region);
  else next.add(region);
  return next;
}

const SETTINGS = [
  { id: 'span', ...HIDE_ONE_OFF_SETTING },
] as const;

export const FilterPanel: React.FC<FilterPanelProps> = ({
  compare,
  extraSection,
  lightMode,
  setLightMode,
  hideSpan = false,
  setHideSpan,
  hideLimitedService = false,
  setHideLimitedService,
  limitedServiceRouteCount,
  limitedServiceRoutes,
  livePollingOnly = false,
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
  hideLowQuality = false,
  setHideLowQuality,
  feedQualityEnabled = false,
  showMapLegend,
  setShowMapLegend,
  dataSaver,
  contextMetric = null,
  setContextMetric,
  setDataSaver,
}) => {
  const { colorVisionFriendly, setColorVisionFriendly } = useColorVision();
  const isFilters = mode === 'filters';
  useColorMode();
  const [open, setOpen] = useState(false);
  const [visible, setVisible] = useState(false);
  const [view, setView] = useState<'settings' | 'hidden-routes' | 'limited-routes' | 'degraded-feeds'>('settings');
  const [hiddenRoutes, setHiddenRoutes] = useState<HiddenRoute[]>([]);
  const [hiddenRoutesLoaded, setHiddenRoutesLoaded] = useState(false);
  const [hiddenRoutesLoading, setHiddenRoutesLoading] = useState(false);
  const [hiddenRoutesQuery, setHiddenRoutesQuery] = useState('');
  const [hiddenRegionFilter, setHiddenRegionFilter] = useState<Set<string>>(new Set());
  const [degradedFeedsQuery, setDegradedFeedsQuery] = useState('');

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
    if (!open || hiddenRoutesLoaded || isFilters || !routesShown) return;
    let cancelled = false;
    setHiddenRoutesLoading(true);
    fetch(`${R2_PUBLIC_URL}/atlas/hidden-routes.json`, { cache: 'no-store' })
      .then(response => response.ok ? (response.json() as Promise<{ routes?: unknown }>) : { routes: [] })
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
      && (hiddenRegionFilter.size === 0 || hiddenRegionFilter.has(route.region ?? OTHER_REGION_LABEL)));
  }, [listRoutes, hiddenRoutesQuery, hiddenRegionFilter]);

  const hiddenRouteRegions = useMemo(
    () => [...new Set(listRoutes.map(route => route.region ?? OTHER_REGION_LABEL))].sort(compareRegion),
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
      .sort(([aSlug, a], [bSlug, b]) => compareAgencyName(a.agencyName, b.agencyName) || aSlug.localeCompare(bSlug))
      .map(([agencySlug, group]) => [
        agencySlug,
        {
          ...group,
          routes: group.routes.sort((a, b) =>
            compareRouteNumber(a.routeShortName, b.routeShortName, a.routeLongName, b.routeLongName),
          ),
        },
      ] as const);
  }, [filteredHiddenRoutes]);

  const agencyCatalog = allAgencies ?? agencies ?? [];
  const hiddenFeedAgencies = useMemo(() => getHiddenFeedAgencies(agencyCatalog), [agencyCatalog]);

  const filteredDegradedFeeds = useMemo(() => {
    const q = degradedFeedsQuery.trim().toLowerCase();
    return hiddenFeedAgencies
      .filter(agency => {
        if (!q) return true;
        const quality = agency.feedQuality!;
        return [agency.name, ...(agency.cities ?? []), agency.displayArea ?? '', quality.status, ...quality.reasons.map(presentFeedQualityReason), ...feedQualityListItems(quality.reasons)]
          .some(value => value.toLowerCase().includes(q));
      })
      .sort((a, b) => compareAgencyName(a.name, b.name) || a.slug.localeCompare(b.slug));
  }, [degradedFeedsQuery, hiddenFeedAgencies]);

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
  const activeFilterCount = (maxHeadway !== undefined && maxHeadway !== DEFAULT_MAX_HEADWAY ? 1 : 0)
    + (period !== undefined && period !== 'all' ? 1 : 0)
    + (selectedModes && selectedModes.size > 0 ? 1 : 0)
    + (compare?.side ? 1 : 0);
  const hasActiveFilters = hideSpan || hideLimitedService || livePollingOnly || hasActiveCoreFilter || hideLowQuality || !!extraSection?.active;
  // Studio (CIV-2006) passes no routes-shown setters: its map has no Routes shown filters.
  const routesShown = !!setHideSpan;

  const values: Record<string, boolean> = {
    live: livePollingOnly,
    span: hideSpan,
    limited: hideLimitedService,
    quality: hideLowQuality,
  };

  const toggles: Record<string, () => void> = {
    live: () => setLivePollingOnly?.(v => !v),
    span: () => setHideSpan?.(v => !v),
    limited: () => setHideLimitedService?.(v => !v),
    quality: () => setHideLowQuality?.(v => !v),
  };

  const settings = [
    ...SETTINGS,
    {
      // #720: part-time routes are on public too. Rush-hour-only routes join this switch once the
      // pipeline classes them time-limited (they are still irregular in today's data).
      id: 'limited',
      ...HIDE_PART_TIME_SETTING,
    },
    ...(feedQualityEnabled ? [{
      id: 'quality',
      ...HIDE_DEGRADED_FEEDS_SETTING,
    }] : []),
  ];

  return (
    <>
      {isFilters ? (
        maxHeadway !== undefined && (
          <button
            onClick={() => setOpen(v => !v)}
            className={`relative sm:hidden ${TOP_BAR_ICON_BTN}`}
            aria-label={FILTERS_LABEL}
          >
            <SlidersHorizontal className="w-4 h-4" />
            {activeFilterCount > 0 && (
              <Pill as="span" selected className="absolute -top-1 -right-1 min-w-4 h-4 !px-1 !py-0 flex items-center justify-center">
                {activeFilterCount}
              </Pill>
            )}
          </button>
        )
      ) : (
        <button
          onClick={() => setOpen(v => !v)}
          className={`relative ${TOP_BAR_ICON_BTN}`}
          aria-label={BACK_PLACES.settings}
        >
          <Settings className="w-4 h-4" />
          {hasActiveFilters && (
            <ActiveDot />
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
            <PanelHeader
              titleId="settings-panel-title"
              title={view === 'hidden-routes'
                ? 'Hidden routes'
                : view === 'limited-routes'
                  ? PART_TIME_ROUTES_TITLE
                : view === 'degraded-feeds'
                  ? DATA_QUALITY_AGENCIES_TITLE
                  : isFilters ? FILTERS_LABEL : 'Settings'}
              onBack={view !== 'settings' ? () => { setView('settings'); setHiddenRoutesQuery(''); setHiddenRegionFilter(new Set()); } : undefined}
              backLabel={backLinkLabel(BACK_PLACES.settings)}
              onClose={close}
              closeLabel={closeLabel(isFilters ? CLOSE_PLACES.filters : CLOSE_PLACES.settings)}
            />

            <div className="overflow-y-auto flex flex-col">
              {view === 'hidden-routes' || view === 'limited-routes' ? (
                <>
                  <div className="px-5 pt-4 pb-3">
                    <SearchBox value={hiddenRoutesQuery} onChange={setHiddenRoutesQuery} placeholder={limitedView ? PART_TIME_ROUTES_SEARCH : SEARCH_HIDDEN_ROUTES_PLACEHOLDER} autoFocus />
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
                    <PanelEmpty kind="loading">{loadingText('hidden routes')}</PanelEmpty>
                  ) : filteredHiddenRoutes.length === 0 ? (
                    <PanelEmpty>
                      {listRoutes.length === 0
                        ? (limitedView ? NO_LIMITED_ROUTES_IN_VIEW : HIDDEN_ROUTES_UNAVAILABLE)
                        : noSearchMatchText(limitedView ? PART_TIME_ROUTES_NOUN : 'hidden routes')}
                    </PanelEmpty>
                  ) : (
                    <div className="px-5 pb-4">
                      {hiddenRoutesByAgency.map(([agencySlug, group]) => {
                        const { primary, secondary } = agencyNames({ name: group.agencyName, cities: agencyCitiesBySlug.get(agencySlug), displayArea: agencyDisplayAreasBySlug.get(agencySlug) }).list;
                        return (
                        <div key={agencySlug}>
                          <p className="pt-2 pb-1 text-xs font-bold text-[var(--text-primary)]">
                            <AgencyName primary={primary} secondary={secondary} />
                          </p>
                          <div className="divide-y divide-[var(--border-primary)]">
                            {group.routes.map(route => {
                              const label = routeLabels({ shortName: route.routeShortName, longName: route.routeLongName, routeType: route.routeType, agencySlug, agencyName: group.agencyName });
                              return (
                                <div key={route.key} className="py-2.5">
                                  <div className="flex items-baseline justify-between gap-3">
                                    <p className="text-xs font-bold text-[var(--text-primary)] line-clamp-2 break-words" title={label.text}>{label.primary}</p>
                                  </div>
                                  {label.secondary && (
                                    <p className="text-xs text-[var(--text-secondary)] line-clamp-2 break-words mt-0.5" title={label.secondary}>{label.secondary}</p>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                        );
                      })}
                    </div>
                  )}
                </>
              ) : view === 'degraded-feeds' ? (
                <div className="px-5 py-3">
                  {hiddenFeedAgencies.length > 0 && (
                    <SearchBox value={degradedFeedsQuery} onChange={setDegradedFeedsQuery} placeholder={SEARCH_FEEDS_PLACEHOLDER} autoFocus />
                  )}
                  {hiddenFeedAgencies.length === 0 ? (
                    <p className="py-4 text-xs text-[var(--text-muted)]">
                      {NO_DEGRADED_FEEDS}
                    </p>
                  ) : filteredDegradedFeeds.length === 0 ? (
                    <p className="py-4 text-xs text-[var(--text-muted)]">
                      {NO_FEED_MATCHES}
                    </p>
                  ) : (
                    <div className="divide-y divide-[var(--border-primary)]">
                      {filteredDegradedFeeds.map(agency => {
                        const quality = agency.feedQuality!;
                        const { primary, secondary } = agencyNames({ name: agency.name, cities: agency.cities, displayArea: agency.displayArea, nameQualifier: agency.nameQualifier }).list;
                        const checkedDate = shortDate(quality.checkedAt) ?? quality.checkedAt;
                        return (
                          <div key={agency.slug} className="py-3 first:pt-2">
                            <p className="text-xs font-bold text-[var(--text-primary)] min-w-0">
                              <AgencyName primary={primary} secondary={secondary} />
                            </p>
                            {quality.reasons.length > 0 && (
                              <p className="mt-1.5 text-xs text-[var(--text-muted)] leading-relaxed">
                                {feedQualityListItems(quality.reasons).map((item, index, items) => (
                                  <Fragment key={item}>
                                    {index > 0 && ' '}
                                    <span className={item.length <= 40 ? 'whitespace-nowrap' : undefined}>{item}{index < items.length - 1 ? ' ·' : ''}</span>
                                  </Fragment>
                                ))}
                              </p>
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
                <p className={CARD_NOTE}>Appearance</p>
              </div>
              <div className="px-5 pb-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-center min-w-0">
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-[var(--text-primary)] leading-tight">Dark mode</p>
                      <p className="text-xs text-[var(--text-muted)] mt-1 leading-relaxed">Uses a dark colour theme across Atlas.</p>
                    </div>
                  </div>
                  <Toggle on={!lightMode} onToggle={() => setLightMode(v => !v)} label={TOGGLE_DARK_MODE_LABEL} />
                </div>
                <div className="flex items-center justify-between mt-2 pt-2">
                  <div className="flex items-center min-w-0">
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-[var(--text-primary)] leading-tight">High contrast mode</p>
                      <p className="text-xs text-[var(--text-muted)] mt-1 leading-relaxed">Uses stronger colours and thicker lines for easier route distinction.</p>
                    </div>
                  </div>
                  <Toggle on={colorVisionFriendly} onToggle={() => setColorVisionFriendly(v => !v)} label={TOGGLE_HIGH_CONTRAST_LABEL} />
                </div>
              </div>

              {FEATURES.persistedSettings && (
                <>
                  <div className="px-5 pt-4 pb-1">
                    <p className={CARD_NOTE}>Map</p>
                  </div>
                  <div className="px-5 pb-3">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-start min-w-0">
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-[var(--text-primary)] leading-tight">Persistent legend</p>
                          <p className="text-xs text-[var(--text-muted)] mt-1 leading-relaxed">Keeps the map legend visible while you explore.</p>
                        </div>
                      </div>
                      <Toggle on={showMapLegend} onToggle={() => setShowMapLegend(v => !v)} label={TOGGLE_LEGEND_LABEL} className="mt-0.5 shrink-0" />
                    </div>
                  </div>
                </>
              )}

              {contextLayerAvailable() && setContextMetric && (
                <div className="px-5 pb-3">
                  <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-[var(--text-primary)] leading-tight whitespace-nowrap">{CONTEXT_CONTROL_TITLE}</p>
                    </div>
                    <MenuButton
                      className="text-xs shrink-0 ml-auto"
                      align="right"
                      label={CONTEXT_OPTIONS.find(o => o.key === (contextMetric ?? 'off'))!.label}
                      value={contextMetric ?? 'off'}
                      options={CONTEXT_OPTIONS}
                      onChange={key => setContextMetric(key === 'off' ? null : key)}
                    />
                  </div>
                  {/* The scale is always one tap away here, even with the persistent legend off. */}
                  {contextMetric && <div className="mt-2"><ContextKey metric={contextMetric} /></div>}
                </div>
              )}

              {FEATURES.persistedSettings && (
                <>
                  <div className="px-5 pt-4 pb-1">
                    <p className={CARD_NOTE}>Data &amp; performance</p>
                  </div>
                  <div className="px-5 pb-3">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-start min-w-0">
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-[var(--text-primary)] leading-tight">Data saver</p>
                          <p className="text-xs text-[var(--text-muted)] mt-1 leading-relaxed">Loads fewer networks at once to reduce data use on slower connections.</p>
                        </div>
                      </div>
                      <Toggle on={dataSaver} onToggle={() => setDataSaver(v => !v)} label={TOGGLE_DATA_SAVER_LABEL} className="mt-0.5 shrink-0" />
                    </div>
                  </div>
                </>
              )}

              {/* Filters */}
              {routesShown && (<>
              <div className="px-5 pt-4 pb-1">
                <p className={CARD_NOTE}>Routes shown</p>
                {!inFrequency && (
                  <p className="text-xs text-[var(--text-muted)] mt-1">{SETTINGS_APPLY_TO_FREQUENCY_MAP}</p>
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
                            <ArrowLink as="button" tone="inline" size="xs" onClick={() => setView('hidden-routes')} className="mt-1">
                              See all hidden routes{hiddenRoutesLoaded ? ` (${countText(hiddenRoutes.length)})` : ' (…)'}
                            </ArrowLink>
                          </>
                        )}
                        {id === 'limited' && limitedServiceRouteCount != null && (
                          <ArrowLink as="button" tone="inline" size="xs" onClick={() => setView('limited-routes')} className="mt-1">
                            See all part-time {plural(limitedServiceRouteCount, 'route')} ({countText(limitedServiceRouteCount)})
                          </ArrowLink>
                        )}
                        {id === 'quality' && (
                          <ArrowLink as="button" tone="inline" size="xs" onClick={() => setView('degraded-feeds')} className="mt-1">
                            {/* CIV-1814 item 30: the list's own title (Ryan's words), with its count. */}
                            {DATA_QUALITY_AGENCIES_TITLE}
                            {hiddenFeedAgencies.length ? ` (${countText(hiddenFeedAgencies.length)})` : ''}
                          </ArrowLink>
                        )}
                      </div>
                    </div>
                    <Toggle on={values[id]} onToggle={toggles[id]} label={label} className="mt-0.5 shrink-0" />
                  </div>
                ))}
              </div>
              </>)}

              {extraSection && (
                <>
                  <div className="px-5 pt-4 pb-1">
                    <p className={CARD_NOTE}>{extraSection.title}</p>
                  </div>
                  <div className="px-5 pb-4">{extraSection.content}</div>
                </>
              )}

              </>
              )}

              {/* Mobile-only Core Filters */}
              {isFilters && maxHeadway !== undefined && (
                <div className="block sm:hidden pb-4">
                  <PickerSection title={FREQUENCY_LABEL} className="px-5 pt-4 pb-3"><FrequencyPicker value={maxHeadway} onChange={max => setMaxHeadway?.(max)} /></PickerSection>
                  <PickerSection title={DAY_LABEL} className="px-5 pt-2 pb-3"><DayPicker fill value={day as DayType} onChange={d => setDay?.(d)} /></PickerSection>
                  <PickerSection title={TIME_LABEL} className="px-5 pt-2 pb-3"><PeriodPicker value={period as TimePeriod} onChange={p => setPeriod?.(p)} /></PickerSection>

                  {compare?.side && (
                    <div className="px-5 pt-2 pb-3">
                      <p className={`mb-2 flex items-center gap-1.5 ${CARD_NOTE}`}><SideBadge side="B" /> {COMPARE_B_PICKER_NOTE}</p>
                      <CompareSidePicker side={compare.side} onChange={compare.onChange} />
                    </div>
                  )}

                  {/* Transit Modes */}
                  <div className="px-5 pt-2 pb-1">
                    <p className={CARD_NOTE}>{MODE_LABEL}</p>
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
                  {AVAILABLE_FILTER_MODES.some(m => m.id === ON_DEMAND_MODE) && (
                    <p className="px-5 pb-3 -mt-1 text-xs leading-snug text-[var(--text-muted)]">{ON_DEMAND_PARTIAL_COVERAGE}</p>
                  )}
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
