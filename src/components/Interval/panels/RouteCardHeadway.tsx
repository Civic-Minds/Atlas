import React from 'react';
import type { ShapeProperties, TimePeriod, HoveredBranch } from '../../../hooks/useIntervalStats';
import { routePatternLabel } from '../../../utils/routePattern';
import type { Agency } from '../../../App';
import type { OpenInfoFn } from '../../InfoPanel';
import { routeLabels, formatBranchLabel, formatStoredDate } from '../../../utils/format';
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
import { FEATURES, SPARKLINE_HOURS, TIME_PERIODS, formatPeriodRangeLong } from '../../../../shared/config';
import { NO_REGULAR_SERVICE_SHORT_LABEL, routeCardDisplayHeadway } from '../../../utils/effectiveHeadway';
import { buildRouteCardModel, matchesHoveredBranch, rowIsHovered, sharedIsHovered } from '../../../utils/routeCardRows';
import { routeCardNotices } from '../../../utils/routeCardNotices';
import { dirIdNum } from '../../../utils/routeCardTrunk';
import type { VariantFamily } from '../../../utils/routeVariants';
import { reportDetails } from '../../../utils/reportIssue';
import { explainerFor, listingEndHasPassed } from '../../../content/noticeCopy';
import { agencyTodayYmd, effectiveFeedExpiry } from '../../../../shared/feedAvailability';
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
  // The card's rows, built once (CIV-987): every part below reads this model.
  const model = React.useMemo(() => buildRouteCardModel({
    directions: currentRoute.directions,
    routeShortName: currentRoute.routeShortName,
    routeLongName: currentRoute.routeLongName,
    directionGroups,
    agencyFeatures,
    period,
    maxHeadway,
    nightView,
    stableColors,
    hideSpan,
  }), [currentRoute, directionGroups, agencyFeatures, period, maxHeadway, nightView, stableColors, hideSpan]);
  const { contract, displayGroups, showDirectionSections, doesNotRun, hasPeriodService, primaryMultiBranch, activeRangeDirections } = model;
  const selectedPeriod = period !== 'all' ? TIME_PERIODS.find(p => p.key === period) : undefined;
  // Every notice on the card, decided in one place (CIV-1200).
  const notices = routeCardNotices({
    directions: currentRoute.directions,
    model,
    nightView,
    agencyFeatures,
    period,
    maxHeadway,
    selectedRouteOutOfFilter,
    hideFilterNotices,
    unevenEnabled: FEATURES.unevenBanner,
    variantShortNames: FEATURES.routeVariants && variantFamily ? variantFamily.members.map(m => m.shortName) : null,
    agency: routeAgency ? { name: routeAgency.name, feedReviewStatus: routeAgency.feedReviewStatus, overrideNote: routeAgency.overrideNote, manualFeedSource: routeAgency.manualFeedSource } : undefined,
    routeOverrideNote,
    routeIsStale,
    expDateStr,
    listingEndedDate,
    listingEnded,
  });

  const reportServiceLines = model.reportServiceLines;
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
    ['Feed expiry', (routeAgency && effectiveFeedExpiry(routeAgency)) ?? 'unknown'],
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
      {notices.variants && (
        <p className={`${CARD_NOTICE} -mt-1 mb-3`}>
          {notices.variants.text}
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
        const isSelectedBranch = (b: ShapeProperties) => matchesHoveredBranch(hoveredBranch, b.headsign, b.routeVariant);
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
        {notices.filter && (
          <div className={CARD_NOTICE_FOOTER}>
            <p className={CARD_NOTICE}>{notices.filter.text}</p>
          </div>
        )}
        {(() => {
          // A row's hover sends its destination (and pattern); the row lights when it is the hovered one (#1064).
          const hoverProps = (dirId: number, feature: ShapeProperties | undefined, hover: HoveredBranch | null) => {
            if (!hover || !feature) return {};
            const isHovered = rowIsHovered(hoveredBranch, { dirId, feature });
            return {
              onHoverStart: () => setHoveredBranch(hover),
              onHoverEnd: () => setHoveredBranch(null),
              branchHovered: isHovered,
              branchDimmed: !!hoveredBranch && !isHovered,
            };
          };
          return model.groups.map((group, gi) => {
            const coreHovered = sharedIsHovered(hoveredBranch, group.dirId);
            return (
              <React.Fragment key={group.dirId}>
                {gi > 0 && showDirectionSections && <CardDivider />}
                {showDirectionSections && group.boundLabel && (
                  <>
                    <CardSectionLabel className="mb-0">{group.boundLabel}</CardSectionLabel>
                    {notices.directions.filter(n => n.dirId === group.dirId && n.kind === 'no-service').map(n => (
                      <p key={n.kind} className={`${CARD_NOTE} mt-2 mb-2`}>{n.text}</p>
                    ))}
                  </>
                )}
                {notices.directions.filter(n => n.dirId === group.dirId && n.kind === 'only-shared').map(n => (
                  <p key={n.kind} className={`${CARD_NOTE} mt-2 mb-2`}>{n.text}</p>
                ))}
                {group.shared && (
                  <>
                    <CardDirectionRow
                      label={group.shared.label}
                      headway={group.shared.headway}
                      branchHovered={coreHovered}
                      branchDimmed={!!hoveredBranch && !coreHovered}
                      onHoverStart={() => setHoveredBranch(group.shared!.hover)}
                      onHoverEnd={() => setHoveredBranch(null)}
                    />
                  </>
                )}
                <div className="space-y-1">
                  {group.rows.map((row, i) => {
                    const d = row.feature;
                    if (row.night) {
                      const { grade } = row.night;
                      return (
                        <FlaggableValue key={`r${i}`} reason="Frequency is wrong" reportRef={reportRef} className="block w-full text-left">
                          <CardDirectionRow
                            labelWeight="regular"
                            singleLine
                            label={row.label}
                            headway={grade ?? undefined}
                            limited={grade == null}
                            limitedLabel={grade == null ? NO_REGULAR_SERVICE_SHORT_LABEL : undefined}
                            subLabel={grade != null && row.night.partOfRoute ? 'Overnight service on part of the route' : undefined}
                            {...hoverProps(group.dirId, d, row.hover)}
                          />
                        </FlaggableValue>
                      );
                    }
                    const shown = row.display(hoveredHour);
                    if (!row.label && !model.collapseGroups && shown.value.displayH == null) return null;
                    return (
                      <FlaggableValue key={`r${i}`} reason="Frequency is wrong" reportRef={reportRef} className="block w-full text-left">
                        <CardDirectionRow
                          labelWeight="regular"
                          singleLine={shown.singleLine}
                          valueEnd={shown.valueEnd}
                          wrapLongValue
                          label={row.label}
                          headway={shown.value.headway}
                          limitedLabel={shown.limitedLabel}
                          colorHeadway={shown.value.colorHeadway}
                          headwayLabel={shown.value.headwayLabel}
                          trunkHeadway={shown.value.trunkHeadway}
                          edgeGapAllowance={d.edgeGapAllowance}
                          onEdgeGapAllowanceClick={onInfoOpen ? () => onInfoOpen('about', { helpTopic: explainerFor('N14') }) : undefined}
                          dimmed={shown.value.dimmed}
                          limited={shown.value.isLimited}
                          {...hoverProps(group.dirId, d, row.hover)}
                          holdLayout={hoveredHour != null}
                        />
                      </FlaggableValue>
                    );
                  })}
                  {/* Span-only branches use the same limited row whether or not the irregular-service
                      filter is on: the filter hides them from the map, not from the route's own card. */}
                  {group.spanRows.map((span, si) => (
                    <CardDirectionRow
                      labelWeight="regular"
                      singleLine
                      key={span.feature ? `s${si}` : 'smulti'}
                      label={span.label}
                      limited
                      {...hoverProps(group.dirId, span.feature, span.hover)}
                    />
                  ))}
                </div>
              </React.Fragment>
            );
          });
        })()}
        {notices.period && (
          <div className={`${CARD_NOTICE_FOOTER} space-y-1`}>
            <CardHelpNotice message={notices.period.text} />
          </div>
        )}
        {notices.booking && (
          <div className={`${CARD_NOTICE_FOOTER} space-y-1`}>
            <CardHelpNotice message={notices.booking.text} />
          </div>
        )}
        {notices.showFooter && onInfoOpen && (
          <div className={`${CARD_NOTICE_FOOTER} space-y-1`}>
            {notices.footer.map(notice => {
              switch (notice.code) {
                case 'N4':
                  return <NewScheduleDataNotice key={notice.code} on="route" agency={routeAgency!} onInfoOpen={onInfoOpen} />;
                case 'N5':
                  return <CorrectedDataNotice key={notice.code} on="route" agency={routeAgency!} overrideNote={routeOverrideNote!} onInfoOpen={onInfoOpen} />;
                case 'N25':
                  // N25 (CIV-1055): most of the agency's routes stopped being listed; the card shows their last listed week.
                  return (
                    <CardHelpNotice
                      key={notice.code}
                      message={notice.text!}
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
                  );
                case 'N2':
                case 'N3':
                  return (
                    <CardHelpNotice
                      key={notice.code}
                      message={notice.text!}
                      onLearnMore={() => onInfoOpen('about', {
                        helpTopic: explainerFor(notice.code),
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
                  );
                case 'N1':
                  return (
                    <CardHelpNotice
                      key={notice.code}
                      message={notice.text!}
                      onLearnMore={() => onInfoOpen('about', { helpTopic: explainerFor('N1'), agencyName: routeAgency?.name, websiteUrl: routeAgency?.websiteUrl ?? undefined })}
                    />
                  );
                default:
                  // N6 and N7: a Learn more naming the agency.
                  return (
                    <CardHelpNotice
                      key={notice.code}
                      message={notice.text!}
                      onLearnMore={() => onInfoOpen('about', { helpTopic: explainerFor(notice.code), agencyName: routeAgency?.name })}
                    />
                  );
              }
            })}
          </div>
        )}
      </SidebarCardList>
      </>)}
    </SidebarCardShell>
  );
};
