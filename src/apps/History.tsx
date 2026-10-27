import React, { useState, useEffect, useMemo, useCallback, useRef, useLayoutEffect, useId } from 'react';
import { loadHistoryConfig as loadHistoryConfigShared } from '../utils/historyConfig';
import { History as HistoryIcon } from 'lucide-react';
import { useHistoryMapOverlay } from '../context/HistoryMapOverlay';
import { type HeadwayByPeriod } from '../../shared/config';
import type { HistorySnapshotV2 } from '../../shared/historyV2';
import { countOf } from '../../shared/overflowText';
import { isDrawableLineCoordinates } from '../../shared/routeGeometry';
import { TRANSITION_BASE, AGENCY_LIST_FILTERS, PILL_SURFACE, CONTROL_ACTIVE, PILL_SCROLL_ROW, PANEL_TITLE, SIDEBAR_CARD, SIDEBAR_CARD_MAX_H, sidebarFrameStyle, SIDEBAR_PANEL_WIDTH, Z_PANEL, CARD_NOTICE, CARD_NOTE } from '../styles';
import { routeLabels, titleCase, agencyNames, agencyNameParts as nameParts } from '../utils/format';
import CardRouteList from '../components/Interval/CardRouteList';
import { AgencyCardTop, CARD_CALLOUT_HEADLINE, CARD_CALLOUT_TEXT, CARD_HEADER_BLOCK, CardCallout, CARD_CALLOUT_SURFACE, CardDirectionRow, CardReportButton, SIDEBAR_CARD_BODY, SidebarCardHeaderBlock, SidebarCardListRows, SidebarCardShell } from '../components/Interval/cardUi';
import RouteCardTitle from '../components/RouteCardTitle';
import { SearchSuggestionsPanel, type RecentRoute, type SuggestedRoute } from '../components/Interval/SearchSuggestionsPanel';
import type { RouteListDisplay } from '../utils/effectiveHeadway';
import { useRecentSearches } from '../hooks/useRecentSearches';
import { useFadePresence } from '../hooks/useFadePresence';
import { PHONE_MEDIA_QUERY, useMediaQuery } from '../hooks/useMediaQuery';
import { FEATURES } from '../../shared/config';
import { bottomSheetFrameClass, BottomSheetHandle, bottomSheetBodyClass, useBottomSheet } from '../components/ui/BottomSheet';
import { historyRouteMatchesQuery } from '../utils/historyRouteSearch';
import { snapshotsNewestFirst, usableSnapshots } from '../utils/historySnapshots';
import { buildRouteModeFilters, routeMatchesModeFilter, type RouteModeFilterKey } from '../utils/routeModeFilters';
import { useColorMode } from '../hooks/useColorMode';
import { loadHistoryAgencyV2, loadHistoryShapesV2 } from '../utils/historyV2Loader';
import { routesForYear, snapshotValue, yearsAvailable, type HistoryShapesFile } from '../../shared/historyV2Reader';
import { HISTORY_VIEW_ALL, historyPeriodValue, historyYearRoutes, passesHistoryLimit, type HistoryView } from '../utils/historyYearMap';
import type { TimePeriod } from '../hooks/useIntervalStats';
import { labelsThatFit } from '../utils/chartLabels';
import RegionFilterPills from '../components/RegionFilterPills';
import {
  agencyHistoryTier,
  agencyQualifiesForHistory,
  type HistoryTier,
} from '../../shared/historyEligibility';
import { capitalizeFirst, headwayAbout, headwayAboutMinutes, runTimeAmount } from '../utils/headwayText';
import { historyChartPositions } from '../utils/historyChart';
import Panel, { PanelBody, PanelTitleBar } from '../components/ui/Panel';
import ListRow from '../components/ui/ListRow';
import { AgencyList, AgencyListRow, AgencyRegionSection } from '../components/ui/AgencyList';
import ArrowLink from '../components/ui/ArrowLink';
import { reportDetails } from '../utils/reportIssue';
import ModeFilterPillRow from '../components/ui/ModeFilterPillRow';
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
  /** History's Frequency and Time (top-bar chips, held by App): the map, the year list and an opened route follow them. */
  view?: HistoryView;
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

/** A snapshot's minutes in the chosen period, or null when it has no value there (never guessed). */
function periodMinutes(snapshot: RouteSnapshot, period: TimePeriod): number | null {
  const value = historyPeriodValue(snapshot, period);
  return value.kind === 'value' ? value.min : null;
}

function changeSummary(entry: RouteHistoryEntry, period: TimePeriod = 'all'): { text: string; subtext: string; worse: boolean } | null {
  // Only snapshots with a value in the period take part (CIV-389).
  const snaps = sortSnapshotsNewestFirst(entry.snapshots).filter(s => periodMinutes(s, period) != null);
  if (snaps.length < 2) return null;
  const first = snaps[snaps.length - 1];
  const last = snaps[0];
  // Only a change across calendar years gets the box; schedules from the same year show just the rows.
  if (first.year === last.year) return null;
  // Rounded as the rows round them (#1085), so the box and the rows never give two numbers for one snapshot.
  const fHw = headwayAboutMinutes(periodMinutes(first, period)!);
  const lHw = headwayAboutMinutes(periodMinutes(last, period)!);
  if (Math.abs(fHw - lHw) < 2) return null;
  const worse = lHw > fHw;
  return {
    text: `${capitalizeFirst(headwayAbout(fHw))} → ${headwayAbout(lHw)}`,
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
  sheetVisible,
  period,
}: {
  /** The Time chip's period: the rows, chart and summary read that period's values (CIV-389). */
  period: TimePeriod;
  route: RouteHistoryEntry;
  agencyName: string;
  agencySlug: string;
  onBack: () => void;
  /** Placement and fade shared by History's panels (the regular cards' sidebar rule). */
  frameClassName: string;
  frameStyle: React.CSSProperties;
  /** Whether History's panels are showing; the phone sheet uses it in place of frameClassName's fade. */
  sheetVisible: boolean;
}) {
  const isPhone = useMediaQuery(PHONE_MEDIA_QUERY);
  // The sheet opens like the map's route sheet: it fades and slides up when a route is picked
  // (this card mounts) and when History opens, and slides back down when History closes.
  const { visible: sheetEntered } = useFadePresence(true);
  const sheetMode = FEATURES.mobileRouteSheet && isPhone;
  const { expanded: sheetExpanded, handle: sheetHandle } = useBottomSheet(route.routeShortName);
  // The chart fill's gradient id. Not the route name: a name with a space ("Local Weekday") made
  // url(#…) invalid, so the fill fell back to solid black. Only letters, digits, - and _ are kept.
  const gradientId = `sparkline-grad-${useId().replace(/[^A-Za-z0-9_-]/g, '')}`;
  const { newestFirst: snaps } = routeHistorySnapshots(route);
  // The chart and summary use the snapshots with a value in the period; rows list every snapshot.
  const valued = snaps.filter(s => periodMinutes(s, period) != null);
  const chartSnaps = [...valued].reverse();
  const snapHeadway = (snap: RouteSnapshot): number => periodMinutes(snap, period) ?? NaN;

  const first = valued[valued.length - 1] ?? snaps[snaps.length - 1];
  const last = valued[0] ?? snaps[0];
  // The line's colour follows the same rounded values as the rows and the summary (#1085).
  const firstHw = headwayAboutMinutes(snapHeadway(first));
  const lastHw = headwayAboutMinutes(snapHeadway(last));
  const worse = lastHw > firstHw;
  const better = lastHw < firstHw;
  const summary = changeSummary(route, period);

  // Sparkline calculations
  const width = 220;
  const height = 75;
  const paddingX = 20;
  const paddingY = 22;

  // Each point at its month, not its year, so a route's snapshots from one year spread out (CIV-924).
  const positions = historyChartPositions(chartSnaps);

  const hws = chartSnaps.map(snapHeadway);
  const minHw = Math.min(...hws);
  const maxHw = Math.max(...hws);
  const hwRange = maxHw - minHw || 1;

  const points = chartSnaps.map((snap, i) => {
    const hw = snapHeadway(snap);
    const pctX = positions[i];
    const x = paddingX + pctX * (width - 2 * paddingX);

    const pctY = maxHw === minHw ? 0.5 : (hw - minHw) / hwRange;
    const y = height - paddingY - pctY * (height - 2 * paddingY);

    return { x, y, hw, label: snap.label };
  });

  const linePath = 'M ' + points.map(p => `${p.x} ${p.y}`).join(' L ');
  const fillPath = points.length ? `${linePath} L ${points[points.length - 1].x} ${height - 18} L ${points[0].x} ${height - 18} Z` : '';

  // The status tokens follow the colour-vision setting on their own (index.css).
  const lineColor = worse ? 'var(--status-negative)' : better ? 'var(--status-positive)' : '#9ca3af';
  // Labels that fit (#1037): x-axis labels need 34 units across; value labels ("30 min", about 26
  // units wide and 8 tall) skip one that would sit on another, e.g. two snapshots in the same month.
  // The first and last x labels are drawn against the chart's edges, so they are checked where they are drawn
  // (CIV-924: "Oct '13" ran into "Aug '16"), and a month already labelled isn't labelled again.
  const X_LABEL_WIDTH = 34;
  const xLabelCentres = points.map((p, i) => ({
    x: i === 0 ? paddingX + X_LABEL_WIDTH / 2 : i === points.length - 1 ? width - paddingX - X_LABEL_WIDTH / 2 : p.x,
    y: 0,
  }));
  const labelIndices = new Set<number>();
  const labelled = new Set<string>();
  // The ends first, so a month at the right edge is labelled there rather than at an earlier point.
  const edgesFirst = (i: number) => (i === 0 ? -2 : i === points.length - 1 ? -1 : i);
  for (const i of [...labelsThatFit(xLabelCentres, X_LABEL_WIDTH)].sort((a, b) => edgesFirst(a) - edgesFirst(b))) {
    const text = formatXLabel(points[i].label);
    if (labelled.has(text)) continue;
    labelled.add(text);
    labelIndices.add(i);
  }
  const valueLabelIndices = labelsThatFit(points.map(p => ({ x: p.x, y: p.y - 7 })), 28, 9);

  return (
    // The regular route card's frame, title and rows (RouteCardTitle, direction rows): the agency name
    // above the title goes back to the agency, as on the map's route card.
    // On phones it opens in the map route card's bottom sheet (#1028 item 23).
    <div className={sheetMode ? bottomSheetFrameClass(sheetVisible && sheetEntered) : `${SIDEBAR_CARD} ${SIDEBAR_PANEL_WIDTH} ${SIDEBAR_CARD_MAX_H} flex flex-col ${frameClassName}`} style={sheetMode ? undefined : frameStyle}>
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
              agencyBackLink
            />
          </div>
          <CardReportButton
            title={`History: ${agencyName} ${route.routeShortName}`}
            details={reportDetails([
              ['Agency', agencyName],
              ['Agency slug', agencySlug],
              ['Route', `${route.routeShortName}${route.routeName ? ` ${route.routeName}` : ''}`],
              ['Snapshots', snaps.map(s => s.label).join(', ')],
            ])}
            excludeReasons={['Stop is missing, misplaced, or assigned incorrectly']}
          />
        </div>
      </SidebarCardHeaderBlock>

      {/* The frequency chart shows inline, as the route card's hour chart does (#1028 item 10). */}
      {chartSnaps.length >= 2 && (
        <div className="mt-3">
          {/* The callout surface with the chart's own p-3 (CARD_CALLOUT's px-3 py-2.5 would make it shorter). */}
          <div className={`w-full ${CARD_CALLOUT_SURFACE} p-3`}>
            <svg width="100%" viewBox={`0 0 ${width} ${height}`} className="overflow-visible">
              <defs>
                <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" style={{ stopColor: lineColor }} stopOpacity="0.18" />
                  <stop offset="100%" style={{ stopColor: lineColor }} stopOpacity="0" />
                </linearGradient>
              </defs>

              <path d={fillPath} fill={`url(#${gradientId})`} />

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
                    {valueLabelIndices.has(i) && (
                      <text x={p.x} y={p.y - 7} textAnchor="middle" fontSize="8" fontWeight="700" fill="var(--text-primary)" fontFamily="inherit">
                        {`${headwayAboutMinutes(p.hw)} min`}
                      </text>
                    )}
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
          const hw = periodMinutes(snap, period);
          const older = i < snaps.length - 1 ? periodMinutes(snaps[i + 1], period) : null;
          const delta = hw != null && older != null ? hw - older : null;
          return (
            <CardDirectionRow
              key={`${snap.label}-${i}`}
              label={snap.label}
              headway={hw ?? undefined}
              headwaySuffix={delta ? (delta > 0 ? `+${delta}` : `${delta}`) : undefined}
              headwaySuffixTone={delta ? (delta > 0 ? 'negative' : 'positive') : undefined}
              // Regular weight, like the map cards' destination rows (CIV-971).
              labelWeight="regular"
            />
          );
        })}
      </SidebarCardListRows>

        {summary && (
          <CardCallout tone={summary.worse ? 'negative' : 'positive'} className="mt-3">
            {/* The shared callout headline in the summary's better or worse colour (CIV-971). */}
            <p className={`${CARD_CALLOUT_HEADLINE} ${summary.worse ? '!text-[var(--status-negative-text)]' : '!text-[var(--status-positive-text)]'}`}>{summary.text}</p>
            <p className={CARD_CALLOUT_TEXT}>{summary.subtext}</p>
            <p className={`${CARD_NOTICE} mt-1`}>Latest archived snapshot: {last.label}</p>
          </CardCallout>
        )}

        {route.tripDuration && (
          <CardCallout className="mt-3">
            <p className={CARD_CALLOUT_HEADLINE}>
              Trip time: {runTimeAmount(route.tripDuration.firstMinutes)} ({route.tripDuration.firstLabel}) → {runTimeAmount(route.tripDuration.lastMinutes)} ({route.tripDuration.lastLabel})
            </p>
            <p className={`${CARD_NOTICE} mt-1`}>
              End-to-end scheduled time on a representative weekday trip. Only shown when the route's stops and alignment haven't changed between these years.
            </p>
          </CardCallout>
        )}
    </SidebarCardShell>
    </div>
    </div>
  );
}

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
  selectedYear,
  view,
}: {
  /** The Time and Frequency chips: the list shows the period's values and only routes within the limit. */
  view: HistoryView;
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
  /** The slider's year: the list shows that year's routes and values, as the map does (CIV-457). */
  selectedYear: number;
}) {
  const tier = agencyHistoryTier(agencyHistory) ?? 'recent';
  // The year's routes, each with its one snapshot that year (routesForYear, the map's source).
  const yearRoutes = useMemo(
    () => (selectedYear > 0 ? routesForYear<RouteSnapshot, RouteHistoryEntry>(agencyHistory, selectedYear) : []),
    [agencyHistory, selectedYear],
  );

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
    // "Biggest change" order as before, among the routes that ran in the selected year.
    return yearRoutes
      // Only routes within the Frequency limit in the chosen period, as on the map (CIV-392).
      .filter(({ snapshot }) => passesHistoryLimit(historyPeriodValue(snapshot, view.period), view.maxHeadway))
      .map(({ route, snapshot: yearSnapshot }) => {
        if (route.snapshots.length === 0) return null;
        const valued = routeHistorySnapshots(route).newestFirst.filter(s => periodMinutes(s, view.period) != null);
        const first = valued[valued.length - 1];
        const last = valued[0];
        const ratio = valued.length > 1 ? periodMinutes(last, view.period)! / periodMinutes(first, view.period)! : 1;
        const worse = ratio > 1.05;
        const better = ratio < 0.95;
        return { route, first, last, ratio, worse, better, yearSnapshot };
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
  }, [yearRoutes, routeQuery, view]);

  const filterRoutes = useMemo(() => yearRoutes.map(({ route }) => ({
    routeShortName: route.routeShortName,
    routeLongName: route.routeName,
    routeType: route.currentRouteType,
    busSubType: route.currentBusSubType,
    agencySlug: agencyHistory.slug,
  })), [yearRoutes, agencyHistory.slug]);

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
    <Panel sidebar enter className={frameClassName} style={frameStyle}>
      {/* Header: the agency card's header block, with the route filter and mode pills inside it. */}
      <div className={CARD_HEADER_BLOCK}>
        <AgencyCardTop
          as="h2"
          name={nameParts.primary}
          place={nameParts.secondary}
          back={{ to: 'All agencies', onClick: onBack }}
          facts={[countOf(agencyHistory.routes.length, 'route'), minYear === maxYear ? String(minYear) : `${minYear}–${maxYear}`].join(' · ')}
          report={(
            <CardReportButton
              title={`History: ${agencyHistory.name}`}
              details={reportDetails([['Agency', agencyHistory.name], ['Agency slug', agencyHistory.slug]])}
              excludeReasons={['Stop is missing, misplaced, or assigned incorrectly', 'Route line is missing or follows the wrong path']}
            />
          )}
        >
          {!routeQuery && !activeFilter && (
            <p className={`${CARD_NOTICE} mt-1`}>Biggest changes first</p>
          )}
        </AgencyCardTop>
        {routeFilters.length > 0 && (
          <ModeFilterPillRow filters={routeFilters} selected={activeFilter} onSelect={setActiveFilter} />
        )}
      </div>

      <PanelBody>
        {visibleRouteRows.length === 0 && (
          <PanelEmpty>{routeQuery || activeFilter ? noRoutesMatchText(routeFilters.find(f => f.key === activeFilter)?.label) : NO_ROUTES_LOADED}</PanelEmpty>
        )}
        <CardRouteList
          rows={visibleRouteRows.map(({ route, yearSnapshot }) => {
            // That year's weekday value: a number, limited, or unknown (no badge), never guessed.
            const value = historyPeriodValue(yearSnapshot, view.period);
            // The change from the route's previous snapshot, as on the route view's rows (numbers only).
            const oldestFirst = routeHistorySnapshots(route).oldestFirst;
            const previous = oldestFirst[oldestFirst.indexOf(yearSnapshot) - 1];
            const before = previous ? historyPeriodValue(previous, view.period) : null;
            const delta = value.kind === 'value' && before?.kind === 'value' ? value.min - before.min : 0;
            return {
              key: route.routeShortName,
              route: routeLabels({ shortName: route.routeShortName, longName: titleCase(route.routeName), routeType: route.currentRouteType ?? undefined, agencySlug: agencyHistory.slug }),
              headway: value.kind === 'value' ? value.min : undefined,
              limited: value.kind === 'limited',
              headwaySuffix: delta ? (delta > 0 ? `+${delta}` : `${delta}`) : undefined,
              headwaySuffixTone: delta ? (delta > 0 ? 'negative' as const : 'positive' as const) : undefined,
            };
          })}
          onSelect={onRouteSelect}
        />
      </PanelBody>
    </Panel>
  );
}

export default function History({ active, view = HISTORY_VIEW_ALL, initialAgencySlug, inViewAgencySlugs, onInfoOpen, query, searchFocused, setQuery, pendingRouteClick, onPendingRouteHandled, sidebarLeft, searchBarWidth, agencyCatalog, onOpenAgencyChange, dismissKey = 0, onPanelOpenChange }: Props) {
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
  // Fades in and out with the map's sidebar card (200ms).
  const { mounted: shouldRender, visible } = useFadePresence(active);
  // Agency name and place from the catalog, by the same rule as the agency card and About list (#1028 items 16-17).
  const catalogBySlug = useMemo(() => new Map((agencyCatalog ?? []).map(a => [a.slug, a])), [agencyCatalog]);
  const agencyNameParts = useCallback((slug: string, fallbackName: string) => {
    const a = catalogBySlug.get(slug);
    return a ? nameParts({ name: a.name, cities: a.cities, displayArea: a.displayArea }) : nameParts(fallbackName);
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

  // The open agency, validated by the v2 reader (one result for the panel, slider and map, #1028
  // batch A). In fixture mode the agency file carries only routes, so the name, region and centre
  // come from the History list. A file that fails to parse shows an error, never partial data.
  const [openAgency, setOpenAgency] = useState<{ slug: string; agency: AgencyHistory | null; shapes: HistoryShapesFile | null } | null>(null);
  useEffect(() => {
    if (!selectedSlug || historyData === null) { setOpenAgency(null); return; }
    let cancelled = false;
    const slug = selectedSlug;
    const base = historyData.find(a => a.slug === slug);
    // The per-year shapes file loads with it (CIV-456). Without one (not published, or unreadable)
    // the year's routes draw on today's map lines; that isn't an error.
    Promise.all([loadHistoryAgencyV2<RouteSnapshot>(slug), loadHistoryShapesV2(slug)]).then(([result, shapes]) => {
      if (cancelled) return;
      if (!result.ok) { setOpenAgency({ slug, agency: null, shapes: null }); return; }
      const merged = { ...base, ...result.value, name: base?.name ?? slug, region: base?.region ?? '', center: base?.center } as AgencyHistory;
      setOpenAgency({ slug, agency: withUsableSnapshots(merged), shapes: shapes.ok ? shapes.value : null });
    });
    return () => { cancelled = true; };
  }, [selectedSlug, historyData]);
  const openAgencyHistory = openAgency?.slug === selectedSlug ? openAgency.agency : null;
  const openAgencyShapes = openAgency?.slug === selectedSlug ? openAgency.shapes : null;
  const openAgencyFailed = openAgency?.slug === selectedSlug && openAgency.agency === null;

  // The map draws the selected year's routes only (routesForYear: no fallback to another year),
  // coloured by that year's weekday value (historyYearRoutes).
  const historyColorMode = useColorMode();
  useEffect(() => {
    if (!active) { setOverlay(null); return; }
    const agency = openAgencyHistory;
    if (!agency) { setOverlay(null); return; }
    const latestYear = yearsAvailable(agency).at(-1);
    const yearRoutes = selectedYear > 0 ? historyYearRoutes(agency, selectedYear, historyColorMode, view, openAgencyShapes, latestYear) : [];
    setOverlay({
      slug: agency.slug,
      routeShortName: selectedRouteShortName ?? '',
      agencyCenter: agency.center,
      routeGeometry: yearRoutes.find(r => r.routeShortName === selectedRouteShortName)?.coordinates,
      selectedYear: selectedYear > 0 ? selectedYear : undefined,
      yearRoutes,
    });
  }, [active, openAgencyHistory, openAgencyShapes, selectedRouteShortName, setOverlay, selectedYear, historyColorMode, view]);

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
    return agency ? agencyNames(agency.name).short : null;
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

  // Slider stops: the years with a snapshot (yearsAvailable); the latest is the default stop.
  const availableYears = useMemo(() => (openAgencyHistory ? yearsAvailable(openAgencyHistory) : []), [openAgencyHistory]);

  useEffect(() => {
    if (selectedSlug && availableYears.length > 0) {
      const linkedYear = pendingUrlYearRef.current;
      pendingUrlYearRef.current = 0;
      setSelectedYear(availableYears.includes(linkedYear) ? linkedYear : availableYears[availableYears.length - 1]);
    } else {
      // Once the data is in (and the open agency has loaded or failed), a linked year that never
      // matched is dropped.
      const agencyResolved = !selectedSlug || openAgency?.slug === selectedSlug;
      if (historyData !== null && agencyResolved) pendingUrlYearRef.current = 0;
      setSelectedYear(0);
    }
  }, [selectedSlug, availableYears, historyData, openAgency]);

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
  const frameStyle = sidebarFrameStyle(sidebarLeft, searchBarWidth);
  const frameClassName = `transition-opacity ${TRANSITION_BASE} ${visible ? 'opacity-100' : 'opacity-0 pointer-events-none'} ${!panelInteractive ? 'pointer-events-none' : ''}`;

  return (
    <>
        {selectedSlug ? (
        (() => {
          if (openAgencyFailed) {
            return (
              <Panel sidebar style={frameStyle} className={frameClassName}>
                <PanelEmpty kind="error">{loadErrorText('history data')}</PanelEmpty>
              </Panel>
            );
          }
          const agencyHistory = openAgencyHistory;
          if (!agencyHistory) {
            return (
              <Panel sidebar style={frameStyle} className={frameClassName}>
                <PanelEmpty kind="loading">{loadingText('history data')}</PanelEmpty>
              </Panel>
            );
          }
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
                  sheetVisible={visible}
                  period={view.period}
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
              selectedYear={selectedYear}
              view={view}
            />
          );
        })()
        ) : showRecentSearches ? (
        // Recent searches: the map's shared suggestions panel, where the map shows it (#1028 item 22).
        <div className={`${SIDEBAR_CARD} ${SIDEBAR_PANEL_WIDTH} ${SIDEBAR_CARD_MAX_H} flex flex-col ${frameClassName}`} style={frameStyle} onMouseDown={e => e.preventDefault()}>
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
          className={`overflow-y-auto custom-scrollbar ${frameClassName} ${showAgencyChooser || searchFocused ? '' : 'opacity-0 pointer-events-none'}`}
          style={frameStyle}
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
          className={`absolute bottom-6 right-14 ${Z_PANEL} w-[260px] ${PILL_SURFACE} gap-2 px-2.5 text-xs`}
          title="Older to newer"
          onPointerDown={event => event.stopPropagation()}
          onPointerMove={event => event.stopPropagation()}
          onWheel={event => event.stopPropagation()}
        >
            <span className={`${CARD_NOTE} tabular-nums`}>{availableYears[0]}</span>
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
              <span className={`${CARD_NOTE} tabular-nums`}>{availableYears[availableYears.length - 1]}</span>
            )}
            <span className={`rounded-md border ${CONTROL_ACTIVE} px-1.5 py-0.5 text-xs font-black tabular-nums`}>{selectedYear}</span>
        </div>
      )}
    </>
  );
}
