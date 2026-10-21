import React, { useState, useEffect, useMemo, useCallback, useRef, useLayoutEffect } from 'react';
import { loadHistoryConfig as loadHistoryConfigShared } from '../utils/historyConfig';
import { History as HistoryIcon } from 'lucide-react';
import { useHistoryMapOverlay } from '../context/HistoryMapOverlay';
import { type HeadwayByPeriod } from '../../shared/config';
import { countOf } from '../../shared/overflowText';
import { isDrawableLineCoordinates } from '../../shared/routeGeometry';
import { TRANSITION_SLOW, AGENCY_LIST_FILTERS, PILL_SCROLL_ROW, PANEL_SIDEBAR, PANEL_TITLE, SIDEBAR_LEFT_FALLBACK, SIDEBAR_PANEL_WIDTH, Z_PANEL } from '../styles';
import { agencyDisplayParts, routeLabels, shortenAgencyName, titleCase } from '../utils/format';
import CardRouteList from '../components/Interval/CardRouteList';
import { CARD_HEADER_BLOCK, CARD_SUMMARY, CARD_TITLE, CardBackLink, CardDirectionRow, CardReportButton, SIDEBAR_CARD_BODY, SidebarCardHeaderBlock, SidebarCardListRows, SidebarCardShell } from '../components/Interval/cardUi';
import RouteCardTitle from '../components/RouteCardTitle';
import { SearchSuggestionsPanel, type RecentRoute, type SuggestedRoute } from '../components/Interval/SearchSuggestionsPanel';
import type { RouteListDisplay } from '../utils/effectiveHeadway';
import { useRecentSearches } from '../hooks/useRecentSearches';
import { PHONE_MEDIA_QUERY, useMediaQuery } from '../hooks/useMediaQuery';
import { FEATURES } from '../../shared/config';
import { BOTTOM_SHEET_FRAME, BottomSheetHandle, bottomSheetBodyClass, useBottomSheet } from '../components/ui/BottomSheet';
import { historyRouteMatchesQuery } from '../utils/historyRouteSearch';
import { snapshotsNewestFirst, usableSnapshots } from '../utils/historySnapshots';
import { buildRouteModeFilters, routeMatchesModeFilter, type RouteModeFilterKey } from '../utils/routeModeFilters';
import { useColorVision } from '../context/ColorVisionContext';
import RegionFilterPills from '../components/RegionFilterPills';
import {
  agencyHistoryTier,
  agencyQualifiesForHistory,
  type HistoryTier,
} from '../../shared/historyEligibility';
import { capitalizeFirst, headwayAmount, headwayEvery } from '../utils/headwayText';
import Panel, { PanelTitleBar } from '../components/ui/Panel';
import ListRow from '../components/ui/ListRow';
import { AgencyList, AgencyListRow, AgencyRegionSection } from '../components/ui/AgencyList';
import ArrowLink from '../components/ui/ArrowLink';
import { currentAtlasUrl } from '../utils/reportIssue';
import ModeFilterPill from '../components/ui/ModeFilterPill';
import { syncUrlParams } from '../utils/syncUrlParams';
import { encodeHistoryUrlState, parseHistoryUrlState, type HistoryUrlState } from '../utils/shareUrlState';
import PanelEmpty from '../components/ui/PanelEmpty';
import { loadingText, loadErrorText, NO_ROUTES_LOADED, noRoutesMatchText, RETRY_HINT } from '../content/stateCopy';
import { compareAgencyName, compareRegion } from '../utils/sortCompare';
import { inViewFirst } from '../utils/historyOpen';

export interface RouteSnapshot {
  label: string;
  year: number;
  weekdayHeadwayMin: number;
  headwayByPeriod?: HeadwayByPeriod;
  geometry?: number[][];
  note?: string;
}

export interface RouteTripDurationSummary {
  firstLabel: string;
  firstMinutes: number;
  lastLabel: string;
  lastMinutes: number;
}

export interface RouteHistoryEntry {
  routeShortName: string;
  routeName: string;
  currentRouteType?: number | string | null;
  currentBusSubType?: string | null;
  snapshots: RouteSnapshot[];
  /** Only present when the route's stops/alignment were identical across the compared range. */
  tripDuration?: RouteTripDurationSummary;
}

export interface AgencyHistory {
  slug: string;
  name: string;
  region: string;
  center?: [number, number];
  coverageYears?: number[];
  routes: RouteHistoryEntry[];
}

interface Props {
  active: boolean;
  /** The agency to open on, when the user has shown which city they mean (historyAgencyToOpen). */
  initialAgencySlug?: string | null;
  /** Agencies in the map's view, listed first in the chooser. */
  inViewAgencySlugs?: readonly string[];
  onInfoOpen?: (tab?: 'about' | 'agencies' | 'live') => void;
  query: string;
  searchFocused: boolean;
  setQuery: (q: string) => void;
  pendingRouteClick?: { slug: string; routeShortName: string } | null;
  onPendingRouteHandled?: () => void;
  sidebarLeft?: number;
  /** The app's agency catalog: History names agencies from it, as the agency card and About list do. */
  agencyCatalog?: readonly { slug: string; name: string; cities?: string[]; displayArea?: string }[];
  /** The search bar's width on desktop: History's panels match it, as the regular cards do. */
  searchBarWidth?: number;
  /** The open agency's short name, or null (the top search bar then searches its routes). */
  onOpenAgencyChange?: (name: string | null) => void;
  /** Changes when the user dismisses the map's selection (empty-map click, Escape): the panel closes, as on the regular map (#1031). */
  dismissKey?: number;
  /** Whether History's panel is showing (so Escape has something to close). */
  onPanelOpenChange?: (open: boolean) => void;
}

function changeSummary(entry: RouteHistoryEntry): { text: string; subtext: string; worse: boolean } | null {
  const snaps = sortSnapshotsNewestFirst(entry.snapshots);
  if (snaps.length < 2) return null;
  const first = snaps[snaps.length - 1];
  const last = snaps[0];
  const fHw = first.weekdayHeadwayMin;
  const lHw = last.weekdayHeadwayMin;
  if (Math.abs(fHw - lHw) < 2) return null;
  const worse = lHw > fHw;
  return {
    text: `${capitalizeFirst(headwayEvery(fHw))} → ${headwayEvery(lHw)}`,
    subtext: `${first.label} to ${last.label}`,
    worse,
  };
}

/** The agency with only the snapshots History shows (#1030). */
function withUsableSnapshots(agency: AgencyHistory): AgencyHistory {
  return { ...agency, routes: agency.routes.map(r => ({ ...r, snapshots: usableSnapshots(r.snapshots) })) };
}

function sortSnapshotsNewestFirst(snapshots: RouteSnapshot[]): RouteSnapshot[] {
  return snapshotsNewestFirst(snapshots);
}

function routeHistorySnapshots(entry: RouteHistoryEntry): {
  newestFirst: RouteSnapshot[];
  oldestFirst: RouteSnapshot[];
} {
  const newestFirst = sortSnapshotsNewestFirst(entry.snapshots);
  return { newestFirst, oldestFirst: [...newestFirst].reverse() };
}

function formatXLabel(label: string): string {
  const match = label.match(/^(?:([A-Za-z]+)\s+)?(\d{4})$/);
  if (match) {
    const month = match[1];
    const year = match[2].slice(2);
    return month ? `${month.slice(0, 3)} '${year}` : `'${year}`;
  }
  return label;
}

function RouteHistoryCard({
  route,
  agencyName,
  agencySlug,
  onBack,
  frameClassName,
  frameStyle,
}: {
  route: RouteHistoryEntry;
  agencyName: string;
  agencySlug: string;
  onBack: () => void;
  /** Placement and fade shared by History's panels (the regular cards' sidebar rule). */
  frameClassName: string;
  frameStyle: React.CSSProperties;
}) {
  const { colorVisionFriendly } = useColorVision();
  const isPhone = useMediaQuery(PHONE_MEDIA_QUERY);
  const sheetMode = FEATURES.mobileRouteSheet && isPhone;
  const { expanded: sheetExpanded, handle: sheetHandle } = useBottomSheet(route.routeShortName);
  const { newestFirst: snaps, oldestFirst: chartSnaps } = routeHistorySnapshots(route);

  function snapHeadway(snap: RouteSnapshot): number {
    return snap.weekdayHeadwayMin;
  }

  const first = snaps[snaps.length - 1];
  const last = snaps[0];
  const firstHw = snapHeadway(first);
  const lastHw = snapHeadway(last);
  const worse = lastHw > firstHw;
  const better = lastHw < firstHw;
  const summary = changeSummary(route);;

  // Sparkline calculations
  const width = 220;
  const height = 75;
  const paddingX = 20;
  const paddingY = 22;

  const minYear = first.year;
  const maxYear = last.year;
  const yearRange = maxYear - minYear || 1;

  const hws = chartSnaps.map(snapHeadway);
  const minHw = Math.min(...hws);
  const maxHw = Math.max(...hws);
  const hwRange = maxHw - minHw || 1;

  const points = chartSnaps.map((snap, i) => {
    const hw = snapHeadway(snap);
    const pctX = (snap.year - minYear) / yearRange;
    const x = paddingX + pctX * (width - 2 * paddingX);

    const pctY = maxHw === minHw ? 0.5 : (hw - minHw) / hwRange;
    const y = height - paddingY - pctY * (height - 2 * paddingY);

    return { x, y, hw, label: snap.label };
  });

  const linePath = 'M ' + points.map(p => `${p.x} ${p.y}`).join(' L ');
  const fillPath = `${linePath} L ${points[points.length - 1].x} ${height - 18} L ${points[0].x} ${height - 18} Z`;

  const lineColor = worse ? (colorVisionFriendly ? '#c44516' : '#ef4444') : better ? (colorVisionFriendly ? '#009e73' : '#10b981') : '#9ca3af';
  // x-axis label visibility: always show first and last; intermediate only if they have clearance
  const labelClearance = 34;
  const labelIndices = new Set<number>([0, points.length - 1]);
  let lastLabelX = points[0]?.x ?? 0;
  for (let i = 1; i < points.length - 1; i++) {
    const hasRoomBefore = points[i].x - lastLabelX >= labelClearance;
    const hasRoomAfter = points[points.length - 1].x - points[i].x >= labelClearance;
    if (hasRoomBefore && hasRoomAfter) {
      labelIndices.add(i);
      lastLabelX = points[i].x;
    }
  }

  return (
    // The regular route card's frame, title and rows (RouteCardTitle, direction rows): the agency name
    // above the title goes back to the agency, as on the map's route card.
    // On phones it opens in the map route card's bottom sheet (#1028 item 23).
    <div className={sheetMode ? `${BOTTOM_SHEET_FRAME} ${frameClassName}` : `${PANEL_SIDEBAR} ${SIDEBAR_PANEL_WIDTH} max-h-[calc(100vh-132px)] flex flex-col ${frameClassName}`} style={sheetMode ? undefined : frameStyle}>
    <div className={sheetMode ? bottomSheetBodyClass(sheetExpanded) : SIDEBAR_CARD_BODY}>
    {sheetMode && <BottomSheetHandle expanded={sheetExpanded} handle={sheetHandle} />}
    <SidebarCardShell>
      <SidebarCardHeaderBlock>
        <div className="flex items-start gap-2">
          <div className="flex-1 min-w-0">
            <RouteCardTitle
              routeShortName={route.routeShortName}
              routeLongName={route.routeName ? titleCase(route.routeName) : null}
              routeType={route.currentRouteType ?? null}
              agencySlug={agencySlug}
              agencyName={agencyName}
              onAgencyClick={onBack}
            />
          </div>
          <CardReportButton
            title={`History: ${agencyName} ${route.routeShortName}`}
            details={`**Agency:** ${agencyName}\n**Agency slug:** ${agencySlug}\n**Route:** ${route.routeShortName}${route.routeName ? ` ${route.routeName}` : ''}\n**Snapshots:** ${snaps.map(s => s.label).join(', ')}\n**Atlas URL:** ${currentAtlasUrl()}`}
            excludeReasons={['Stop is missing, misplaced, or assigned incorrectly']}
          />
        </div>
      </SidebarCardHeaderBlock>

      {/* The frequency chart shows inline, as the route card's hour chart does (#1028 item 10). */}
      {snaps.length >= 2 && (
        <div className="mt-3">
          <div className="w-full bg-[var(--bg-app)] border border-[var(--border-primary)] rounded-xl p-3">
            <svg width="100%" viewBox={`0 0 ${width} ${height}`} className="overflow-visible">
              <defs>
                <linearGradient id={`sparkline-grad-${route.routeShortName}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={lineColor} stopOpacity="0.18" />
                  <stop offset="100%" stopColor={lineColor} stopOpacity="0" />
                </linearGradient>
              </defs>

              <path d={fillPath} fill={`url(#sparkline-grad-${route.routeShortName})`} />

              <path
                d={linePath}
                fill="none"
                stroke={lineColor}
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />

              <line
                x1={points[0].x} y1={height - 18}
                x2={points[points.length - 1].x} y2={height - 18}
                stroke="var(--border-primary)"
                strokeWidth="1"
                strokeDasharray="2 3"
              />

              {points.map((p, i) => {
                const isFirst = i === 0;
                const isLast = i === points.length - 1;
                const showXLabel = labelIndices.has(i);
                const xAnchor = isFirst ? 'start' : isLast ? 'end' : 'middle';
                const xPos = isFirst ? paddingX : isLast ? (width - paddingX) : p.x;
                return (
                  <g key={i}>
                    <circle cx={p.x} cy={p.y} r="3" fill={lineColor} stroke="var(--bg-panel)" strokeWidth="1.5" />
                    <text x={p.x} y={p.y - 7} textAnchor="middle" fontSize="8" fontWeight="700" fill="var(--text-primary)" fontFamily="inherit">
                      {headwayAmount(p.hw)}
                    </text>
                    {showXLabel && (
                      <text x={xPos} y={height - 3} textAnchor={xAnchor} fontSize="7.5" fontWeight="600" fill="var(--text-muted)" fontFamily="inherit">
                        {formatXLabel(p.label)}
                      </text>
                    )}
                  </g>
                );
              })}
            </svg>
          </div>
        </div>
      )}

      <SidebarCardListRows className="mt-3">
        {snaps.map((snap, i) => {
          const hw = snapHeadway(snap);
          const delta = i < snaps.length - 1 ? hw - snapHeadway(snaps[i + 1]) : null;
          return (
            <CardDirectionRow
              key={`${snap.label}-${i}`}
              label={snap.label}
              headway={hw}
              headwaySuffix={delta ? (delta > 0 ? `+${delta}` : `${delta}`) : undefined}
              headwaySuffixTone={delta ? (delta > 0 ? 'negative' : 'positive') : undefined}
            />
          );
        })}
      </SidebarCardListRows>

        {summary && (
          <div className={`mt-3 rounded-xl px-3 py-2.5 ${summary.worse ? 'bg-[var(--status-negative-bg)]' : 'bg-[var(--status-positive-bg)]'}`}>
            <p className={`text-xs font-bold leading-tight ${summary.worse ? 'text-[var(--status-negative-text)]' : 'text-[var(--status-positive-text)]'}`}>{summary.text}</p>
            <p className="text-xs text-[var(--text-muted)] mt-0.5">{summary.subtext}</p>
            <p className="text-xs text-[var(--text-dim)] mt-1">Latest archived snapshot: {last.label}</p>
          </div>
        )}

        {route.tripDuration && (
          <div className={`mt-3 rounded-xl px-3 py-2.5 bg-[var(--bg-app)] border border-[var(--border-primary)]`}>
            <p className="text-xs font-bold leading-tight text-[var(--text-primary)]">
              Trip time: {route.tripDuration.firstMinutes} min ({route.tripDuration.firstLabel}) → {route.tripDuration.lastMinutes} min ({route.tripDuration.lastLabel})
            </p>
            <p className="text-xs text-[var(--text-dim)] mt-1">
              End-to-end scheduled time on a representative weekday trip. Only shown when the route's stops and alignment haven't changed between these years.
            </p>
          </div>
        )}
    </SidebarCardShell>
    </div>
    </div>
  );
}

/** The agency card's top (AgencyCard sets the same 80px over the sidebar default). */
const AGENCY_PANEL_TOP = 80;

/** History's suggestions are recent searches only: its routes have no map keys to suggest. */
const NO_RECENT_ROUTES: RecentRoute[] = [];
const NO_SUGGESTED_ROUTES: SuggestedRoute[] = [];
const NO_ROUTE_PICK = () => {};
const NO_ROUTE_DISPLAY = () => ({}) as RouteListDisplay;

const SINCE_FILTERS = [
  { label: 'All time', year: 0 },
  { label: 'Since 2018', year: 2018 },
  { label: 'Since 2022', year: 2022 },
] as const;

function HistoryAgencyPanel({
  agencyHistory,
  onRouteSelect,
  onBack,
  routeQuery,
  activeFilter,
  setActiveFilter,
  frameClassName,
  frameStyle,
  nameParts,
}: {
  /** The agency's name and place, as the agency card and About list show them. */
  nameParts: { primary: string; secondary?: string };
  agencyHistory: AgencyHistory;
  onRouteSelect: (routeShortName: string) => void;
  /** Back to the agency chooser. */
  onBack: () => void;
  /** The top search bar's text while this agency is open (it searches the agency's routes). Held by History so it can live in the URL. */
  routeQuery: string;
  activeFilter: RouteModeFilterKey | null;
  setActiveFilter: (key: RouteModeFilterKey | null) => void;
  frameClassName: string;
  frameStyle: React.CSSProperties;
}) {
  const tier = agencyHistoryTier(agencyHistory) ?? 'recent';

  const minYear = useMemo(() => {
    const all = agencyHistory.routes.flatMap(r => r.snapshots.map(s => s.year));
    return all.length ? Math.min(...all) : 0;
  }, [agencyHistory]);

  const maxYear = useMemo(() => {
    const all = agencyHistory.routes.flatMap(r => r.snapshots.map(s => s.year));
    return all.length ? Math.max(...all) : 0;
  }, [agencyHistory]);

  const routeRows = useMemo(() => {
    const q = routeQuery.trim().toLowerCase();
    return agencyHistory.routes
      .map(route => {
        if (route.snapshots.length === 0) return null;
        const { newestFirst } = routeHistorySnapshots(route);
        const first = newestFirst[newestFirst.length - 1];
        const last = newestFirst[0];
        const ratio = route.snapshots.length > 1 ? last.weekdayHeadwayMin / first.weekdayHeadwayMin : 1;
        const worse = ratio > 1.05;
        const better = ratio < 0.95;
        return { route, first, last, ratio, worse, better };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null)
      .filter(({ route }) => historyRouteMatchesQuery(route, q))
      .sort((a, b) => {
        // Biggest frequency swing first (worse, then better, then flat)
        if (a.worse && b.worse) return b.ratio - a.ratio;
        if (a.better && b.better) return a.ratio - b.ratio;
        if (a.worse !== b.worse) return a.worse ? -1 : 1;
        if (a.better !== b.better) return a.better ? -1 : 1;
        return 0;
      });
  }, [agencyHistory, routeQuery]);

  const filterRoutes = useMemo(() => agencyHistory.routes.map(route => ({
    routeShortName: route.routeShortName,
    routeLongName: route.routeName,
    routeType: route.currentRouteType,
    busSubType: route.currentBusSubType,
    agencySlug: agencyHistory.slug,
  })), [agencyHistory]);

  const routeFilters = useMemo(() => buildRouteModeFilters(filterRoutes), [filterRoutes]);

  const visibleRouteRows = useMemo(() => {
    if (!activeFilter) return routeRows;
    return routeRows.filter(({ route }) => routeMatchesModeFilter({
      routeShortName: route.routeShortName,
      routeLongName: route.routeName,
      routeType: route.currentRouteType,
      busSubType: route.currentBusSubType,
      agencySlug: agencyHistory.slug,
    }, activeFilter));
  }, [activeFilter, agencyHistory.slug, routeRows]);

  return (
    // The agency card's placement: sidebar Panel, 80px from the top, the search bar's width.
    <Panel sidebar enter className={`max-h-[calc(100vh-104px)] ${frameClassName}`} style={{ ...frameStyle, top: AGENCY_PANEL_TOP }}>
      {/* Header: the agency card's header block, with the route filter and mode pills inside it. */}
      <div className={CARD_HEADER_BLOCK}>
        <div className="flex items-start gap-2 min-w-0">
        <div className="min-w-0 flex-1">
        <CardBackLink onClick={onBack}>Historical service</CardBackLink>
        <h2 className={`${CARD_TITLE} truncate`}>{nameParts.primary}</h2>
        {/* The agency card's summary: the agency's place (not the state), then the counts. */}
        <p className={CARD_SUMMARY}>
          {[nameParts.secondary, countOf(agencyHistory.routes.length, 'route'), minYear === maxYear ? String(minYear) : `${minYear}–${maxYear}`].filter(Boolean).join(' · ')}
        </p>
        {!routeQuery && !activeFilter && (
          <p className="text-xs text-[var(--text-dim)] mt-1">Routes ordered by biggest frequency change</p>
        )}
        </div>
        <CardReportButton
          title={`History: ${agencyHistory.name}`}
          details={`**Agency:** ${agencyHistory.name}\n**Agency slug:** ${agencyHistory.slug}\n**Atlas URL:** ${currentAtlasUrl()}`}
          excludeReasons={['Stop is missing, misplaced, or assigned incorrectly', 'Route line is missing or follows the wrong path']}
        />
        </div>
        {routeFilters.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-2">
            {routeFilters.map(filter => {
              const active = activeFilter === filter.key;
              return (
                <ModeFilterPill
                  key={filter.key}
                  onClick={() => setActiveFilter(active ? null : filter.key)}
                  selected={active}
                  label={filter.label}
                  count={filter.count}
                />
              );
            })}
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar">
        {visibleRouteRows.length === 0 && (
          <PanelEmpty>{routeQuery || activeFilter ? noRoutesMatchText(routeFilters.find(f => f.key === activeFilter)?.label) : NO_ROUTES_LOADED}</PanelEmpty>
        )}
        <CardRouteList
          rows={visibleRouteRows.map(({ route, last }) => ({
            key: route.routeShortName,
            label: routeLabels({ shortName: route.routeShortName, longName: titleCase(route.routeName), routeType: route.currentRouteType ?? undefined, agencySlug: agencyHistory.slug }).text,
            headway: last.weekdayHeadwayMin,
          }))}
          onSelect={onRouteSelect}
        />
      </div>
    </Panel>
  );
}

export default function History({ active, initialAgencySlug, inViewAgencySlugs, onInfoOpen, query, searchFocused, setQuery, pendingRouteClick, onPendingRouteHandled, sidebarLeft, searchBarWidth, agencyCatalog, onOpenAgencyChange, dismissKey = 0, onPanelOpenChange }: Props) {
  // Applies initialAgencySlug (the currently map-selected agency) once per
  // History session, not every time selectedSlug clears -- otherwise a user
  // typing a new search gets raced back to whatever agency the map still
  // has selected, since that prop doesn't change just because the user typed.
  const appliedInitialSlugRef = useRef(false);
  // Shared links: History's view is read from the URL when it opens (here on mount, and below on each later opening).
  const [urlState] = useState<HistoryUrlState | null>(() => (
    active && typeof window !== 'undefined' ? parseHistoryUrlState(window.location.search) : null
  ));
  const [selectedSlug, setSelectedSlug] = useState<string | null>(() => urlState?.agency ?? null);
  const [selectedRouteShortName, setSelectedRouteShortName] = useState<string | null>(() => urlState?.route ?? null);
  const [selectedYear, setSelectedYear] = useState<number>(0);
  // A linked year waits for the agency's years to load; it applies once if that year exists.
  const pendingUrlYearRef = useRef<number>(urlState?.year ?? 0);
  const [regionFilter, setRegionFilter] = useState<Set<string>>(() => new Set(urlState?.regions ?? []));
  const [routeQuery, setRouteQuery] = useState(() => urlState?.routeQuery ?? '');
  const [activeFilter, setActiveFilter] = useState<RouteModeFilterKey | null>(() => (urlState?.routeMode as RouteModeFilterKey | null) ?? null);
  // The city to open on and the agencies in view are read once, as History opens: panning the map
  // while browsing History must not jump to another agency or reorder the list (#1012).
  const openOnSlugRef = useRef<string | null>(active ? initialAgencySlug ?? null : null);
  const [openInView, setOpenInView] = useState<ReadonlySet<string>>(() => new Set(active ? inViewAgencySlugs ?? [] : []));
  // History stays mounted across modes (#888), so each time it opens it re-reads the URL and
  // starts fresh, as the old remount did.
  const wasActiveRef = useRef(active);
  useLayoutEffect(() => {
    if (active && !wasActiveRef.current) {
      const fresh = typeof window !== 'undefined' ? parseHistoryUrlState(window.location.search) : null;
      setSelectedSlug(fresh?.agency ?? null);
      setSelectedRouteShortName(fresh?.route ?? null);
      setSelectedYear(0);
      pendingUrlYearRef.current = fresh?.year ?? 0;
      setRegionFilter(new Set(fresh?.regions ?? []));
      setRouteQuery(fresh?.routeQuery ?? '');
      setActiveFilter((fresh?.routeMode as RouteModeFilterKey | null) ?? null);
      openOnSlugRef.current = initialAgencySlug ?? null;
      setOpenInView(new Set(inViewAgencySlugs ?? []));
    }
    wasActiveRef.current = active;
    // Only the opening moment matters; later changes to these props are ignored on purpose.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);
  const [shouldRender, setShouldRender] = useState(active);
  const [visible, setVisible] = useState(false);
  // Agency name and place from the catalog, by the same rule as the agency card and About list (#1028 items 16-17).
  const catalogBySlug = useMemo(() => new Map((agencyCatalog ?? []).map(a => [a.slug, a])), [agencyCatalog]);
  const agencyNameParts = useCallback((slug: string, fallbackName: string) => {
    const a = catalogBySlug.get(slug);
    return a ? agencyDisplayParts(a.name, a.cities, a.displayArea) : agencyDisplayParts(fallbackName);
  }, [catalogBySlug]);
  const { setOverlay } = useHistoryMapOverlay();
  const [historyData, setHistoryData] = useState<AgencyHistory[] | null>(null);
  const [historyLoadFailed, setHistoryLoadFailed] = useState(false);

  const loadHistoryConfig = useCallback(() => {
    setHistoryLoadFailed(false);
    loadHistoryConfigShared()
      .then(data => {
        setHistoryData(data);
      })
      .catch((err) => {
        console.error("Failed to fetch history config from R2:", err);
        setHistoryData([]);
        setHistoryLoadFailed(true);
      });
  }, []);

  // History stays mounted so mode switches don't remount it, but its multi-megabyte config is only fetched
  // the first time History is actually opened.
  const historyConfigRequested = useRef(false);
  useEffect(() => {
    if (!active || historyConfigRequested.current) return;
    historyConfigRequested.current = true;
    loadHistoryConfig();
  }, [active, loadHistoryConfig]);

  useEffect(() => {
    if (active) {
      setShouldRender(true);
      const id = setTimeout(() => setVisible(true), 10);
      return () => clearTimeout(id);
    } else {
      setVisible(false);
      const id = setTimeout(() => setShouldRender(false), 280);
      return () => clearTimeout(id);
    }
  }, [active]);

  const historyAgencies = useMemo(() => {
    // Snapshots with no label or a future year (bad upstream data) are left out everywhere (#1030).
    return (historyData ?? [])
      .map(withUsableSnapshots)
      .filter(a => a.routes.some(r => r.snapshots.length > 0) && agencyQualifiesForHistory(a));
  }, [historyData]);

  useEffect(() => {
    if (!active) { appliedInitialSlugRef.current = false; return; }
  }, [active]);

  useEffect(() => {
    if (!active) setRegionFilter(new Set());
  }, [active]);

  useEffect(() => {
    const openOn = openOnSlugRef.current;
    if (!active || selectedSlug || !openOn || appliedInitialSlugRef.current) return;
    if (historyAgencies.some(a => a.slug === openOn)) {
      setSelectedSlug(openOn);
      appliedInitialSlugRef.current = true;
    }
  }, [active, historyAgencies, selectedSlug]);

  useEffect(() => {
    if (!active) { setOverlay(null); return; }
    const agency = selectedSlug ? (historyAgencies.find(a => a.slug === selectedSlug) ?? null) : null;
    if (agency?.center) {
      let routeGeometry: number[][] | undefined;
      let historicalRouteGeometries: Array<{routeShortName: string, coordinates: number[][], headway: number}> | undefined;
      if (selectedYear > 0) {
        historicalRouteGeometries = [];
        agency.routes.forEach(route => {
          const snap = route.snapshots.find(s => s.year === selectedYear) || route.snapshots[route.snapshots.length - 1];
          // Older snapshots can hold a bare [lon, lat] from a route with no map shape;
          // only real lines are drawn or used for camera bounds.
          const snapGeometry = isDrawableLineCoordinates(snap?.geometry) ? snap.geometry : undefined;
          if (route.routeShortName === selectedRouteShortName) routeGeometry = snapGeometry;
          if (snap && snapGeometry) {
            historicalRouteGeometries!.push({
              routeShortName: route.routeShortName,
              coordinates: snapGeometry,
              headway: snap.weekdayHeadwayMin
            });
          }
        });
      } else if (selectedRouteShortName) {
        const rt = agency.routes.find(r => r.routeShortName === selectedRouteShortName);
        if (rt && rt.snapshots.length > 0) {
          const latest = rt.snapshots[rt.snapshots.length - 1]?.geometry;
          routeGeometry = isDrawableLineCoordinates(latest) ? latest : undefined;
        }
      }
      setOverlay({
        slug: agency.slug,
        routeShortName: selectedRouteShortName ?? '',
        agencyCenter: agency.center,
        routeGeometry,
        selectedYear: selectedYear > 0 ? selectedYear : undefined,
        historicalRouteGeometries
      });
    } else {
      setOverlay(null);
    }
  }, [active, selectedSlug, selectedRouteShortName, setOverlay, historyAgencies, selectedYear]);

  useEffect(() => { if (!active) setOverlay(null); }, [active, setOverlay]);

  useEffect(() => {
    if (!pendingRouteClick || !historyData) return;
    const { slug, routeShortName } = pendingRouteClick;
    const agency = historyData.find(a => a.slug === slug);
    if (agency) {
      setSelectedSlug(slug);
      setSelectedRouteShortName(routeShortName || null);
    }
    onPendingRouteHandled?.();
  }, [pendingRouteClick, historyData, onPendingRouteHandled]);
  // The top search bar searches agencies on the chooser and the open agency's routes once one is
  // open (#1015). On the chooser a new search clears the selection, as before. Compared with the last
  // value (not skipped once) so a linked selection survives mount, including StrictMode's repeated effects.
  const lastQueryRef = useRef(query);
  useEffect(() => {
    if (lastQueryRef.current === query) return;
    lastQueryRef.current = query;
    if (selectedSlug) {
      setRouteQuery(query);
      return;
    }
    setSelectedSlug(null);
    setSelectedRouteShortName(null);
    // Only the query decides; the selection is read as it stands when the text changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);
  // A linked route search fills the top bar when History opens on that agency.
  const appliedUrlRouteQueryRef = useRef(false);
  useEffect(() => {
    if (!active) { appliedUrlRouteQueryRef.current = false; return; }
    if (appliedUrlRouteQueryRef.current || !selectedSlug || !routeQuery) return;
    appliedUrlRouteQueryRef.current = true;
    if (query !== routeQuery) setQuery(routeQuery);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, selectedSlug]);
  const openAgencyName = useMemo(() => {
    if (!active || !selectedSlug) return null;
    const agency = historyData?.find(a => a.slug === selectedSlug);
    return agency ? shortenAgencyName(agency.name) : null;
  }, [active, selectedSlug, historyData]);
  useEffect(() => { onOpenAgencyChange?.(openAgencyName); }, [openAgencyName, onOpenAgencyChange]);
  // Dismissed from the map (empty-map click, Escape), the panel closes and stays closed until the
  // user searches, picks something or reopens History, as the regular map's card does (#1031).
  const [dismissed, setDismissed] = useState(false);
  const lastDismissKeyRef = useRef(dismissKey);
  useEffect(() => {
    if (lastDismissKeyRef.current === dismissKey) return;
    lastDismissKeyRef.current = dismissKey;
    if (!active) return;
    setSelectedRouteShortName(null);
    setSelectedSlug(null);
    setDismissed(true);
  }, [dismissKey, active]);
  useEffect(() => { if (selectedSlug) setDismissed(false); }, [selectedSlug]);
  useEffect(() => { if (searchFocused) setDismissed(false); }, [searchFocused]);
  // New typing reopens it; the route search being cleared as the panel closes does not.
  useEffect(() => { if (query) setDismissed(false); }, [query]);
  useEffect(() => { if (!active) setDismissed(false); }, [active]);
  useEffect(() => { onPanelOpenChange?.(active && (!!selectedSlug || !dismissed)); }, [active, selectedSlug, dismissed, onPanelOpenChange]);

  // The route search and mode filter belong to one agency's list: they reset when the agency
  // changes or a route opens, as they did when the list kept them itself.
  const lastSelectionRef = useRef({ slug: selectedSlug, route: selectedRouteShortName });
  useEffect(() => {
    const last = lastSelectionRef.current;
    lastSelectionRef.current = { slug: selectedSlug, route: selectedRouteShortName };
    if (last.slug !== selectedSlug || (selectedRouteShortName && last.route !== selectedRouteShortName)) {
      setRouteQuery('');
      setActiveFilter(null);
      // The top bar held the last agency or route search; it starts empty for the new view.
      setQuery('');
    }
  }, [selectedSlug, selectedRouteShortName]);

  // A linked agency that History doesn't have: fall back to the agency chooser.
  useEffect(() => {
    if (!historyData || !selectedSlug) return;
    if (!historyData.some(a => a.slug === selectedSlug)) {
      setSelectedSlug(null);
      setSelectedRouteShortName(null);
    }
  }, [historyData, selectedSlug]);

  const { recentSearches, saveRecentSearch, clearRecentSearches } = useRecentSearches(searchFocused);

  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    return historyAgencies
      .filter(a => !q || a.name.toLowerCase().includes(q) || a.region.toLowerCase().includes(q))
      .filter(a => regionFilter.size === 0 || regionFilter.has(a.region || 'Other'));
  }, [query, historyAgencies, regionFilter]);

  const historyRegions = useMemo(() => {
    const regions = new Set(historyAgencies.map(a => a.region || 'Other'));
    return [...regions].sort(compareRegion);
  }, [historyAgencies]);

  useEffect(() => {
    // Regions are only known once the data loads; a linked filter must not be emptied before then.
    if (regionFilter.size === 0 || historyData === null) return;
    const next = new Set([...regionFilter].filter(region => historyRegions.includes(region)));
    if (next.size !== regionFilter.size) setRegionFilter(next);
  }, [historyRegions, regionFilter, historyData]);

  /** Match the main agency browser: region sections, then alphabetical agencies. */
  const agenciesByRegion = useMemo(() => {
    const map = new Map<string, AgencyHistory[]>();
    for (const agency of filtered) {
      const region = agency.region || 'Other';
      if (!map.has(region)) map.set(region, []);
      map.get(region)!.push(agency);
    }
    for (const agencies of map.values()) {
      agencies.sort((a, b) => compareAgencyName(a.name, b.name) || a.slug.localeCompare(b.slug));
    }
    return inViewFirst([...map.entries()].sort(([a], [b]) => compareRegion(a, b)), openInView);
  }, [filtered, openInView]);

  const availableYears = useMemo(() => {
    if (!selectedSlug) return [];
    const agency = historyAgencies.find(a => a.slug === selectedSlug);
    if (!agency) return [];
    const years = new Set<number>();
    agency.routes.forEach(r => r.snapshots.forEach(s => years.add(s.year)));
    return Array.from(years).sort((a,b) => a-b);
  }, [historyAgencies, selectedSlug]);

  useEffect(() => {
    if (selectedSlug && availableYears.length > 0) {
      const linkedYear = pendingUrlYearRef.current;
      pendingUrlYearRef.current = 0;
      setSelectedYear(availableYears.includes(linkedYear) ? linkedYear : availableYears[availableYears.length - 1]);
    } else {
      // Once the data is in, a linked year that never matched is dropped.
      if (historyData !== null) pendingUrlYearRef.current = 0;
      setSelectedYear(0);
    }
  }, [selectedSlug, availableYears, historyData]);

  // Keep the URL in step so the page link reproduces this view. Waits for the data so the
  // linked values (and the default year, the newest one) are known before anything is rewritten.
  const latestYear = availableYears.length ? availableYears[availableYears.length - 1] : 0;
  const regionList = useMemo(() => [...regionFilter].sort(), [regionFilter]);
  useEffect(() => {
    if (!active || historyData === null) return;
    syncUrlParams(encodeHistoryUrlState({
      agency: selectedSlug,
      route: selectedRouteShortName,
      year: pendingUrlYearRef.current || selectedYear,
      regions: regionList,
      routeQuery,
      routeMode: activeFilter,
    }, latestYear));
  }, [active, historyData, selectedSlug, selectedRouteShortName, selectedYear, latestYear, regionList, routeQuery, activeFilter]);


  if (!shouldRender) return null;

  const showScrubber = selectedSlug && availableYears.length > 1;
  const showAgencyChooser = active && !selectedSlug && !dismissed;
  const showRecentSearches = searchFocused && query === '' && recentSearches.length > 0;
  const panelInteractive = Boolean(selectedSlug || showAgencyChooser || searchFocused);
  // Placement shared by History's panels, by the regular cards' rule: anchored under the search bar
  // at its width on desktop (#1033 parity B). Each panel adds its own top, as its regular card does.
  const frameStyle = {
    '--sidebar-left': `${sidebarLeft ?? SIDEBAR_LEFT_FALLBACK}px`,
    ...(searchBarWidth ? { width: `${searchBarWidth}px`, maxWidth: 'none' } : {}),
  } as React.CSSProperties;
  const frameClassName = `transition-opacity ${TRANSITION_SLOW} ${visible ? 'opacity-100' : 'opacity-0 pointer-events-none'} ${!panelInteractive ? 'pointer-events-none' : ''}`;

  return (
    <>
        {selectedSlug ? (
        (() => {
          const agencyHistory = historyAgencies.find(a => a.slug === selectedSlug)
            ?? (() => { const raw = historyData?.find(a => a.slug === selectedSlug); return raw ? withUsableSnapshots(raw) : null; })();
          if (!agencyHistory) return null;
          if (selectedRouteShortName) {
            const selectedRoute = agencyHistory.routes.find(r => r.routeShortName === selectedRouteShortName) ?? null;
            if (selectedRoute && selectedRoute.snapshots.length > 0) {
              return (
                <RouteHistoryCard
                  route={selectedRoute}
                  agencyName={agencyHistory.name}
                  agencySlug={agencyHistory.slug}
                  onBack={() => setSelectedRouteShortName(null)}
                  frameClassName={frameClassName}
                  frameStyle={frameStyle}
                />
              );
            }
          }
          return (
            <HistoryAgencyPanel
              agencyHistory={agencyHistory}
              onRouteSelect={setSelectedRouteShortName}
              onBack={() => { setSelectedSlug(null); setSelectedRouteShortName(null); }}
              routeQuery={routeQuery}
              activeFilter={activeFilter}
              setActiveFilter={setActiveFilter}
              frameClassName={frameClassName}
              frameStyle={frameStyle}
              nameParts={agencyNameParts(agencyHistory.slug, agencyHistory.name)}
            />
          );
        })()
        ) : showRecentSearches ? (
        // Recent searches: the map's shared suggestions panel, where the map shows it (#1028 item 22).
        <div className={`${PANEL_SIDEBAR} ${SIDEBAR_PANEL_WIDTH} max-h-[calc(100vh-132px)] flex flex-col ${frameClassName}`} style={frameStyle} onMouseDown={e => e.preventDefault()}>
          <SearchSuggestionsPanel
            recentSearches={recentSearches}
            clearRecentSearches={clearRecentSearches}
            setQuery={setQuery}
            recentlyViewed={NO_RECENT_ROUTES}
            suggestedRoutes={NO_SUGGESTED_ROUTES}
            pickRoute={NO_ROUTE_PICK}
            displayForRouteKey={NO_ROUTE_DISPLAY}
          />
        </div>
        ) : (
        <Panel
          sidebar
          className={`max-h-[calc(100vh-104px)] overflow-y-auto custom-scrollbar ${frameClassName} ${showAgencyChooser || searchFocused ? '' : 'opacity-0 pointer-events-none'}`}
          style={{ ...frameStyle, top: AGENCY_PANEL_TOP }}
          onMouseDown={e => e.preventDefault()}
        >
          <PanelTitleBar>
            <HistoryIcon className="w-3 h-3 text-[var(--text-dim)] shrink-0" />
            <span className={PANEL_TITLE}>Historical service</span>
          </PanelTitleBar>
          {(
            <>
              {historyData !== null && !historyLoadFailed && (
                <div className={AGENCY_LIST_FILTERS}>
                  <div className={PILL_SCROLL_ROW} style={{ scrollbarWidth: 'none' }}>
                  <RegionFilterPills
                    regions={historyRegions}
                    selectedRegions={regionFilter}
                    setSelectedRegions={setRegionFilter}
                  />
                  </div>
                </div>
              )}
              {historyData === null && (
                <PanelEmpty kind="loading">{loadingText('history data')}</PanelEmpty>
              )}
              {historyData !== null && historyLoadFailed && (
                <PanelEmpty
                  kind="error"
                  action={<ArrowLink as="button" tone="inline" size="xs" onClick={loadHistoryConfig} className="shrink-0 whitespace-nowrap">Retry</ArrowLink>}
                >
                  {loadErrorText('history data')} {RETRY_HINT}
                </PanelEmpty>
              )}
              {historyData !== null && !historyLoadFailed && agenciesByRegion.length === 0 && (
                <PanelEmpty>No agencies match.</PanelEmpty>
              )}
              {agenciesByRegion.length > 0 && (
                <AgencyList>
                  {agenciesByRegion.map(([region, agencies]) => (
                    <AgencyRegionSection key={region} region={region}>
                      {agencies.map(agency => (
                        <AgencyListRow
                          key={agency.slug}
                          {...agencyNameParts(agency.slug, agency.name)}
                          title={agency.name}
                          onClick={() => {
                            saveRecentSearch(query);
                            setSelectedSlug(agency.slug);
                          }}
                        />
                      ))}
                    </AgencyRegionSection>
                  ))}
                </AgencyList>
              )}
            </>
          )}
        </Panel>
      )}

      {showScrubber && (
        <div
          className={`absolute bottom-6 right-14 ${Z_PANEL} w-[260px] h-8 flex items-center gap-2 px-2.5 rounded-full bg-[var(--bg-panel)] border border-[var(--border-primary)] shadow-lg backdrop-blur-md text-xs`}
          title="Older to newer"
          onPointerDown={event => event.stopPropagation()}
          onPointerMove={event => event.stopPropagation()}
          onWheel={event => event.stopPropagation()}
        >
            <span className="text-xs font-bold text-[var(--text-dim)] tabular-nums">{availableYears[0]}</span>
            <input
              type="range"
              min={0}
              max={availableYears.length - 1}
              step={1}
              value={Math.max(0, availableYears.indexOf(selectedYear))}
              onChange={e => setSelectedYear(availableYears[Number(e.target.value)])}
              aria-label="History year"
              className="time-scrubber-range flex-1 min-w-0"
            />
            {/* The latest year shows once: while the chip is on it, the end label is left out (CIV-400, CIV-444). */}
            {selectedYear !== availableYears[availableYears.length - 1] && (
              <span className="text-xs font-bold text-[var(--text-dim)] tabular-nums">{availableYears[availableYears.length - 1]}</span>
            )}
            <span className="rounded-md bg-[var(--accent-bg)] border border-[var(--accent-border)] px-1.5 py-0.5 text-xs font-black text-[var(--text-primary)] tabular-nums">{selectedYear}</span>
        </div>
      )}
    </>
  );
}
