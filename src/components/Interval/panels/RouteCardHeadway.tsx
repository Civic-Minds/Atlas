import React from 'react';
import type { ShapeProperties, TimePeriod, HoveredBranch } from '../../../hooks/useIntervalStats';
import { routePatternLabel } from '../../../utils/routePattern';
import type { Agency } from '../../../App';
import type { OpenInfoFn } from '../../InfoPanel';
import type { HeadwayByPeriod } from '../../../hooks/useAgencyData';
import { titleCase, getRouteLabel, shortenAgencyName, resolveBranchLabel, formatBranchLabel } from '../../../utils/format';
import { HeadwaySparkline } from '../HeadwaySparkline';
import { getCachedAgencyGeo } from '../../../lib/agencyGeo';
import { tripTimeSeriesFor, type PublishedRunningTimes } from '../../../utils/tripTime';
import RouteCardTitle from '../../RouteCardTitle';
import {
  CardDirectionRow,
  CardDivider,
  CardSectionLabel,
  CardHelpNotice,
  SidebarCardHeaderBlock,
  SidebarCardList,
  SidebarCardShell,
  CardReportButton,
  FlaggableValue,
  type CardReportButtonHandle,
} from '../cardUi';
import { CARD_NOTICE, CARD_NOTICE_FOOTER } from '../../../styles';
import { FEATURES, SPARKLINE_HOURS, TIME_PERIODS, formatPeriodHourLong, formatPeriodRangeLong, periodKeyForHour } from '../../../../shared/config';
import { hasDirectionPeriodService, routeCardCoverageText, routeCardDisplayHeadway, routeCardDisplayHeadwayRange, routeCardDisplayLimited } from '../../../utils/effectiveHeadway';
import { branchDisplayHourHeadway, branchDisplayPeriodHeadway, buildRouteServiceSummary } from '../../../utils/routeFacts';
import { branchStackColor } from '../../../utils/colors';
import { unevenPeriodMaxGap } from '../../../utils/routeCardUneven';
import {
  dirIdNum,
  groupTrunkHeadway,
  headsignTrunkHeadway,
  sparklineSourceDirections,
  worstDirectionByHour,
  sharedStopIdsForBranches,
  sharedStretchHeadway,
  shouldShowTrunkSummary,
  trunkSparklineByHour,
} from '../../../utils/routeCardTrunk';
import { shouldShowDirectionSections } from '../../../utils/routeCardDirectionLayout';
import type { VariantFamily } from '../../../utils/routeVariants';
import type { CompareRouteRow } from '../compareTypes';
import { compareCardSummary } from '../../../utils/compareSides';
import { currentAtlasUrl } from '../../../utils/reportIssue';
import { ROUTE_DATA_QUALITY_WARNING, ROUTE_DATA_QUALITY_WARNING_MESSAGE } from '../../../../shared/routeDataQuality';
import { featurePassesHeadwayFilter, routeFilterHeadway } from '../../../../shared/routeHeadwayFilter';
import { expiredFeedNotice, NO_ROUTE_SHAPE_NOTICE, periodServiceNotice, selectedRouteFilterNotice, selectedRouteOutsideFilterNotice, unevenServiceNotice } from '../../../content/noticeCopy';
import { headwayAbout, headwayAboutRange } from '../../../utils/headwayText';

function medianHeadway(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

function formatMetricMap(
  values: Record<string, number | null | undefined> | null | undefined,
  keyLabel = 'key',
  valueLabel = 'value',
  separator = '; ',
): string {
  if (!values) return 'none';
  const entries = Object.entries(values);
  return entries.length > 0
    ? entries.map(([key, value]) => `${keyLabel}=${key}, ${valueLabel}=${value ?? 'none'}`).join(separator)
    : 'none';
}

/** Merge hourly headways across branches — median per hour avoids min-spike artifacts (#98). */
function mergeHeadwayByHour(
  directions: ShapeProperties[],
  hours: readonly number[],
): Record<number, number | null> {
  const merged: Record<number, number | null> = {};
  for (const h of hours) {
    const values = directions
      .map(d => buildRouteServiceSummary(d).branch.byHour?.[h])
      .filter((v): v is number => v != null);
    merged[h] = values.length === 0 ? null : values.length === 1 ? values[0] : medianHeadway(values);
  }
  return merged;
}

/**
 * Labels for the full-day schedule's direction pills. Uses the bound label
 * (Westbound), else the destination from the headsign ("To Downtown"), and
 * only falls back to a generic name when a direction has neither. Never
 * "Direction 0/1".
 */
export function directionPillLabels(
  groups: Pick<DirectionGroup, 'boundLabel' | 'realTier' | 'span'>[],
  shortName: string,
  longName: string,
): string[] {
  const labels = groups.map(group => {
    const bound = group.boundLabel?.trim();
    if (bound) return bound;
    const destinations = [...new Set([...group.realTier, ...group.span]
      .map(direction => formatBranchLabel(direction.headsign, shortName, longName))
      .filter(Boolean))];
    if (destinations.length === 0) return null;
    // Branch labels read "to X" mid-row; a standalone pill starts with a capital.
    const first = destinations[0].charAt(0).toUpperCase() + destinations[0].slice(1);
    if (destinations.length === 1) return first;
    return `${first} / ${destinations[1].replace(/^to\s+/i, '')}`;
  });
  const generic = (index: number) => groups.length === 2 ? (index === 0 ? 'One way' : 'Other way') : `Pattern ${index + 1}`;
  const resolved = labels.map((label, index) => label ?? generic(index));
  return resolved.map((label, index) =>
    resolved.indexOf(label) === index ? label : `${label} (${resolved.slice(0, index + 1).filter(l => l === label).length})`);
}

/** Cap hourly values below period summary when paired departures bunch (#91). */
export function sparklineHeadwayByHour(
  directions: ShapeProperties[],
  hours: readonly number[],
): Record<number, number | null> {
  const raw = mergeHeadwayByHour(directions, hours);
  const out: Record<number, number | null> = {};
  for (const h of hours) {
    const hw = raw[h];
    if (hw == null) { out[h] = null; continue; }
    const pk = periodKeyForHour(h);
    if (!pk) { out[h] = hw; continue; }
    const periodVals = directions
      .map(d => branchDisplayPeriodHeadway(d, pk as keyof HeadwayByPeriod))
      .filter((v): v is number => v != null);
    if (periodVals.length === 0) { out[h] = hw; continue; }
    const periodRep = periodVals.length === 1 ? periodVals[0] : medianHeadway(periodVals);
    out[h] = hw < periodRep * 0.75 ? periodRep : hw;
  }
  return out;
}

function sparklineMaxGapByHour(
  directions: ShapeProperties[],
  hours: readonly number[],
): Record<number, number | null> {
  return Object.fromEntries(hours.map(h => {
    const values = directions
      .map(d => d.maxGapByHour?.[h])
      .filter((v): v is number => v != null);
    return [h, values.length > 0 ? Math.max(...values) : null];
  }));
}

function activePeriodRanges(directions: ShapeProperties[], startHour: number, endHour: number): string[] {
  const ranges: Array<[number, number]> = [];
  let runStart: number | null = null;
  for (let hour = startHour; hour <= endHour; hour++) {
    const active = hour < endHour && directions.some(direction => direction.headwayByHour?.[hour] != null);
    if (active && runStart === null) runStart = hour;
    if ((!active || hour === endHour) && runStart !== null) {
      ranges.push([runStart, hour]);
      runStart = null;
    }
  }
  return ranges.map(([start, end]) => formatPeriodRangeLong(start, end));
}

export interface DirectionGroup {
  dirId: number;
  realTier: ShapeProperties[];
  span: ShapeProperties[];
  boundLabel?: string;
}

export interface CurrentRouteData {
  routeShortName: string | null;
  routeLongName: string | null;
  directions: ShapeProperties[];
}

export interface RouteCardHeadwayProps {
  currentRoute: CurrentRouteData;
  /** The route's agency features (stops, pooled shared-stretch block, both directions), CIV-82. */
  agencyFeatures?: readonly GeoJSON.Feature[];
  /** Lettered variants sharing this route's base number (GRTC 1/1A/1B/1C style). */
  variantFamily?: VariantFamily | null;
  routeSlug: string | undefined;
  routeAgency: Agency | undefined;
  setSelectedAgencySlug: ((slug: string | null) => void) | undefined;
  setSelectedRoute: (r: string | null) => void;
  maxHeadway: number;
  period: TimePeriod;
  setPeriod: (p: TimePeriod) => void;
  directionGroups: DirectionGroup[];
  hideSpan: boolean;
  routeIsStale: boolean;
  selectedRouteOutOfFilter: boolean;
  /** Night and Frequent Service ignore the period and speed filters, so the card shows no notice about them. */
  hideFilterNotices?: boolean;
  /** Compare mode: this route on each side. */
  compareRows?: CompareRouteRow[] | null;
  expDateStr: string;
  hoveredBranch: HoveredBranch | null;
  setHoveredBranch: (b: HoveredBranch | null) => void;
  onInfoOpen?: OpenInfoFn;
}

export const RouteCardHeadway: React.FC<RouteCardHeadwayProps> = ({
  currentRoute,
  agencyFeatures,
  variantFamily,
  routeSlug,
  routeAgency,
  setSelectedAgencySlug,
  setSelectedRoute,
  maxHeadway,
  period,
  setPeriod,
  directionGroups,
  hideSpan,
  routeIsStale,
  selectedRouteOutOfFilter,
  hideFilterNotices = false,
  compareRows = null,
  expDateStr,
  hoveredBranch,
  setHoveredBranch,
  onInfoOpen,
}) => {
  const [hoveredHour, setHoveredHour] = React.useState<number | null>(null);
  const reportRef = React.useRef<CardReportButtonHandle>(null);
  const agencyDisplayName = shortenAgencyName(routeAgency?.name ?? routeSlug ?? '');
  const routeOverrideNote = routeAgency?.overrideNote
    && (!routeAgency.overrideNoteRoutes?.length || routeAgency.overrideNoteRoutes.includes(currentRoute.routeShortName ?? ''))
    ? routeAgency.overrideNote
    : undefined;
  const hasRouteDataQualityWarning = currentRoute.directions.some(
    direction => direction.routeDataQualityWarning === ROUTE_DATA_QUALITY_WARNING,
  );
  // Only say the map is unavailable when nothing of this route is drawn. A route with one
  // shaped direction still shows its line, so a missing shape on the other is not news.
  const hasNoRouteShape = currentRoute.directions.length > 0
    && currentRoute.directions.every(direction => direction.noRouteShape);
  const hasWeekdayTierVariation = currentRoute.directions.some(direction => direction.weekdayTierVariation);
  const selectedPeriod = period !== 'all' ? TIME_PERIODS.find(p => p.key === period) : undefined;
  const hasPeriodService = period === 'all' || directionGroups.some(group =>
    group.realTier.some(direction => routeCardDisplayHeadway(direction, period) != null) ||
    group.span.length > 0,
  );
  const hasPartialPeriodService = selectedPeriod != null && !hasPeriodService && currentRoute.directions.some(direction =>
    hasDirectionPeriodService(direction, period),
  );
  // Only primary patterns per direction drive the uneven banner. A rare short-turn
  // branch (TTC 63 midday "to St Clair") can show a multi-hour max gap even when
  // the direction's real service is even — that gap is not the rider message. When
  // the card already has a qualifying combined trunk summary, do not contradict it
  // with an individual branch's terminal gap (#381).
  const unevenGap = FEATURES.unevenBanner ? unevenPeriodMaxGap(directionGroups, period) : 0;

  // Largest multi-branch direction group — same branches as WESTBOUND/EASTBOUND rows.
  const primaryMultiBranch = directionGroups
    .filter(g => g.realTier.length >= 2)
    .sort((a, b) => b.realTier.length - a.realTier.length)[0];
  const activePeriodRangeText = selectedPeriod
    ? activePeriodRanges(
      sparklineSourceDirections(currentRoute.directions, primaryMultiBranch?.realTier),
      Math.max(0, selectedPeriod.startHour - 1),
      selectedPeriod.endHour,
    ).join(', ')
    : '';
  const periodNotice = !hideFilterNotices && selectedPeriod && !hasPeriodService
      ? periodServiceNotice(
      formatPeriodRangeLong(selectedPeriod.startHour, selectedPeriod.endHour),
      hasPartialPeriodService,
      activePeriodRangeText,
    )
    : null;
  const unevenNotice = !hideFilterNotices && selectedPeriod && hasPeriodService && unevenGap > 0
    ? unevenServiceNotice(unevenGap)
    : null;
  const coreGroups = directionGroups.filter(group => shouldShowTrunkSummary(group.realTier, period));
  const hasCoreSummary = coreGroups.length > 0;
  const primaryCoreHeadway = primaryMultiBranch && shouldShowTrunkSummary(primaryMultiBranch.realTier, period)
    ? groupTrunkHeadway(primaryMultiBranch.realTier, period === 'all' ? 'midday' : period)
    : null;
  const coreHeadway = primaryCoreHeadway ?? (coreGroups[0]
    ? groupTrunkHeadway(coreGroups[0].realTier, period === 'all' ? 'midday' : period)
    : null);

  const allLackHeadsigns = directionGroups.every(g => g.realTier.every(d => !d.headsign));
  const groupHeadway = (g: DirectionGroup) => g.realTier[0]
    ? buildRouteServiceSummary(g.realTier[0]).branch.value
    : null;
  const collapseGroups = allLackHeadsigns && directionGroups.length > 1 &&
    directionGroups.every(g => groupHeadway(g) === groupHeadway(directionGroups[0]));
  const displayGroups = collapseGroups ? [directionGroups[0]] : directionGroups;
  const needsNumbered = allLackHeadsigns && !collapseGroups && directionGroups.length > 1;
  const showDirectionSections = shouldShowDirectionSections(displayGroups);
  const reportServiceLines = displayGroups.flatMap((group, gi) => {
    const section = showDirectionSections && group.boundLabel ? [`${group.boundLabel}:`] : [];
    const branchLines = group.realTier
      .map(direction => {
        const label = resolveBranchLabel({
          headsign: direction.headsign,
          shortName: currentRoute.routeShortName ?? '',
          longName: currentRoute.routeLongName ?? '',
          directionId: needsNumbered ? gi : group.dirId,
          multipleDirections: showDirectionSections,
          sectionBoundLabel: showDirectionSections ? group.boundLabel : undefined,
        });
        // resolveBranchLabel can legitimately return '' (e.g. destination redundant with a
        // section header already shown) -- fine for the polished card, but the report text's
        // whole job is completeness, so a branch with real data must never be silently dropped
        // just because it has nothing distinctive to say (#300). Fall back to something, not null.
        const reportLabel = label || direction.headsign?.trim() || `Direction ${direction.directionId ?? gi}`;
        const headway = routeCardDisplayHeadway(direction, period);
        // Not "no scheduled service" -- null means the pipeline didn't compute a value for this
        // period, which can happen even when real service exists (#297). Don't assert absence.
        const range = routeCardDisplayHeadwayRange(direction, period);
        const isLimited = routeCardDisplayLimited(direction, period);
        return `- ${reportLabel}: ${routeCardCoverageText(direction, period) ?? (headway != null ? headwayAbout(headway) : range ?? (isLimited ? 'limited service' : 'no data for this period'))}`;
      })
      .filter((line): line is string => line !== null);
    const limitedLines = !hideSpan
      ? group.span
          .map(direction => resolveBranchLabel({
            headsign: direction.headsign,
            shortName: currentRoute.routeShortName ?? '',
            longName: currentRoute.routeLongName ?? '',
            directionId: needsNumbered ? gi : group.dirId,
            multipleDirections: showDirectionSections,
            sectionBoundLabel: showDirectionSections ? group.boundLabel : undefined,
          }))
          .filter(Boolean)
          .map(label => `- ${label}: limited service`)
      : [];
    // CIV-82: pooled shared-stretch cadence from real departures, when the data has it.
    const shared = sharedStretchHeadway(agencyFeatures, group.realTier, period, maxHeadway);
    const branchHeadways = [...new Set(group.realTier
      .map(direction => routeCardDisplayHeadway(direction, period))
      .filter((v): v is number => v != null))].sort((a, b) => a - b);
    const sharedLines = shared && branchHeadways.length > 0
      ? [`- Shared stretch ${headwayAbout(shared.headway)}; each branch ${branchHeadways.length === 1 ? headwayAbout(branchHeadways[0]) : headwayAboutRange(branchHeadways[0], branchHeadways[branchHeadways.length - 1])}`]
      : [];
    return [...section, ...sharedLines, ...branchLines, ...limitedLines];
  });
  // The folded timetable line states what the expanded rows show for this period:
  // each direction's shared-stretch (or combined) cadence, as in the direction
  // rows below; the slower direction decides, as everywhere else on the card.
  const scheduleHeadline = (() => {
    const cores = displayGroups.map(group => {
      const shared = sharedStretchHeadway(agencyFeatures, group.realTier, period, maxHeadway);
      const hasCore = shared != null || shouldShowTrunkSummary(group.realTier, period);
      const core = shared?.headway ?? (hasCore ? groupTrunkHeadway(group.realTier, period === 'all' ? 'midday' : period) : null);
      if (core != null) return { headway: core, label: shared ? 'Shared stretch' : 'Combined' };
      const branch = group.realTier
        .map(direction => routeCardDisplayHeadway(direction, period))
        .filter((v): v is number => v != null);
      return branch.length ? { headway: Math.min(...branch), label: 'Scheduled' } : null;
    }).filter((c): c is { headway: number; label: string } => c != null);
    if (cores.length === 0) return null;
    const slower = cores.reduce((a, c) => (c.headway > a.headway ? c : a));
    return `${slower.label}: ${headwayAbout(slower.headway)}`;
  })();
  const reportRawMetrics = currentRoute.directions.map((direction, index) => {
    const selectedPeriodHourlyHeadways = selectedPeriod
      ? Object.fromEntries(
          Object.entries(direction.headwayByHour ?? {})
            .filter(([hour]) => {
              const h = Number(hour);
              return h >= selectedPeriod.startHour && h < selectedPeriod.endHour;
            }),
        )
      : null;
    const selectedPeriodStopHeadways = period === 'all'
      ? direction.stopHeadways ?? null
      : Object.fromEntries(
          Object.entries(direction.stopPeriodHeadways ?? {})
            .map(([stopId, periods]) => [stopId, periods[period] ?? null]),
        );
    return [
      `Branch ${index + 1}:`,
      `  routeId=${direction.routeId}`,
      `  directionId=${direction.directionId}`,
      `  headsign=${direction.headsign ?? 'none'}`,
      `  tier=${direction.tier ?? 'none'}`,
      `  rawHeadwayMinutes=${direction.headway ?? 'none'}`,
      `  displayedHeadwayMinutes=${routeCardDisplayHeadway(direction, period) ?? 'none'}`,
      `  headwayByPeriod: ${formatMetricMap(direction.headwayByPeriod, 'period', 'typicalGapMinutes')}`,
      `  typicalGapRangeByPeriod: ${JSON.stringify(direction.headwayRangeByPeriod ?? {})}`,
      `  longestGapByPeriod: ${formatMetricMap(direction.maxGapByPeriod, 'period', 'longestGapMinutes')}`,
      `  sustainedByPeriod: ${JSON.stringify(direction.headwayByPeriodSustained ?? {})}`,
      `  hourlyHeadways (${period}): ${formatMetricMap(selectedPeriodHourlyHeadways, 'hour', 'typicalGapMinutes')}`,
      `  minimumStopHeadwayByPeriod: ${formatMetricMap(direction.minStopHeadwayByPeriod, 'period', 'minimumGapMinutes')}`,
      `  headsignMinimumStopHeadwayByPeriod: ${formatMetricMap(direction.headsignMinStopHeadwayByPeriod, 'period', 'minimumGapMinutes')}`,
      `  stopHeadways (${period}): ${formatMetricMap(selectedPeriodStopHeadways, 'stopId', 'typicalGapMinutes', '\n    ')}`,
    ].join('\n');
  }).join('\n\n');
  const reportPeriod = selectedPeriod
    ? `${selectedPeriod.label} (${formatPeriodRangeLong(selectedPeriod.startHour, selectedPeriod.endHour)})`
    : 'All day';
  const reportDetails = [
    `**Agency:** ${routeAgency?.name ?? routeSlug ?? 'Unknown'}`,
    `**Route:** ${currentRoute.routeShortName ?? 'Unknown'}${currentRoute.routeLongName ? ` — ${currentRoute.routeLongName}` : ''}`,
    `**Period:** ${reportPeriod}`,
    `**Agency data refreshed:** ${routeAgency?.lastRefreshedAt ?? 'unknown'}`,
    `**Feed expiry:** ${routeAgency?.lastFeedExpiry ?? 'unknown'}`,
    '**Displayed service:**',
    ...(reportServiceLines.length > 0 ? reportServiceLines : ['- No displayed service rows']),
    '',
    '**Generated route metrics from the loaded artifact:**',
    reportRawMetrics,
    `**Atlas URL:** ${currentAtlasUrl()}`,
  ].join('\n');

  const patternLabel = routePatternLabel(currentRoute.directions);

  return (
    <SidebarCardShell>
      <SidebarCardHeaderBlock>
        <div className="flex items-start gap-2">
          <div className="flex-1 min-w-0">
            <RouteCardTitle
              routeShortName={currentRoute.routeShortName}
              routeLongName={currentRoute.routeLongName}
              agencyName={agencyDisplayName}
              onAgencyClick={routeSlug && setSelectedAgencySlug ? () => { setSelectedAgencySlug(routeSlug); setSelectedRoute(null); } : undefined}
            />
          </div>
          <CardReportButton
            ref={reportRef}
            title={`${routeAgency?.name ?? agencyDisplayName} ${currentRoute.routeShortName ?? 'Unknown route'}${currentRoute.routeLongName ? ` — ${currentRoute.routeLongName}` : ''}`}
            details={reportDetails}
            excludeReasons={['Stop is missing, misplaced, or assigned incorrectly']}
          />
        </div>
      </SidebarCardHeaderBlock>
      {(<>
      {compareRows && (() => {
        const { headline, lines } = compareCardSummary(compareRows);
        return (
          <div className="mb-3 rounded-xl bg-[var(--bg-app)] px-3 py-2 text-xs font-bold text-[var(--text-primary)]" data-testid="compare-card-summary">
            {headline && <p className="text-xs font-black">{headline}</p>}
            {lines.map(line => <p key={line} className={headline ? 'mt-0.5 text-[var(--text-dim)]' : 'py-0.5'}>{line}</p>)}
          </div>
        );
      })()}
      {patternLabel && (
        <p className="text-xs font-bold text-[var(--text-dim)] -mt-1 mb-3 truncate" data-testid="route-pattern-label">{patternLabel}</p>
      )}
      {FEATURES.beta && variantFamily && (
        <p className="text-xs text-[var(--text-dim)] -mt-1 mb-3">
          Includes variants {variantFamily.members.map(m => m.shortName).join(', ')}
        </p>
      )}
      {(() => {
        const HOURS = SPARKLINE_HOURS;
        const hoveredSingleBranch = hoveredBranch?.headsign != null;
        const defaultSparklineDirs = sparklineSourceDirections(currentRoute.directions, primaryMultiBranch?.realTier);
        const hoveredSparklineDirs = hoveredSingleBranch
          ? currentRoute.directions.filter(
            d => dirIdNum(d.directionId) === dirIdNum(hoveredBranch.directionId) && d.headsign === hoveredBranch.headsign,
          )
          : defaultSparklineDirs;
        // One hourly series per direction, as shown by the direction pills. A
        // multi-branch direction whose branches share a trunk uses the combined
        // trunk curve; otherwise its branches are merged.
        const directionSeries = (group: DirectionGroup) =>
          group.realTier.length >= 2 && shouldShowTrunkSummary(group.realTier, period)
            ? trunkSparklineByHour(group.realTier, HOURS)
            : sparklineHeadwayByHour(group.realTier, HOURS);
        const perDirection = displayGroups.map(group => ({ group, byHour: directionSeries(group) }));
        const directionsWithHours = perDirection.filter(entry => HOURS.some(h => entry.byHour[h] != null));
        // Inline chart = the slower direction each hour, never one direction silently.
        const allDirections = directionsWithHours.length > 0
          ? worstDirectionByHour(directionsWithHours.map(entry => entry.byHour), HOURS)
          : sparklineHeadwayByHour(defaultSparklineDirs, HOURS);
        const hasTrunkSparkline = !!primaryMultiBranch && shouldShowTrunkSummary(primaryMultiBranch.realTier, period);
        const showTrunkSparkline = !hoveredSingleBranch && hasTrunkSparkline;
        const defaultMerged = allDirections;
        const hoveredMerged = hoveredSingleBranch
          ? sparklineHeadwayByHour(hoveredSparklineDirs, HOURS)
          : defaultMerged;
        const mergedMaxGaps = hoveredSingleBranch
          ? sparklineMaxGapByHour(hoveredSparklineDirs, HOURS)
          : sparklineMaxGapByHour(
            directionsWithHours.length > 0 ? directionsWithHours.flatMap(entry => entry.group.realTier) : defaultSparklineDirs,
            HOURS,
          );
        // A hovered destination can have no hourly data in the active period.
        // Falling back to the route chart keeps the chart mounted, so its layout
        // does not shift under the pointer and cause hover flicker (#550).
        const merged = HOURS.some(h => hoveredMerged[h] != null) ? hoveredMerged : defaultMerged;
        // Branch stacks describe the primary multi-branch direction, so only stack
        // hours where that direction is the one drawn (it is the worst that hour).
        const primaryTrunkByHour = showTrunkSparkline ? trunkSparklineByHour(primaryMultiBranch!.realTier, HOURS) : null;
        const stackedByHour = showTrunkSparkline
          ? Object.fromEntries(HOURS.map(h => [h, primaryTrunkByHour![h] != null && primaryTrunkByHour![h] === merged[h]
            ? primaryMultiBranch!.realTier
              .map((branch, i) => ({
                label: branch.headsign ?? `Branch ${i + 1}`,
                headway: branchDisplayHourHeadway(branch, h),
                color: branchStackColor(i),
              }))
              .filter((segment): segment is { label: string; headway: number; color: string } => segment.headway != null)
            : []]))
          : undefined;
        // Full-day view: one pill per direction, opening on the slower one.
        // Single-direction routes get no pills.
        const pillLabels = directionPillLabels(
          perDirection.map(entry => entry.group),
          currentRoute.routeShortName ?? '',
          currentRoute.routeLongName ?? '',
        );
        // Beta only, and only from data already in the agency file: the full-day view's trip time.
        const runningTimes = FEATURES.beta && routeSlug
          ? (getCachedAgencyGeo(routeSlug) as { runningTimes?: PublishedRunningTimes } | undefined)?.runningTimes
          : undefined;
        const tripTimeFor = (group: DirectionGroup) => {
          const dir = group.realTier[0] ?? group.span[0];
          if (!runningTimes || !dir) return null;
          const routeIds = [...new Set([...group.realTier, ...group.span].map(d => d.routeId))];
          return tripTimeSeriesFor(runningTimes, routeIds, dir.directionId, dir.day as string);
        };
        const directionOptions = perDirection.map(({ group, byHour }, index) => ({
          key: `direction-${group.dirId}-${index}`,
          label: pillLabels[index],
          byHour,
          tripTime: tripTimeFor(group),
        }));
        const hasAny = HOURS.some(h => merged[h] != null);
        if (!hasAny) return null;
        return (
          <>
            <HeadwaySparkline
              byHour={merged}
              maxGapByHour={mergedMaxGaps}
              seriesLabel={merged === defaultMerged && directionsWithHours.length > 1 ? 'slower direction' : undefined}
              stackedByHour={stackedByHour}
              directionOptions={directionOptions}
              period={period}
              onPeriodChange={p => setPeriod(p as TimePeriod)}
              onHourHover={setHoveredHour}
              allowExpand={FEATURES.beta}
              reserveStackedLegendSpace={hasTrunkSparkline}
              title={titleCase(getRouteLabel(currentRoute.routeShortName, currentRoute.routeLongName, agencyDisplayName))}
            />
          </>
        );
      })()}
      {periodNotice && (
        <div className="mt-4 mb-3 rounded-xl bg-[var(--bg-app)] px-3 py-2.5">
          <p className="text-xs font-normal text-[var(--text-primary)]">{periodNotice}</p>
        </div>
      )}
      {unevenNotice && (
        <div className="mt-4 mb-3 rounded-xl bg-[var(--bg-app)] px-3 py-2.5">
          <p className="text-xs font-black text-[var(--text-primary)]">{unevenNotice}</p>
        </div>
      )}
      <SidebarCardList>
        {selectedRouteOutOfFilter && (
          <div className={CARD_NOTICE_FOOTER}>
            <p className={CARD_NOTICE}>
              {selectedPeriod && activePeriodRangeText
                ? selectedRouteFilterNotice({
                  activeRange: activePeriodRangeText,
                  periodRange: formatPeriodRangeLong(selectedPeriod.startHour, selectedPeriod.endHour),
                })
                : selectedRouteOutsideFilterNotice(maxHeadway)}
            </p>
          </div>
        )}
        {(() => {
          const branchLabel = (group: DirectionGroup, direction: ShapeProperties, gi: number) => {
            const label = resolveBranchLabel({
              headsign: direction.headsign,
              shortName: currentRoute.routeShortName ?? '',
              longName: currentRoute.routeLongName ?? '',
              directionId: needsNumbered ? gi : group.dirId,
              multipleDirections: showDirectionSections,
              sectionBoundLabel: showDirectionSections ? group.boundLabel : undefined,
            });
            const sameDestinationCount = group.realTier.filter(d =>
              (d.headsign ?? '').trim().toLowerCase() === (direction.headsign ?? '').trim().toLowerCase()
            ).length;
            const variant = direction.routeVariant?.trim();
            return sameDestinationCount > 1 && variant ? `${variant} · ${label}` : label;
          };
          const branchHoverProps = (dirId: number, headsign: string | null | undefined) => {
            if (!headsign) return {};
            const isHovered = dirIdNum(hoveredBranch?.directionId) === dirIdNum(dirId)
              && (hoveredBranch?.headsign === headsign || hoveredBranch?.headsigns?.includes(headsign ?? '') === true);
            return {
              onHoverStart: () => setHoveredBranch({ directionId: dirId, headsign }),
              onHoverEnd: () => setHoveredBranch(null),
              branchHovered: isHovered,
              branchDimmed: !!hoveredBranch && !isHovered,
            };
          };
          return displayGroups.map((group, gi) => {
            // CIV-82: real pooled departures replace the reciprocal-of-medians estimate when the
            // data has them ("Shared stretch every N"; branch rows keep each branch's own M).
            const groupShared = sharedStretchHeadway(agencyFeatures, group.realTier, period, maxHeadway);
            // A route that fails the filter as a whole can still have a shared stretch that passes.
            const onlySharedPasses = groupShared != null && maxHeadway !== Infinity
              && group.realTier.some(d => !featurePassesHeadwayFilter(d, period, maxHeadway));
            const groupHasCoreSummary = groupShared != null || shouldShowTrunkSummary(group.realTier, period);
            const groupCoreHeadway = groupShared?.headway ?? (groupHasCoreSummary
              ? groupTrunkHeadway(group.realTier, period === 'all' ? 'midday' : period)
              : null);
            const groupSharedStopIds = groupShared?.stopIds ?? (groupHasCoreSummary ? sharedStopIdsForBranches(group.realTier) : []);
            const coreHeadsigns = group.realTier
              .filter(d => d.tier !== 'infrequent' && d.tier !== 'span' && !/drop[- ]?offs?\s+only/i.test(d.headsign ?? ''))
              .map(d => d.headsign)
              .filter((headsign): headsign is string => !!headsign);
            const coreHovered = hoveredBranch?.isCore === true
              && dirIdNum(hoveredBranch.directionId) === dirIdNum(group.dirId);
            const realHeadsignKeys = new Set(
              group.realTier.map(d => (d.headsign ?? '').trim().toLowerCase()).filter(Boolean),
            );
            const exclusiveSpans = (() => {
              const seen = new Set<string>();
              return group.span.filter(d => {
                const key = (d.headsign ?? '').trim().toLowerCase() || `__dir-${group.dirId}`;
                if (realHeadsignKeys.has((d.headsign ?? '').trim().toLowerCase()) || seen.has(key)) return false;
                seen.add(key);
                return true;
              });
            })();
            const exclusiveSpanNames = exclusiveSpans
              .map(d => branchLabel(group, d, gi))
              .filter(Boolean);
            const hasVisibleDirectionRows = groupHasCoreSummary
              || group.realTier.length > 0
              || exclusiveSpans.length > 0;
            return (
              <React.Fragment key={group.dirId}>
                {gi > 0 && showDirectionSections && <CardDivider />}
                {showDirectionSections && group.boundLabel && (
                  <>
                    <CardSectionLabel className="mb-0">{group.boundLabel}</CardSectionLabel>
                    {!hasVisibleDirectionRows && selectedPeriod && (
                      <p className="mt-2 mb-2 text-xs font-bold text-[var(--text-dim)]">
                        No {selectedPeriod.label.toLowerCase()} service.
                      </p>
                    )}
                  </>
                )}
                {onlySharedPasses && (
                  <p className="mt-2 mb-2 text-xs font-bold text-[var(--text-dim)]">
                    Only the shared section meets this filter. The branches do not.
                  </p>
                )}
                {groupHasCoreSummary && groupCoreHeadway != null && (
                  <>
                    <CardDirectionRow
                      label={groupShared ? 'Shared stretch' : 'Combined'}
                      headway={groupCoreHeadway}
                      branchHovered={coreHovered}
                      branchDimmed={!!hoveredBranch && !coreHovered}
                      onHoverStart={() => setHoveredBranch({
                        directionId: group.dirId,
                        headsigns: coreHeadsigns,
                        sharedStopIds: groupSharedStopIds,
                        sharedHeadway: groupCoreHeadway,
                        isCore: true,
                      })}
                      onHoverEnd={() => setHoveredBranch(null)}
                    />
                  </>
                )}
                <div className="space-y-1">
                  {group.realTier.map((d, i) => {
                    // Dimming and colour follow the one frequency rule (worst direction decides),
                    // exactly as the map does; the row's own cadence stays display-only (#564).
                    const branchFilterHeadway = routeFilterHeadway(d, period);
                    const dimmed = maxHeadway !== Infinity && !featurePassesHeadwayFilter(d, period, maxHeadway);
                    return (() => {
                      const displayH = hoveredHour != null
                        ? branchDisplayHourHeadway(d, hoveredHour) ?? routeCardDisplayHeadway(d, period)
                        : routeCardDisplayHeadway(d, period);
                      const label = branchLabel(group, d, gi);
                      if (!label && !collapseGroups && displayH == null) return null;
                      const trunkHw = hoveredHour == null && period !== 'all'
                        ? headsignTrunkHeadway(d, period)
                        : undefined;
                      const isLimited = displayH == null && hoveredHour == null && routeCardDisplayLimited(d, period);
                      return (
                        <FlaggableValue key={`r${i}`} reason="Frequency is wrong" reportRef={reportRef} className="block w-full text-left">
                          <CardDirectionRow
                            label={label}
                            headway={displayH ?? undefined}
                            colorHeadway={hoveredHour == null ? branchFilterHeadway : undefined}
                            headwayLabel={hoveredHour == null ? routeCardCoverageText(d, period) : undefined}
                            trunkHeadway={trunkHw}
                            edgeGapAllowance={d.edgeGapAllowance}
                            onEdgeGapAllowanceClick={onInfoOpen ? () => onInfoOpen('about', { helpTopic: 'edge-gap-allowance' }) : undefined}
                            dimmed={dimmed}
                            limited={isLimited}
                            {...branchHoverProps(group.dirId, d.headsign)}
                          />
                        </FlaggableValue>
                      );
                    })();
                  })}
                  {/* Span-only branches use the same limited row whether or not the irregular-service
                      filter is on: the filter hides them from the map, not from the route's own card. */}
                  {exclusiveSpans.length === 1 && (
                    <CardDirectionRow
                      key="s0"
                      label={branchLabel(group, exclusiveSpans[0], gi) || 'limited service'}
                      limited
                      {...branchHoverProps(group.dirId, exclusiveSpans[0].headsign)}
                    />
                  )}
                  {exclusiveSpans.length > 1 && (
                    <CardDirectionRow key="smulti" label={exclusiveSpanNames.join(' · ')} limited />
                  )}
                </div>
              </React.Fragment>
            );
          });
        })()}
        {(routeIsStale || routeAgency?.feedReviewStatus === 'review' || routeOverrideNote || hasRouteDataQualityWarning || hasNoRouteShape || hasWeekdayTierVariation) && onInfoOpen && (
          <div className={`${CARD_NOTICE_FOOTER} space-y-1`}>
            {hasNoRouteShape && (
              <CardHelpNotice
                message={NO_ROUTE_SHAPE_NOTICE}
                onLearnMore={() => onInfoOpen('about', {
                  helpTopic: 'no-route-shape',
                  agencyName: routeAgency?.name,
                })}
              />
            )}
            {hasRouteDataQualityWarning && (
              <CardHelpNotice
                message={ROUTE_DATA_QUALITY_WARNING_MESSAGE}
                onLearnMore={() => onInfoOpen('about', {
                  helpTopic: 'route-data-quality',
                  agencyName: routeAgency?.name,
                })}
              />
            )}
            {routeIsStale && (
              <CardHelpNotice
                message={expiredFeedNotice(routeAgency?.name ?? 'This agency', expDateStr, routeAgency?.manualFeedSource)}
                onLearnMore={() => onInfoOpen('about', {
                  helpTopic: 'outdated-schedule',
                  agencyName: routeAgency?.name,
                  expDateStr: expDateStr || undefined,
                  manualFeedSource: routeAgency?.manualFeedSource,
                  lastRefreshedAt: routeAgency?.lastRefreshedAt ?? undefined,
                  lastFeedCheckAt: routeAgency?.lastFeedCheckAt ?? undefined,
                  expiredFeedCheckCount: routeAgency?.expiredFeedCheckCount,
                  expiredFeedCheckSince: routeAgency?.expiredFeedCheckSince ?? undefined,
                  websiteUrl: routeAgency?.websiteUrl ?? undefined,
                })}
              />
            )}
            {routeAgency?.feedReviewStatus === 'review' && !routeAgency.overrideNote && (
              <CardHelpNotice
                message="New schedule data is being verified."
                onLearnMore={() => onInfoOpen('about', {
                  helpTopic: 'new-schedule-data',
                  agencyName: routeAgency?.name,
                  lastRefreshedAt: routeAgency.lastRefreshedAt ?? undefined,
                  lastFeedCheckAt: routeAgency.lastFeedCheckAt ?? undefined,
                  expiredFeedCheckCount: routeAgency.expiredFeedCheckCount,
                  expiredFeedCheckSince: routeAgency.expiredFeedCheckSince ?? undefined,
                  websiteUrl: routeAgency.websiteUrl ?? undefined,
                })}
              />
            )}
            {routeOverrideNote && (
              <CardHelpNotice
                message="We corrected this data."
                onLearnMore={() => onInfoOpen('about', {
                  helpTopic: 'corrected-data',
                  agencyName: routeAgency?.name,
                  overrideNote: routeOverrideNote,
                  issueUrl: routeAgency?.issueUrl,
                  issueUrls: routeAgency?.issueUrls,
                })}
              />
            )}
            {hasWeekdayTierVariation && (
              <CardHelpNotice
                message="Weekday schedules vary. The tier shown reflects the slowest weekday."
                onLearnMore={() => onInfoOpen('about', { helpTopic: 'weekday-variation' })}
              />
            )}
          </div>
        )}
      </SidebarCardList>
      </>)}
    </SidebarCardShell>
  );
};
