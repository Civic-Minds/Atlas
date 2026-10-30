import React from 'react';
import type { ShapeProperties, TimePeriod, HoveredBranch } from '../../../hooks/useIntervalStats';
import { routePatternLabel } from '../../../utils/routePattern';
import type { Agency } from '../../../App';
import type { OpenInfoFn } from '../../InfoPanel';
import { routeLabels, resolveBranchLabel, formatBranchLabel, formatStoredDate } from '../../../utils/format';
import { agencyNames } from '../../../utils/agencyName';
import { HeadwaySparkline } from '../HeadwaySparkline';
import { branchHourStack, routeHourModel, stableBranchColors, stackBranches, stackHeadway } from '../../../utils/hourChartModel';
import { getCachedAgencyGeo } from '../../../lib/agencyGeo';
import { tripTimeSeriesFor, type PublishedRunningTimes } from '../../../utils/tripTime';
import RouteCardTitle from '../../RouteCardTitle';
import {
  CardDirectionRow,
  CardDivider,
  CardSectionLabel,
  CardHelpNotice,
  CorrectedDataNotice,
  NewScheduleDataNotice,
  SidebarCardHeaderBlock,
  SidebarCardList,
  SidebarCardShell,
  CardReportButton,
  FlaggableValue,
  type CardReportButtonHandle,
} from '../cardUi';
import { CARD_NOTE, CARD_NOTICE, CARD_NOTICE_FOOTER } from '../../../styles';
import { FEATURES, SPARKLINE_HOURS, TIME_PERIODS, formatPeriodHourLong, formatPeriodRangeLong } from '../../../../shared/config';
import { hasDirectionPeriodService, NO_REGULAR_SERVICE_LABEL, NO_REGULAR_SERVICE_SHORT_LABEL, routeCardDisplayHeadway, routeCardDisplayHeadwayRange, routeCardDisplayLimited } from '../../../utils/effectiveHeadway';
import { buildRouteServiceSummary } from '../../../utils/routeFacts';
import { unevenPeriodMaxGap } from '../../../utils/routeCardUneven';
import { rowTrips } from '../../../utils/rowTrips';
import { routeCardRowValue } from '../../../utils/routeCardRowValue';
import {
  dirIdNum,
  routePartMeetsFilter,
  groupTrunkHeadway,
  sparklineSourceDirections,
  sharedStopIdsForBranches,
  sharedStretchHeadway,
  shouldShowTrunkSummary,
  stretchSharedHeadway,
} from '../../../utils/routeCardTrunk';
import { shouldShowDirectionSections } from '../../../utils/routeCardDirectionLayout';
import { activeHourRanges, partPeriodNoticeApplies, partPeriodNoticeHeadway, partPeriodOutside } from '../../../utils/periodActiveRanges';
import { rowLabelWithOrigin } from '../../../utils/rowOriginLabel';
import { hasStretchRoles, routeAllDayContract, routeContract } from '../../../utils/stretchCard';
import type { VariantFamily } from '../../../utils/routeVariants';
import { reportDetails } from '../../../utils/reportIssue';
import { ROUTE_DATA_QUALITY_WARNING } from '../../../../shared/routeDataQuality';
import { LIMITED_SERVICE_LABEL, BOOKING_REQUIRED_NOTICE, expiredFeedNotice, explainerFor, listingEndedNotice, listingEndHasPassed, NO_ROUTE_SHAPE_NOTICE, periodServiceNotice, ROUTE_DATA_QUALITY_WARNING_MESSAGE, selectedRouteFilterNotice, selectedRouteOutsideFilterNotice, selectedRoutePartMeetsFilterNotice, unevenServiceNotice, variantsIncludedNotice, WEEKDAY_VARIATION_NOTICE } from '../../../content/noticeCopy';
import { featurePassesHeadwayFilter } from '../../../../shared/routeHeadwayFilter';
import { agencyTodayYmd } from '../../../../shared/feedAvailability';
import { headwayAbout, headwayAboutRange } from '../../../utils/headwayText';
import type { RouteLabel } from '../../../utils/routeFacts';

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

function activePeriodRanges(directions: ShapeProperties[], startHour: number, endHour: number): string[] {
  return activeHourRanges(directions, startHour, endHour).map(([start, end]) => formatPeriodRangeLong(start, end));
}

export interface DirectionGroup {
  dirId: number;
  realTier: ShapeProperties[];
  span: ShapeProperties[];
  boundLabel?: string;
  directionFeatures?: ShapeProperties[];
}

export interface CurrentRouteData {
  /** The route's identity (the route ID when the feed has no short name): variant families, direction labels. */
  routeShortName: string | null;
  /** What the title shows (route facts' label, CIV-984). The map's route card always sets it; without it the title is built from routeShortName. */
  label?: RouteLabel;
  routeLongName: string | null;
  /** The feed's route_type and agency slug, so the title names the route the same way lists and agency pages do. */
  routeType?: number | string | null;
  agencySlug?: string;
  directions: ShapeProperties[];
}

export interface RouteCardHeadwayProps {
  currentRoute: CurrentRouteData;
  /** The route's agency features (stops, pooled shared-stretch block, both directions), CIV-82. */
  agencyFeatures?: readonly GeoJSON.Feature[];
  /** Compare (CIV-844): colour each destination by name, so it matches on both cards. */
  stableBranchColors?: boolean;
  /** Lettered variants sharing this route's base number (GRTC 1/1A/1B/1C style). */
  variantFamily?: VariantFamily | null;
  routeSlug: string | undefined;
  routeAgency: Agency | undefined;
  setSelectedAgencySlug: ((slug: string | null) => void) | undefined;
  setSelectedRoute: (r: string | null) => void;
  /** A back link in place of "← <agency>": "← Near You" for a route opened from Near You (CIV-930). */
  back?: { to: string; onClick: () => void };
  maxHeadway: number;
  period: TimePeriod;
  setPeriod: (p: TimePeriod) => void;
  directionGroups: DirectionGroup[];
  hideSpan: boolean;
  routeIsStale: boolean;
  selectedRouteOutOfFilter: boolean;
  /** Night and Frequent Service ignore the period and speed filters, so the card shows no notice about them. */
  hideFilterNotices?: boolean;
  /**
   * The Night view's card (CIV-934): no chart and no period, and each destination row reads its night grade (the 2am to
   * 5am check the Night view runs), never a daytime value.
   */
  nightView?: boolean;
  expDateStr: string;
  hoveredBranch: HoveredBranch | null;
  setHoveredBranch: (b: HoveredBranch | null) => void;
  onInfoOpen?: OpenInfoFn;
}

/** The last two words held together, so a wrapped value never leaves one word alone on its line (Compare, CIV-844). */
function keepLastWordsTogether(text: string): string {
  return text.replace(/ (\S+)$/, '\u00A0$1');
}

export const RouteCardHeadway: React.FC<RouteCardHeadwayProps> = ({
  currentRoute,
  agencyFeatures,
  stableBranchColors: stableColors = false,
  variantFamily,
  routeSlug,
  routeAgency,
  setSelectedAgencySlug,
  setSelectedRoute,
  back,
  maxHeadway,
  period,
  setPeriod,
  directionGroups,
  hideSpan,
  routeIsStale,
  selectedRouteOutOfFilter,
  hideFilterNotices = false,
  nightView = false,
  expDateStr,
  hoveredBranch,
  setHoveredBranch,
  onInfoOpen,
}) => {
  const [hoveredHour, setHoveredHour] = React.useState<number | null>(null);
  const reportRef = React.useRef<CardReportButtonHandle>(null);
  const agencyDisplayName = agencyNames(routeAgency?.name ?? routeSlug ?? '').name;
  // An ended timetable (N2) says more, so it wins over the listing end.
  const listingEndedDate = !routeIsStale && routeAgency?.listingEndedOn ? formatStoredDate(routeAgency.listingEndedOn) : '';
  const listingEnded = !!routeAgency?.listingEndedOn && listingEndHasPassed(routeAgency.listingEndedOn, agencyTodayYmd(routeAgency));
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
  const bookingRequired = currentRoute.directions.some(direction => direction.bookingRequired === true);
  // Frequency focus: rows come from the stretches, and the route-level number is the filter's own value with its range.
  const stretchMode = hasStretchRoles(currentRoute.directions);
  const contract = routeContract(currentRoute.directions, period);
  // All day reads the route's all-day filter value (routeAllDayHeadway), the same as the lists.
  const allDay = period === 'all' ? routeAllDayContract(currentRoute.directions) : undefined;
  const noRegularService = (contract != null && contract.filterValue == null && contract.runs)
    || (allDay != null && allDay.filterValue == null);
  const noRegularLabel = allDay?.limited ? LIMITED_SERVICE_LABEL : NO_REGULAR_SERVICE_LABEL;
  const selectedPeriod = period !== 'all' ? TIME_PERIODS.find(p => p.key === period) : undefined;
  const hasPeriodService = period === 'all' || directionGroups.some(group =>
    group.realTier.some(direction => rowTrips(direction, period).value != null) ||
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
  const activeRangeDirections = sparklineSourceDirections(currentRoute.directions, primaryMultiBranch?.realTier);
  const activePeriodRangeText = selectedPeriod
    ? activePeriodRanges(
      activeRangeDirections,
      Math.max(0, selectedPeriod.startHour - 1),
      selectedPeriod.endHour,
    ).join(', ')
    : '';
  // #995: "but not throughout the selected period" only when service really stops short of it;
  // a route running the whole period that misses the frequency filter gets the filter notice.
  const showPartPeriodNotice = selectedPeriod != null
    && partPeriodNoticeApplies(
      activeRangeDirections, selectedPeriod.startHour, selectedPeriod.endHour, maxHeadway, contract?.filterValue,
    );
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

  const allLackHeadsigns = directionGroups.every(g => g.realTier.every(d => !d.headsign));
  const groupHeadway = (g: DirectionGroup) => g.realTier[0]
    ? buildRouteServiceSummary(g.realTier[0]).branch.value
    : null;
  const collapseGroups = allLackHeadsigns && directionGroups.length > 1 &&
    directionGroups.every(g => groupHeadway(g) === groupHeadway(directionGroups[0]));
  // The filter has no value and the route does not run in this period: no rows, no numbers, no "limited" (the map draws nothing).
  const doesNotRun = contract != null && contract.filterValue == null && !contract.runs;
  const displayGroups = doesNotRun ? [] : collapseGroups ? [directionGroups[0]] : directionGroups;
  const needsNumbered = allLackHeadsigns && !collapseGroups && directionGroups.length > 1;
  const showDirectionSections = shouldShowDirectionSections(displayGroups);
  // A destination's name under its direction, the same in the rows and the issue report.
  const destinationLabel = (group: DirectionGroup, direction: ShapeProperties, gi: number) => resolveBranchLabel({
    headsign: direction.headsign,
    shortName: currentRoute.routeShortName ?? '',
    longName: currentRoute.routeLongName ?? '',
    directionId: needsNumbered ? gi : group.dirId,
    multipleDirections: showDirectionSections,
    sectionBoundLabel: showDirectionSections ? group.boundLabel : undefined,
  });
  const reportServiceLines = displayGroups.flatMap((group, gi) => {
    const section = showDirectionSections && group.boundLabel ? [`${group.boundLabel}:`] : [];
    const branchLines = group.realTier
      .map(direction => {
        const label = destinationLabel(group, direction, gi);
        // resolveBranchLabel can legitimately return '' (e.g. destination redundant with a
        // section header already shown) -- fine for the polished card, but the report text's
        // whole job is completeness, so a branch with real data must never be silently dropped
        // just because it has nothing distinctive to say (#300). Fall back to something, not null.
        const reportLabel = label || direction.headsign?.trim() || `Direction ${direction.directionId ?? gi}`;
        const headway = rowTrips(direction, period).value;
        // Not "no scheduled service" -- null means the pipeline didn't compute a value for this
        // period, which can happen even when real service exists (#297). Don't assert absence.
        const range = routeCardDisplayHeadwayRange(direction, period);
        const isLimited = routeCardDisplayLimited(direction, period);
        return `- ${reportLabel}: ${headway != null ? headwayAbout(headway) : range ?? (isLimited ? 'limited service' : 'no data for this period')}`;
      })
      .filter((line): line is string => line !== null);
    const limitedLines = !hideSpan
      ? group.span
          .map(direction => destinationLabel(group, direction, gi))
          .filter(Boolean)
          .map(label => `- ${label}: limited service`)
      : [];
    // CIV-82: pooled shared-stretch cadence from real departures, when the data has it.
    const shared = sharedStretchHeadway(agencyFeatures, group.realTier, period, maxHeadway);
    const branchHeadways = [...new Set(group.realTier
      .map(direction => rowTrips(direction, period).value)
      .filter((v): v is number => v != null))].sort((a, b) => a - b);
    const sharedLines = shared && branchHeadways.length > 0
      ? [`- Shared stretch ${headwayAbout(shared.headway)}; each branch ${branchHeadways.length === 1 ? headwayAbout(branchHeadways[0]) : headwayAboutRange(branchHeadways[0], branchHeadways[branchHeadways.length - 1])}`]
      : [];
    return [...section, ...sharedLines, ...branchLines, ...limitedLines];
  });
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
  // One route name for the title, the sparkline and the issue report (shared/routeDisplay.ts).
  // A branch matches the hovered row by headsign (or the core row's headsigns) and, when the row has one, its pattern (#1064).
  const matchesHoveredBranch = (headsign: string | null | undefined, routeVariant: string | null | undefined) =>
    (hoveredBranch?.headsign === headsign || hoveredBranch?.headsigns?.includes(headsign ?? '') === true)
    && (!hoveredBranch?.routeVariant || (routeVariant ?? '') === hoveredBranch.routeVariant);
  const routeLabel = currentRoute.label ?? routeLabels({ shortName: currentRoute.routeShortName, longName: currentRoute.routeLongName, routeType: currentRoute.routeType ?? currentRoute.directions[0]?.routeType, agencySlug: currentRoute.agencySlug ?? routeSlug, agencyName: agencyDisplayName });
  // Plain text keeps the dash (report details, the chart window's screen-reader name); on screen the title is RouteTitleName (CIV-1128).
  const routeTitle = routeLabel.text;
  const reportPeriod = selectedPeriod
    ? `${selectedPeriod.label} (${formatPeriodRangeLong(selectedPeriod.startHour, selectedPeriod.endHour)})`
    : 'All day';
  const details = reportDetails([
    ['Agency', routeAgency?.name ?? routeSlug ?? 'Unknown'],
    ['Route', `${routeTitle || 'Unknown'} (feed short name: ${currentRoute.routeShortName ?? 'none'}; long name: ${currentRoute.routeLongName ?? 'none'})`],
    ['Period', reportPeriod],
    ['Agency data refreshed', routeAgency?.lastRefreshedAt ?? 'unknown'],
    ['Feed expiry', routeAgency?.lastFeedExpiry ?? 'unknown'],
    '**Displayed service:**',
    ...(reportServiceLines.length > 0 ? reportServiceLines : ['- No displayed service rows']),
    '',
    '**Generated route metrics from the loaded artifact:**',
    reportRawMetrics,
  ]);

  const patternLabel = routePatternLabel(currentRoute.directions);

  return (
    <SidebarCardShell>
      <SidebarCardHeaderBlock>
        <div className="flex items-start gap-2">
          <div className="flex-1 min-w-0">
            <RouteCardTitle
              label={routeLabel}
              routeShortName={currentRoute.routeShortName}
              routeLongName={currentRoute.routeLongName}
              routeType={currentRoute.routeType ?? currentRoute.directions[0]?.routeType}
              agencySlug={currentRoute.agencySlug ?? routeSlug}
              agencyName={agencyDisplayName}
              agencyFullName={routeAgency?.name}
              onAgencyClick={routeSlug && setSelectedAgencySlug ? () => { setSelectedAgencySlug(routeSlug); setSelectedRoute(null); } : undefined}
              agencyBackLink
              back={back}
            />
          </div>
          <CardReportButton
            ref={reportRef}
            title={`${routeAgency?.name ?? agencyDisplayName} ${routeTitle || 'Unknown route'}`}
            details={details}
            excludeReasons={['Stop is missing, misplaced, or assigned incorrectly']}
          />
        </div>
      </SidebarCardHeaderBlock>
      {(<>
      {patternLabel && (
        <p className={`${CARD_NOTE} -mt-1 mb-3 truncate`} data-testid="route-pattern-label">{patternLabel}</p>
      )}
      {FEATURES.routeVariants && variantFamily && (
        <p className={`${CARD_NOTICE} -mt-1 mb-3`}>
          {variantsIncludedNotice(variantFamily.members.map(m => m.shortName).join(', '))}
        </p>
      )}
      {!nightView && (() => {
        const HOURS = SPARKLINE_HOURS;
        const branchColorOf = stableColors ? stableBranchColors(agencyFeatures, currentRoute.routeShortName) : undefined;
        const hoveredSingleBranch = hoveredBranch?.headsign != null;
        // One hourly series per direction (the direction pills), the inline chart's series, its gap colours,
        // the default branch stack and the route's y-axis top, from the shared hour model (CIV-1118).
        const { perDirection, directionsWithHours, defaultMerged, hasTrunkSparkline, mergedMaxGaps, defaultStackedByHour, scaleMaxFreq } =
          routeHourModel({ groups: displayGroups, directions: currentRoute.directions, primaryMultiBranch, period, hours: HOURS, colorOf: branchColorOf });
        // A selected branch row (CIV-512) keeps the chart and its scale: the bars become that direction's
        // trips each hour, split by branch (part-day branches too), each segment its own trips on the
        // route's fixed axis, with the selected branch in full colour and the others faded.
        // Only a direction with two or more branches has a share to show; a one-branch row (Milton 4,
        // MARTA 20's Five Points, TTC 94) leaves the chart exactly as it is.
        const hoveredGroup = hoveredSingleBranch
          ? displayGroups.find(group => dirIdNum(group.dirId) === dirIdNum(hoveredBranch!.directionId))
          : undefined;
        const selectedGroup = hoveredGroup && stackBranches(hoveredGroup).length >= 2 ? hoveredGroup : undefined;
        const isSelectedBranch = (b: ShapeProperties) => matchesHoveredBranch(b.headsign, b.routeVariant);
        const selectionStacked = selectedGroup
          ? Object.fromEntries(HOURS.map(h => [h, branchHourStack(stackBranches(selectedGroup), h, isSelectedBranch, branchColorOf)]))
          : null;
        const selectionByHour = selectionStacked
          ? Object.fromEntries(HOURS.map(h => [h, stackHeadway(selectionStacked[h])])) as Record<number, number | null>
          : null;
        // A selected branch's direction can have no hourly data in the active period. Falling back to
        // the route chart keeps the chart mounted, so its layout does not shift under the pointer (#550).
        const selected = !!selectionByHour && HOURS.some(h => selectionByHour[h] != null);
        const merged = selected ? selectionByHour! : defaultMerged;
        const stackedByHour = selected ? selectionStacked! : defaultStackedByHour;
        // Full-day view: one pill per direction, opening on the slower one.
        // Single-direction routes get no pills.
        const pillLabels = directionPillLabels(
          perDirection.map(entry => entry.group),
          currentRoute.routeShortName ?? '',
          currentRoute.routeLongName ?? '',
        );
        // Beta only, and only from data already in the agency file: the full-day view's trip time.
        const runningTimes = FEATURES.runningTimes && routeSlug
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
              // The legend always names the default stack (none when there is none), so a selection never adds or swaps it.
              legendStackedByHour={defaultStackedByHour ?? {}}
              legendInvisible={selected}
              scaleMaxFreq={scaleMaxFreq || undefined}
              directionOptions={directionOptions}
              period={period}
              onPeriodChange={p => setPeriod(p as TimePeriod)}
              onHourHover={setHoveredHour}
              allowExpand={FEATURES.sparklineExpand}
              reserveStackedLegendSpace={hasTrunkSparkline}
              title={routeTitle}
              titleLabel={routeLabel}
            />
          </>
        );
      })()}
      <SidebarCardList>
        {selectedRouteOutOfFilter && (
          <div className={CARD_NOTICE_FOOTER}>
            <p className={CARD_NOTICE}>
              {doesNotRun
                ? selectedRouteOutsideFilterNotice(Infinity, selectedPeriod ? formatPeriodRangeLong(selectedPeriod.startHour, selectedPeriod.endHour) : null)
                : selectedPeriod && activePeriodRangeText && showPartPeriodNotice
                ? selectedRouteFilterNotice({
                  // CIV-1069: the notice names the rows' own value (the slowest row), not the route's filter value,
                  // which also counts the wait before the first trip; CIV-975's rule still checks it against every row.
                  headway: (() => {
                    const rowHeadways = displayGroups.flatMap(g => g.realTier).map(d => routeCardRowValue(d, {
                      period, hoveredHour: null, stretchMode, allDay, contract, noRegularService, maxHeadway,
                    }).headway).filter((h): h is number => typeof h === 'number');
                    return partPeriodNoticeHeadway(rowHeadways.length > 0 ? Math.max(...rowHeadways) : null, rowHeadways);
                  })(),
                  ...(() => {
                    // N13 (Ryan): name what the rest of the period has, from the card's own hourly data.
                    const split = partPeriodOutside(activeRangeDirections, selectedPeriod.startHour, selectedPeriod.endHour);
                    return split
                      ? {
                        activeRange: formatPeriodRangeLong(split.active[0], split.active[1]),
                        outside: split.parts.map(part => (part.at === 'start'
                          ? { service: part.service, range: formatPeriodRangeLong(part.hours[0], part.hours[1]) }
                          : { service: part.service, after: formatPeriodHourLong(part.hours[0]) })),
                      }
                      : { activeRange: activePeriodRangeText };
                  })(),
                  periodRange: formatPeriodRangeLong(selectedPeriod.startHour, selectedPeriod.endHour),
                })
                // CIV-514: part of the route qualifies, as the map's shared-stretch overlay shows; else the general note.
                : routePartMeetsFilter(agencyFeatures, currentRoute.directions, period, maxHeadway)
                ? selectedRoutePartMeetsFilterNotice(maxHeadway)
                : selectedRouteOutsideFilterNotice(maxHeadway, selectedPeriod ? formatPeriodRangeLong(selectedPeriod.startHour, selectedPeriod.endHour) : null)}
            </p>
          </div>
        )}
        {(() => {
          const branchLabel = (group: DirectionGroup, direction: ShapeProperties, gi: number) =>
            rowLabelWithOrigin(destinationLabel(group, direction, gi), direction, group.realTier);
          // A row is matched by direction, headsign and, when the hovered row has one, its pattern, so two
          // rows sharing a headsign from different origins highlight one at a time (#1064).
          const branchHoverProps = (dirId: number, headsign: string | null | undefined, routeVariant?: string | null) => {
            if (!headsign) return {};
            // Hovering the Shared stretch row lights only that row, not the destination rows it combines.
            const isHovered = dirIdNum(hoveredBranch?.directionId) === dirIdNum(dirId) && hoveredBranch?.isCore !== true && matchesHoveredBranch(headsign, routeVariant);
            return {
              onHoverStart: () => setHoveredBranch({ directionId: dirId, headsign, ...(routeVariant ? { routeVariant } : {}) }),
              onHoverEnd: () => setHoveredBranch(null),
              branchHovered: isHovered,
              branchDimmed: !!hoveredBranch && !isHovered,
            };
          };
          return displayGroups.map((group, gi) => {
            // CIV-82: real pooled departures replace the reciprocal-of-medians estimate when the
            // data has them ("Shared stretch every N"; branch rows keep each branch's own M).
            const groupShared = stretchMode ? null : sharedStretchHeadway(agencyFeatures, group.realTier, period, maxHeadway);
            // A route that fails the filter as a whole can still have a shared stretch that passes.
            const onlySharedPasses = groupShared != null && maxHeadway !== Infinity
              && group.realTier.some(d => !featurePassesHeadwayFilter(d, period, maxHeadway));
            // CIV-937: with stretch data, the shared main stretch's own value ("Shared stretch every 15") above the branch rows.
            const stretchShared = stretchMode && !nightView ? stretchSharedHeadway(group, period) : null;
            // A shared or combined value is a daytime reading: none on the Night card (CIV-934).
            const groupHasCoreSummary = !nightView && (stretchMode ? stretchShared != null : groupShared != null || shouldShowTrunkSummary(group.realTier, period));
            const groupCoreHeadway = groupShared?.headway ?? stretchShared ?? (groupHasCoreSummary
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
                    {!hasVisibleDirectionRows && selectedPeriod && !nightView && (
                      <p className={`${CARD_NOTE} mt-2 mb-2`}>
                        No {selectedPeriod.label.toLowerCase()} service.
                      </p>
                    )}
                  </>
                )}
                {onlySharedPasses && !nightView && (
                  <p className={`${CARD_NOTE} mt-2 mb-2`}>
                    Only the shared section meets this filter. The branches do not.
                  </p>
                )}
                {groupHasCoreSummary && groupCoreHeadway != null && (
                  <>
                    <CardDirectionRow
                      label={groupShared || stretchShared != null ? 'Shared stretch' : 'Combined'}
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
                    return (() => {
                      const label = branchLabel(group, d, gi);
                      if (nightView) {
                        // The row's night grade: 30 when it passes the 30-minute night check, else 60 when it passes the
                        // hourly one, as the Night list reads it (an upper bound, never overstated).
                        const grade = d.nightService30 === true ? 30 : d.nightService60 === true || d.nightService === true ? 60 : null;
                        return (
                          <FlaggableValue key={`r${i}`} reason="Frequency is wrong" reportRef={reportRef} className="block w-full text-left">
                            <CardDirectionRow
                              labelWeight="regular"
                              singleLine
                              label={label}
                              headway={grade ?? undefined}
                              limited={grade == null}
                              limitedLabel={grade == null ? NO_REGULAR_SERVICE_SHORT_LABEL : undefined}
                              subLabel={grade != null && d.nightServicePartOfRoute === true ? 'Overnight service on part of the route' : undefined}
                              {...branchHoverProps(group.dirId, d.headsign, d.routeVariant)}
                            />
                          </FlaggableValue>
                        );
                      }
                      const row = routeCardRowValue(d, { period, hoveredHour, stretchMode, allDay, contract, noRegularService, maxHeadway });
                      if (!label && !collapseGroups && row.displayH == null) return null;
                      return (
                        <FlaggableValue key={`r${i}`} reason="Frequency is wrong" reportRef={reportRef} className="block w-full text-left">
                          <CardDirectionRow
                            labelWeight="regular"
                            // Compare (CIV-844): a row that reads "no regular service during this period" puts the whole
                            // destination name on its line and the value under it (the row's own wrap layout), never "to Roncesval…".
                            singleLine={!(stableColors && row.rowNoRegular)}
                            valueEnd={stableColors && row.rowNoRegular}
                            label={label}
                            headway={row.headway}
                            limitedLabel={row.isLimited && row.edgeText ? row.edgeText : row.rowNoRegular ? (stableColors ? keepLastWordsTogether(noRegularLabel) : noRegularLabel) : undefined}
                            colorHeadway={row.colorHeadway}
                            headwayLabel={row.headwayLabel}
                            trunkHeadway={row.trunkHeadway}
                            edgeGapAllowance={d.edgeGapAllowance}
                            onEdgeGapAllowanceClick={onInfoOpen ? () => onInfoOpen('about', { helpTopic: explainerFor('N14') }) : undefined}
                            dimmed={row.dimmed}
                            limited={row.isLimited}
                            {...branchHoverProps(group.dirId, d.headsign, d.routeVariant)}
                            holdLayout={hoveredHour != null}
                          />
                        </FlaggableValue>
                      );
                    })();
                  })}
                  {/* Span-only branches use the same limited row whether or not the irregular-service
                      filter is on: the filter hides them from the map, not from the route's own card. */}
                  {exclusiveSpans.length === 1 && (
                    <CardDirectionRow
                      labelWeight="regular"
                      singleLine
                      key="s0"
                      label={branchLabel(group, exclusiveSpans[0], gi) || 'limited service'}
                      limited
                      {...branchHoverProps(group.dirId, exclusiveSpans[0].headsign, exclusiveSpans[0].routeVariant)}
                    />
                  )}
                  {exclusiveSpans.length > 1 && (
                    <CardDirectionRow key="smulti" labelWeight="regular" singleLine label={exclusiveSpanNames.join(' · ')} limited />
                  )}
                </div>
              </React.Fragment>
            );
          });
        })()}
        {(periodNotice || unevenNotice) && (
          <div className={`${CARD_NOTICE_FOOTER} space-y-1`}>
            <CardHelpNotice message={(periodNotice ?? unevenNotice) as string} />
          </div>
        )}
        {bookingRequired && (
          <div className={`${CARD_NOTICE_FOOTER} space-y-1`}>
            <CardHelpNotice message={BOOKING_REQUIRED_NOTICE} />
          </div>
        )}
        {(routeIsStale || listingEndedDate || routeAgency?.feedReviewStatus === 'review' || routeOverrideNote || hasRouteDataQualityWarning || hasNoRouteShape || hasWeekdayTierVariation) && onInfoOpen && (
          <div className={`${CARD_NOTICE_FOOTER} space-y-1`}>
            {hasNoRouteShape && (
              <CardHelpNotice
                message={NO_ROUTE_SHAPE_NOTICE}
                onLearnMore={() => onInfoOpen('about', {
                  helpTopic: explainerFor('N7'),
                  agencyName: routeAgency?.name,
                })}
              />
            )}
            {hasRouteDataQualityWarning && (
              <CardHelpNotice
                message={ROUTE_DATA_QUALITY_WARNING_MESSAGE}
                onLearnMore={() => onInfoOpen('about', {
                  helpTopic: explainerFor('N6'),
                  agencyName: routeAgency?.name,
                })}
              />
            )}
            {listingEndedDate && (
              // N25 (CIV-1055): most of the agency's routes stopped being listed; the card shows their last listed week.
              <CardHelpNotice
                message={listingEndedNotice(listingEndedDate, listingEnded)}
                onLearnMore={() => onInfoOpen('about', {
                  helpTopic: explainerFor('N25'),
                  agencyName: routeAgency?.name,
                  listingEndedDate,
                  listingEnded,
                  lastRefreshedAt: routeAgency?.lastRefreshedAt ?? undefined,
                  lastFeedCheckAt: routeAgency?.lastFeedCheckAt ?? undefined,
                  expiredFeedCheckCount: routeAgency?.expiredFeedCheckCount,
                  expiredFeedCheckSince: routeAgency?.expiredFeedCheckSince ?? undefined,
                  websiteUrl: routeAgency?.websiteUrl ?? undefined,
                })}
              />
            )}
            {routeIsStale && (
              <CardHelpNotice
                message={expiredFeedNotice(routeAgency?.name ?? 'This agency', expDateStr, routeAgency?.manualFeedSource)}
                onLearnMore={() => onInfoOpen('about', {
                  helpTopic: explainerFor(routeAgency?.manualFeedSource ? 'N3' : 'N2'),
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
              <NewScheduleDataNotice on="route" agency={routeAgency} onInfoOpen={onInfoOpen} />
            )}
            {routeAgency && routeOverrideNote && (
              <CorrectedDataNotice on="route" agency={routeAgency} overrideNote={routeOverrideNote} onInfoOpen={onInfoOpen} />
            )}
            {hasWeekdayTierVariation && (
              <CardHelpNotice
                message={WEEKDAY_VARIATION_NOTICE}
                onLearnMore={() => onInfoOpen('about', { helpTopic: explainerFor('N1'), agencyName: routeAgency?.name, websiteUrl: routeAgency?.websiteUrl ?? undefined })}
              />
            )}
          </div>
        )}
      </SidebarCardList>
      </>)}
    </SidebarCardShell>
  );
};
