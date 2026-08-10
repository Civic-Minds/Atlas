import React from 'react';
import type { ShapeProperties, TimePeriod, HoveredBranch } from '../../../hooks/useIntervalStats';
import type { Agency } from '../../../App';
import type { OpenInfoFn } from '../../InfoPanel';
import type { HeadwayByPeriod } from '../../../hooks/useAgencyData';
import { titleCase, shortenAgencyName, resolveBranchLabel } from '../../../utils/format';
import { HeadwaySparkline } from '../HeadwaySparkline';
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
import { SPARKLINE_HOURS, TIME_PERIODS, UNEVEN_BANNER_ENABLED, formatPeriodRangeLong, periodKeyForHour } from '../../../../shared/config';
import { routeCardDisplayHeadway, routeCardDisplayHeadwayRange } from '../../../utils/effectiveHeadway';
import { buildRouteServiceSummary, metricValueForPeriod } from '../../../utils/routeFacts';
import {
  dirIdNum,
  groupTrunkHeadway,
  headsignTrunkHeadway,
  sparklineSourceDirections,
  shouldShowTrunkSummary,
  trunkSparklineByHour,
} from '../../../utils/routeCardTrunk';
import { hasDuplicateDirectionHeadsigns, shouldShowDirectionSections } from '../../../utils/routeCardDirectionLayout';
import type { VariantFamily } from '../../../utils/routeVariants';
import { currentAtlasUrl } from '../../../utils/reportIssue';
import { ROUTE_DATA_QUALITY_WARNING, ROUTE_DATA_QUALITY_WARNING_MESSAGE } from '../../../../shared/routeDataQuality';
import { correctionNoticeApplies, correctionNoticeText } from '../../../../shared/correctionNotices';

function medianHeadway(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

function formatMetricMap(values: Record<string, number | null | undefined> | null | undefined): string {
  if (!values) return 'none';
  const entries = Object.entries(values);
  return entries.length > 0
    ? entries.map(([key, value]) => `${key}=${value ?? 'none'}`).join(', ')
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

/** Cap hourly values below period summary when paired departures bunch (#91). */
function sparklineHeadwayByHour(
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
      .map(d => metricValueForPeriod(buildRouteServiceSummary(d).branch, pk as keyof HeadwayByPeriod))
      .filter((v): v is number => v != null);
    if (periodVals.length === 0) { out[h] = hw; continue; }
    const periodRep = periodVals.length === 1 ? periodVals[0] : medianHeadway(periodVals);
    out[h] = hw < periodRep * 0.75 ? periodRep : hw;
  }
  return out;
}

export interface DirectionGroup {
  dirId: number;
  realTier: ShapeProperties[];
  span: ShapeProperties[];
  boundLabel?: string;
}

export interface CurrentRouteData {
  routeId: string;
  routeShortName: string | null;
  routeLongName: string | null;
  directions: ShapeProperties[];
}

export interface RouteCardHeadwayProps {
  currentRoute: CurrentRouteData;
  /** Lettered variants sharing this route's base number (GRTC 1/1A/1B/1C style). */
  variantFamily?: VariantFamily | null;
  liveRouteInfo: object | null;
  liveStatus: string;
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
  expDateStr: string;
  hoveredBranch: HoveredBranch | null;
  setHoveredBranch: (b: HoveredBranch | null) => void;
  onInfoOpen?: OpenInfoFn;
}

export const RouteCardHeadway: React.FC<RouteCardHeadwayProps> = ({
  currentRoute,
  variantFamily,
  liveRouteInfo,
  liveStatus,
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
  expDateStr,
  hoveredBranch,
  setHoveredBranch,
  onInfoOpen,
}) => {
  const [hoveredHour, setHoveredHour] = React.useState<number | null>(null);
  const reportRef = React.useRef<CardReportButtonHandle>(null);
  const agencyDisplayName = shortenAgencyName(routeAgency?.name ?? routeSlug ?? '');
  const legacyOverrideNote = routeAgency?.overrideNote
    && (!routeAgency.overrideNoteRoutes?.length || routeAgency.overrideNoteRoutes.includes(currentRoute.routeShortName ?? ''))
    && (!routeAgency.overrideNoteRouteIds?.length || routeAgency.overrideNoteRouteIds.includes(currentRoute.routeId))
    ? routeAgency.overrideNote
    : undefined;
  const correctionNotes = (routeAgency?.correctionNotices ?? [])
    .filter(notice => correctionNoticeApplies(notice, currentRoute.routeShortName, currentRoute.routeId))
    .map(notice => correctionNoticeText(notice.type));
  const routeOverrideNote = [legacyOverrideNote, ...correctionNotes].filter(Boolean).join('\n\n') || undefined;
  const hasRouteDataQualityWarning = currentRoute.directions.some(
    direction => direction.routeDataQualityWarning === ROUTE_DATA_QUALITY_WARNING,
  );
  const selectedPeriod = period !== 'all' ? TIME_PERIODS.find(p => p.key === period) : undefined;
  const hasPeriodService = period === 'all' || directionGroups.some(group =>
    group.realTier.some(direction => metricValueForPeriod(buildRouteServiceSummary(direction).branch, period) != null) ||
    group.span.length > 0,
  );
  // Only primary patterns per direction drive the uneven banner. A rare short-turn
  // branch (TTC 63 midday "to St Clair") can show a multi-hour max gap even when
  // the direction's real service is even — that gap is not the rider message.
  const unevenPeriodMaxGap = UNEVEN_BANNER_ENABLED && period !== 'all'
    ? Math.max(0, ...directionGroups.flatMap(group => {
        const primaryHw = Math.min(
          ...group.realTier
            .map(d => d.headway)
            .filter((h): h is number => h != null),
        );
        return group.realTier
          .filter(direction => {
            if (direction.headwayByPeriodSustained?.[period] !== false) return false;
            if (primaryHw === Infinity) return true;
            // Keep primary / near-primary; drop branches clearly sparser short-turns.
            return direction.headway == null || direction.headway <= primaryHw * 1.5;
          })
          .map(direction => direction.maxGapByPeriod?.[period] ?? 0);
      }))
    : 0;

  // Largest multi-branch direction group — same branches as WESTBOUND/EASTBOUND rows.
  const primaryMultiBranch = directionGroups
    .filter(g => g.realTier.length >= 2)
    .sort((a, b) => b.realTier.length - a.realTier.length)[0];
  const hasCoreSummary = !!primaryMultiBranch && shouldShowTrunkSummary(primaryMultiBranch.realTier, period);
  const coreHeadway = hasCoreSummary
    ? groupTrunkHeadway(primaryMultiBranch!.realTier, period === 'all' ? 'midday' : period)
    : null;

  const allLackHeadsigns = directionGroups.every(g => g.realTier.every(d => !d.headsign));
  const groupHeadway = (g: DirectionGroup) => g.realTier[0]
    ? buildRouteServiceSummary(g.realTier[0]).branch.value
    : null;
  const collapseGroups = allLackHeadsigns && directionGroups.length > 1 &&
    directionGroups.every(g => groupHeadway(g) === groupHeadway(directionGroups[0]));
  const displayGroups = collapseGroups ? [directionGroups[0]] : directionGroups;
  const needsNumbered = allLackHeadsigns && !collapseGroups && directionGroups.length > 1;
  const showDirectionSections = shouldShowDirectionSections(displayGroups);
  const duplicateDirectionHeadsigns = hasDuplicateDirectionHeadsigns(displayGroups);
  const reportServiceLines = displayGroups.flatMap((group, gi) => {
    const section = showDirectionSections && group.boundLabel ? [`${group.boundLabel}:`] : [];
    const branchLines = group.realTier
      .map(direction => {
        const label = resolveBranchLabel({
          headsign: duplicateDirectionHeadsigns && group.boundLabel ? null : direction.headsign,
          shortName: currentRoute.routeShortName ?? '',
          longName: currentRoute.routeLongName ?? '',
          directionId: needsNumbered ? gi : group.dirId,
          boundLabel: group.boundLabel,
          multipleDirections: showDirectionSections || duplicateDirectionHeadsigns,
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
        const varies = period !== 'all' && direction.headwayByPeriodSustained?.[period] === false;
        const range = routeCardDisplayHeadwayRange(direction, period);
        return `- ${reportLabel}: ${headway != null ? `every ${headway} min` : range ?? (varies ? 'frequency varies' : 'no data for this period')}`;
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
    return [...section, ...branchLines, ...limitedLines];
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
      `  Route ID: ${direction.routeId}`,
      `  Direction ID: ${direction.directionId}`,
      `  Headsign: ${direction.headsign ?? 'none'}`,
      `  Tier: ${direction.tier ?? 'none'}`,
      `  Raw headway: ${direction.headway ?? 'none'} min`,
      `  Displayed headway: ${routeCardDisplayHeadway(direction, period) ?? 'none'} min`,
      `  Headway by period: ${formatMetricMap(direction.headwayByPeriod)}`,
      `  Typical gap range by period: ${JSON.stringify(direction.headwayRangeByPeriod ?? {})}`,
      `  Longest gap by period: ${formatMetricMap(direction.maxGapByPeriod)}`,
      `  Sustained by period: ${JSON.stringify(direction.headwayByPeriodSustained ?? {})}`,
      `  Hourly headways for ${period}: ${formatMetricMap(selectedPeriodHourlyHeadways)}`,
      `  Minimum stop headway by period: ${formatMetricMap(direction.minStopHeadwayByPeriod)}`,
      `  Headsign minimum stop headway by period: ${formatMetricMap(direction.headsignMinStopHeadwayByPeriod)}`,
      `  Stop headways for ${period}: ${formatMetricMap(selectedPeriodStopHeadways)}`,
    ].join('\n');
  }).join('\n\n');
  const reportDetails = [
    `**Agency:** ${routeAgency?.name ?? routeSlug ?? 'Unknown'}`,
    `**Route:** ${currentRoute.routeShortName ?? 'Unknown'}${currentRoute.routeLongName ? ` — ${currentRoute.routeLongName}` : ''}`,
    `**Period:** ${period}`,
    `**Agency data refreshed:** ${routeAgency?.lastRefreshedAt ?? 'unknown'}`,
    `**Feed expiry:** ${routeAgency?.lastFeedExpiry ?? 'unknown'}`,
    '**Displayed service:**',
    ...(reportServiceLines.length > 0 ? reportServiceLines : ['- No displayed service rows']),
    '',
    '**Generated route metrics (loaded artifact):**',
    reportRawMetrics,
    `**Atlas URL:** ${currentAtlasUrl()}`,
  ].join('\n');

  return (
    <SidebarCardShell>
      {liveRouteInfo && liveStatus !== 'noData' && (
        <div className="flex items-center gap-1.5 -mt-1 mb-2">
          <span className="w-1.5 h-1.5 rounded-full bg-[var(--text-dim)] shrink-0" />
          <span className="text-[10px] font-black text-[var(--text-dim)]">Scheduled</span>
        </div>
      )}
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
            showLiveReason={!!liveRouteInfo && liveStatus !== 'noData'}
            excludeReasons={['Stop is missing, misplaced, or assigned incorrectly']}
          />
        </div>
      </SidebarCardHeaderBlock>
      {variantFamily && (
        <p className="text-[10px] text-[var(--text-dim)] -mt-1 mb-3">
          Includes variants {variantFamily.members.map(m => m.shortName).join(', ')}
          {variantFamily.combinedHeadwayMin != null && (
            <> · combined every ~{variantFamily.combinedHeadwayMin} min on shared sections</>
          )}
        </p>
      )}
      {(() => {
        const HOURS = SPARKLINE_HOURS;
        const hoveredSingleBranch = hoveredBranch?.headsign != null;
        const sparklineDirs = hoveredSingleBranch
          ? currentRoute.directions.filter(
            d => dirIdNum(d.directionId) === dirIdNum(hoveredBranch.directionId) && d.headsign === hoveredBranch.headsign,
          )
          : sparklineSourceDirections(currentRoute.directions, primaryMultiBranch?.realTier);
        const hasTrunkSparkline = !!primaryMultiBranch && shouldShowTrunkSummary(primaryMultiBranch.realTier, period);
        const showTrunkSparkline = !hoveredSingleBranch && hasTrunkSparkline;
        const merged = showTrunkSparkline
          ? trunkSparklineByHour(primaryMultiBranch!.realTier, HOURS)
          : sparklineHeadwayByHour(sparklineDirs, HOURS);
        const stackedByHour = showTrunkSparkline
          ? Object.fromEntries(HOURS.map(h => [h, primaryMultiBranch!.realTier
              .map((branch, i) => ({
                label: branch.headsign ?? `Branch ${i + 1}`,
                headway: buildRouteServiceSummary(branch).branch.byHour?.[h] ?? null,
                color: ['#2563eb', '#db2777', '#059669', '#d97706'][i % 4],
              }))
              .filter((segment): segment is { label: string; headway: number; color: string } => segment.headway != null)]))
          : undefined;
        const hasAny = HOURS.some(h => merged[h] != null);
        if (!hasAny) return null;
        return (
          <>
            {hasTrunkSparkline && coreHeadway != null && (
              <div
                className={`flex items-center gap-2 mt-6 mb-[-1rem] cursor-pointer rounded-md transition-colors hover:bg-[var(--bg-hover)] ${hoveredSingleBranch ? 'invisible' : ''}`}
                onMouseEnter={() => setHoveredBranch({
                  directionId: primaryMultiBranch!.dirId,
                  headsigns: primaryMultiBranch!.realTier
                    .filter(d => d.tier !== 'infrequent' && d.tier !== 'span' && !/drop[- ]?offs?\s+only/i.test(d.headsign ?? ''))
                    .map(d => d.headsign)
                    .filter((headsign): headsign is string => !!headsign),
                  isCore: true,
                })}
                onMouseLeave={() => setHoveredBranch(null)}
                title="Highlight the shared core area on the map"
              >
                <span className="text-[10px] font-black text-[var(--text-muted)]">Core area</span>
                <span className="text-[9px] font-bold text-[var(--text-dim)]">combined every {coreHeadway} min</span>
              </div>
            )}
            <HeadwaySparkline
              byHour={merged}
              stackedByHour={stackedByHour}
              period={period}
              onPeriodChange={p => setPeriod(p as TimePeriod)}
              onHourHover={setHoveredHour}
            />
          </>
        );
      })()}
      {selectedPeriod && !hasPeriodService && (
        <div className="mt-4 mb-3 rounded-xl bg-[var(--bg-app)] px-3 py-2.5">
          <p className="text-[10px] font-black text-[var(--text-primary)]">
            No scheduled service during {selectedPeriod.label}
          </p>
          <p className="text-[9px] font-bold text-[var(--text-dim)] mt-0.5">
            {formatPeriodRangeLong(selectedPeriod.startHour, selectedPeriod.endHour)}. This route may run during another period.
          </p>
        </div>
      )}
      {selectedPeriod && unevenPeriodMaxGap > 0 && (
        <div className="mt-4 mb-3 rounded-xl bg-[var(--bg-app)] px-3 py-2.5">
          <p className="text-[10px] font-black text-[var(--text-primary)]">
            Service is uneven during {selectedPeriod.label}.
          </p>
          <p className="text-[9px] font-bold text-[var(--text-dim)] mt-0.5">
            Longest gap: {unevenPeriodMaxGap} minutes.
          </p>
        </div>
      )}
      <SidebarCardList>
        {selectedRouteOutOfFilter && (
          <div className={CARD_NOTICE_FOOTER}>
            <p className={CARD_NOTICE}>
              This route is outside the active frequency filter, but remains visible because it is selected.
            </p>
          </div>
        )}
        {(() => {
          const branchLabel = (group: DirectionGroup, headsign: string | null | undefined, gi: number) =>
            resolveBranchLabel({
              // Some feeds repeat one generic headsign in both directions. The existing
              // bound labels are more useful to riders than rendering the same destination twice.
              headsign: duplicateDirectionHeadsigns && group.boundLabel ? null : headsign,
              shortName: currentRoute.routeShortName ?? '',
              longName: currentRoute.routeLongName ?? '',
              directionId: needsNumbered ? gi : group.dirId,
              boundLabel: group.boundLabel,
              multipleDirections: showDirectionSections || duplicateDirectionHeadsigns,
              sectionBoundLabel: showDirectionSections ? group.boundLabel : undefined,
            });
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
          const multiBranchGroup = (g: DirectionGroup) => g.realTier.length >= 2;
          return displayGroups.map((group, gi) => {
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
              .map(d => branchLabel(group, d.headsign, gi))
              .filter(Boolean);
            return (
              <React.Fragment key={group.dirId}>
                {gi > 0 && showDirectionSections && <CardDivider />}
                {showDirectionSections && group.boundLabel && (
                  <CardSectionLabel className="mb-0">{group.boundLabel}</CardSectionLabel>
                )}
                <div className="space-y-2">
                  {group.realTier.map((d, i) => {
                    const filterHw = buildRouteServiceSummary(d).filter;
                    const dimmed = maxHeadway !== Infinity && (metricValueForPeriod(filterHw, period) ?? Infinity) > maxHeadway;
                    return (() => {
                      const varies = period !== 'all' && d.headwayByPeriodSustained?.[period] === false;
                      const displayH = varies ? undefined : hoveredHour != null
                        ? buildRouteServiceSummary(d).branch.byHour?.[hoveredHour] ?? routeCardDisplayHeadway(d, period)
                        : routeCardDisplayHeadway(d, period);
                      const displayRange = routeCardDisplayHeadwayRange(d, period);
                      const label = branchLabel(group, d.headsign, gi);
                      if (!label && !collapseGroups && displayH == null && displayRange == null) return null;
                      const trunkHw = hoveredHour == null && period !== 'all'
                        ? headsignTrunkHeadway(d, period)
                        : undefined;
                      return (
                        <FlaggableValue key={`r${i}`} reason="Frequency is wrong" reportRef={reportRef}>
                          <CardDirectionRow
                            label={label}
                            headway={displayH ?? undefined}
                            headwayStatus={displayRange ?? (varies ? 'varies' : undefined)}
                            trunkHeadway={trunkHw}
                            allowTrunkRange={multiBranchGroup(group)}
                            dimmed={dimmed}
                            {...branchHoverProps(group.dirId, d.headsign)}
                          />
                        </FlaggableValue>
                      );
                    })();
                  })}
                  {(!hideSpan || group.realTier.length === 0) && exclusiveSpans.length === 1 && (
                    <CardDirectionRow
                      key="s0"
                      label={branchLabel(group, exclusiveSpans[0].headsign, gi) || 'limited service'}
                      limited
                      {...branchHoverProps(group.dirId, exclusiveSpans[0].headsign)}
                    />
                  )}
                  {(!hideSpan || group.realTier.length === 0) && exclusiveSpans.length > 1 && (
                    <CardDirectionRow key="smulti" label={exclusiveSpanNames.join(' · ')} limited />
                  )}
                  {hideSpan && group.realTier.length > 0 && exclusiveSpanNames.length > 0 && (
                    <CardDirectionRow key="span-hint" label={exclusiveSpanNames.join(' · ')} limitedHint />
                  )}
                </div>
              </React.Fragment>
            );
          });
        })()}
        {(routeIsStale || routeAgency?.feedReviewStatus === 'review' || routeOverrideNote || hasRouteDataQualityWarning) && onInfoOpen && (
          <div className={`${CARD_NOTICE_FOOTER} space-y-1`}>
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
                message={`This schedule may be outdated${expDateStr ? ` and ended ${expDateStr}` : ''}.`}
                onLearnMore={() => onInfoOpen('about', {
                  helpTopic: 'outdated-schedule',
                  agencyName: routeAgency?.name,
                  expDateStr: expDateStr || undefined,
                  lastRefreshedAt: routeAgency?.lastRefreshedAt ?? undefined,
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
          </div>
        )}
      </SidebarCardList>
    </SidebarCardShell>
  );
};
