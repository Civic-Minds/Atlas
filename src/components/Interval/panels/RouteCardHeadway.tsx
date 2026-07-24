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
} from '../cardUi';
import { CARD_NOTICE_FOOTER } from '../../../styles';
import { SPARKLINE_HOURS, TIME_PERIODS, formatPeriodRangeLong, periodKeyForHour } from '../../../../shared/config';
import { routeCardDisplayHeadway } from '../../../utils/effectiveHeadway';
import { buildRouteServiceSummary, metricValueForPeriod } from '../../../utils/routeFacts';
import {
  dirIdNum,
  headsignTrunkHeadway,
  sparklineSourceDirections,
  shouldShowTrunkSummary,
  trunkSparklineByHour,
} from '../../../utils/routeCardTrunk';
import { shouldShowDirectionSections } from '../../../utils/routeCardDirectionLayout';
import type { VariantFamily } from '../../../utils/routeVariants';
import { currentAtlasUrl } from '../../../utils/reportIssue';

function medianHeadway(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
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
  expDateStr,
  hoveredBranch,
  setHoveredBranch,
  onInfoOpen,
}) => {
  const agencyDisplayName = shortenAgencyName(routeAgency?.name ?? routeSlug ?? '');
  const selectedPeriod = period !== 'all' ? TIME_PERIODS.find(p => p.key === period) : undefined;
  const hasPeriodService = period === 'all' || directionGroups.some(group =>
    group.realTier.some(direction => routeCardDisplayHeadway(direction, period) != null) ||
    group.span.length > 0,
  );

  // Largest multi-branch direction group — same branches as WESTBOUND/EASTBOUND rows.
  const primaryMultiBranch = directionGroups
    .filter(g => g.realTier.length >= 2)
    .sort((a, b) => b.realTier.length - a.realTier.length)[0];

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
            title={`${routeAgency?.name ?? agencyDisplayName} ${currentRoute.routeShortName ?? 'Unknown route'}${currentRoute.routeLongName ? ` — ${currentRoute.routeLongName}` : ''}`}
            details={`**Agency:** ${routeAgency?.name ?? routeSlug ?? 'Unknown'}\n**Route:** ${currentRoute.routeShortName ?? 'Unknown'}${currentRoute.routeLongName ? ` — ${currentRoute.routeLongName}` : ''}\n**Period:** ${period}\n**Atlas URL:** ${currentAtlasUrl()}`}
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
        const sparklineDirs = hoveredBranch
          ? currentRoute.directions.filter(
              d => dirIdNum(d.directionId) === dirIdNum(hoveredBranch.directionId) && d.headsign === hoveredBranch.headsign,
            )
          : sparklineSourceDirections(currentRoute.directions, primaryMultiBranch?.realTier);
        const hasTrunkSparkline = !!primaryMultiBranch && shouldShowTrunkSummary(primaryMultiBranch.realTier, period);
        const showTrunkSparkline = !hoveredBranch && hasTrunkSparkline;
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
            {hasTrunkSparkline && (
              <p className={`text-[9px] font-bold text-[var(--text-dim)] mt-6 mb-[-1rem] ${hoveredBranch ? 'invisible' : ''}`}>
                Shared section
              </p>
            )}
            <HeadwaySparkline byHour={merged} stackedByHour={stackedByHour} period={period} onPeriodChange={p => setPeriod(p as TimePeriod)} />
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
      <SidebarCardList>
        {(() => {
          const allLackHeadsigns = directionGroups.every(g => g.realTier.every(d => !d.headsign));
          const groupHeadway = (g: DirectionGroup) => g.realTier[0]
            ? buildRouteServiceSummary(g.realTier[0]).branch.value
            : null;
          const collapseGroups = allLackHeadsigns && directionGroups.length > 1 &&
            directionGroups.every(g => groupHeadway(g) === groupHeadway(directionGroups[0]));
          const displayGroups = collapseGroups ? [directionGroups[0]] : directionGroups;
          const needsNumbered = allLackHeadsigns && !collapseGroups && directionGroups.length > 1;
          const showDirectionSections = shouldShowDirectionSections(displayGroups);
          const branchLabel = (group: DirectionGroup, headsign: string | null | undefined, gi: number) =>
            resolveBranchLabel({
              headsign,
              shortName: currentRoute.routeShortName ?? '',
              longName: currentRoute.routeLongName ?? '',
              directionId: needsNumbered ? gi : group.dirId,
              multipleDirections: showDirectionSections,
              sectionBoundLabel: showDirectionSections ? group.boundLabel : undefined,
            });
          const branchHoverProps = (dirId: number, headsign: string | null | undefined) => {
            if (!headsign) return {};
            const isHovered = dirIdNum(hoveredBranch?.directionId) === dirIdNum(dirId) && hoveredBranch?.headsign === headsign;
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
                      const displayH = routeCardDisplayHeadway(d, period);
                      const label = branchLabel(group, d.headsign, gi);
                      if (!label && !collapseGroups && displayH == null) return null;
                      const trunkHw = period !== 'all'
                        ? headsignTrunkHeadway(d, period)
                        : undefined;
                      return (
                        <CardDirectionRow
                          key={`r${i}`}
                          label={label}
                          headway={displayH ?? undefined}
                          trunkHeadway={trunkHw}
                          allowTrunkRange={multiBranchGroup(group)}
                          dimmed={dimmed}
                          {...branchHoverProps(group.dirId, d.headsign)}
                        />
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
        {(routeIsStale || routeAgency?.feedReviewStatus === 'review' || routeAgency?.overrideNote) && onInfoOpen && (
          <div className={`${CARD_NOTICE_FOOTER} space-y-1`}>
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
                  agencyName: routeAgency.name,
                  lastRefreshedAt: routeAgency.lastRefreshedAt ?? undefined,
                  websiteUrl: routeAgency.websiteUrl ?? undefined,
                })}
              />
            )}
            {routeAgency?.overrideNote && (
              <CardHelpNotice
                message="We corrected this data."
                onLearnMore={() => onInfoOpen('about', {
                  helpTopic: 'corrected-data',
                  agencyName: routeAgency.name,
                  overrideNote: routeAgency.overrideNote,
                  issueUrl: routeAgency.issueUrl,
                })}
              />
            )}
          </div>
        )}
      </SidebarCardList>
    </SidebarCardShell>
  );
};
