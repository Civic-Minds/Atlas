import type { HoveredBranch, ShapeProperties, TimePeriod } from '../hooks/useIntervalStats';
import { resolveBranchLabel } from './format';
import { hasDirectionPeriodService, NO_REGULAR_SERVICE_LABEL } from './effectiveHeadway';
import { buildRouteServiceSummary } from './routeFacts';
import { unevenPeriodMaxGap } from './routeCardUneven';
import { rowTrips } from './rowTrips';
import { routeCardRowValue, type RouteCardRowValue } from './routeCardRowValue';
import { dirIdNum, groupTrunkHeadway, sharedStopIdsForBranches, sharedStretchHeadway, shouldShowBranchHeadwayRange, shouldShowTrunkSummary, sparklineSourceDirections, stretchSharedHeadway } from './routeCardTrunk';
import { shouldShowDirectionSections } from './routeCardDirectionLayout';
import { rowLabelWithOrigin } from './rowOriginLabel';
import { hasStretchRoles, routeFilterAllDayContract, routeFilterContract, type RouteContract } from './stretchCard';
import { featurePassesHeadwayFilter } from '../../shared/routeHeadwayFilter';
import { headwayAbout, headwayAboutRange } from './headwayText';
import { LIMITED_SERVICE_LABEL, NO_REGULAR_SERVICE_SHORT_LABEL, SHARED_STRETCH_LABEL } from '../content/noticeCopy';
import type { RouteCardDirectionGroup } from './routeCardDirectionGroups';

/**
 * The route card's rows, built once (CIV-987). Every part of the card (rows, Shared stretch / Combined row, hover and the
 * map highlight, the hour chart's groups, notices, the issue report) reads this model instead of re-reading the
 * direction groups its own way. Each row has a stable id. Building it changes nothing on screen: the card it renders is
 * the same markup as before, checked against a full-card dump of 12 agencies.
 */

/** The last two words held together, so a wrapped value never leaves one word alone on its line (Compare, CIV-844). */
export function keepLastWordsTogether(text: string): string {
  return text.replace(/ (\S+)$/, ' $1');
}

export interface CardRow {
  /** Stable within the card: direction, place among its rows, destination and pattern. */
  id: string;
  dirId: number;
  feature: ShapeProperties;
  /** The destination text on the row (with its origin when two rows share a destination). */
  label: string;
  /** What hovering the row sends (none for a row without a destination). */
  hover: HoveredBranch | null;
  /** The Night view's grade (CIV-934): 30, 60, or none. */
  night?: { grade: 30 | 60 | null; partOfRoute: boolean };
  /** The daytime row's number, words, colour and layout, for the chart hour under the pointer (null: none). */
  display: (hoveredHour: number | null) => CardRowDisplay;
}

export interface CardRowDisplay {
  value: RouteCardRowValue;
  limitedLabel?: string;
  singleLine: boolean;
  valueEnd: boolean;
}

export interface CardSpanRow {
  label: string;
  /** The one span branch the row stands for (none on the row naming several). */
  feature?: ShapeProperties;
  hover: HoveredBranch | null;
}

export interface CardSharedRow {
  label: string;
  headway: number;
  hover: HoveredBranch;
}

export interface CardGroup {
  /** The direction group the rows come from (also the hour chart's input). */
  source: RouteCardDirectionGroup;
  dirId: number;
  boundLabel?: string;
  shared: CardSharedRow | null;
  /** A route that fails the filter as a whole can still have a shared stretch that passes. */
  onlySharedPasses: boolean;
  rows: CardRow[];
  /** Span-only branches not already a row: one row each when there is one, else one row naming them all. */
  spanRows: CardSpanRow[];
  hasVisibleRows: boolean;
}

export interface RouteCardModelInput {
  directions: ShapeProperties[];
  routeShortName: string | null;
  routeLongName: string | null;
  directionGroups: RouteCardDirectionGroup[];
  agencyFeatures?: readonly GeoJSON.Feature[];
  period: TimePeriod;
  maxHeadway: number;
  nightView: boolean;
  /** Compare (CIV-844). */
  stableColors: boolean;
  /** Not read: the card and its report show span rows whether or not the irregular-service filter is on (#1230). */
  hideSpan: boolean;
}

export interface RouteCardModel {
  stretchMode: boolean;
  contract: RouteContract | undefined;
  allDay: { filterValue: number | null; limited: boolean } | undefined;
  noRegularService: boolean;
  noRegularLabel: string;
  hasPeriodService: boolean;
  hasPartialPeriodService: boolean;
  /** The longest rider-meaningful gap for the uneven notice (0: none). Read only when the beta flag is on. */
  unevenGap: () => number;
  primaryMultiBranch: RouteCardDirectionGroup | undefined;
  activeRangeDirections: ShapeProperties[];
  doesNotRun: boolean;
  /** Identical unnamed directions shown as one. */
  collapseGroups: boolean;
  /** The groups the card shows, after collapsing identical unnamed directions. */
  displayGroups: RouteCardDirectionGroup[];
  showDirectionSections: boolean;
  groups: CardGroup[];
  /** Each shown row's number, for the part-period filter notice (CIV-1069). */
  rowHeadways: number[];
  reportServiceLines: string[];
}

/** A row matches the hovered one by headsign (or the core row's headsigns) and, when the hovered row has one, its pattern (#1064). */
export function matchesHoveredBranch(hoveredBranch: HoveredBranch | null, headsign: string | null | undefined, routeVariant: string | null | undefined): boolean {
  return (hoveredBranch?.headsign === headsign || hoveredBranch?.headsigns?.includes(headsign ?? '') === true)
    && (!hoveredBranch?.routeVariant || (routeVariant ?? '') === hoveredBranch.routeVariant);
}

/** The row is the hovered one (the Shared stretch row's hover lights only itself, not the rows it combines). */
export function rowIsHovered(hoveredBranch: HoveredBranch | null, row: { dirId: number; feature: ShapeProperties }): boolean {
  return dirIdNum(hoveredBranch?.directionId) === dirIdNum(row.dirId) && hoveredBranch?.isCore !== true
    && matchesHoveredBranch(hoveredBranch, row.feature.headsign, row.feature.routeVariant);
}

/** The Shared stretch / Combined row of this group is hovered. */
export function sharedIsHovered(hoveredBranch: HoveredBranch | null, dirId: number): boolean {
  return hoveredBranch?.isCore === true && dirIdNum(hoveredBranch.directionId) === dirIdNum(dirId);
}

function rowHover(dirId: number, headsign: string | null | undefined, routeVariant?: string | null): HoveredBranch | null {
  if (!headsign) return null;
  return { directionId: dirId, headsign, ...(routeVariant ? { routeVariant } : {}) };
}

/**
 * The words a row's value shows on the card (RouteDirectionRow): its limited words, the trunk-to-branch range, its own
 * words or its number. Null data reads "no data for this period", never a claim that nothing runs (#297).
 */
export function reportRowValueText(row: CardRow): string {
  if (row.night) return row.night.grade != null ? headwayAbout(row.night.grade) : NO_REGULAR_SERVICE_SHORT_LABEL;
  const { value, limitedLabel } = row.display(null);
  if (value.isLimited) return limitedLabel ?? LIMITED_SERVICE_LABEL;
  if (value.headway == null) return 'no data for this period';
  if (value.trunkHeadway != null && shouldShowBranchHeadwayRange(value.trunkHeadway, value.headway)) {
    return headwayAboutRange(value.trunkHeadway, value.headway);
  }
  return value.headwayLabel ?? headwayAbout(value.headway);
}

export function buildRouteCardModel(input: RouteCardModelInput): RouteCardModel {
  const { directions, directionGroups, agencyFeatures, period, maxHeadway, nightView, stableColors } = input;
  // Frequency focus: rows come from the stretches, and the route-level number is the filter's own value with its range.
  const stretchMode = hasStretchRoles(directions);
  const contract = routeFilterContract(directions, period);
  // All day reads the route's all-day filter value (routeAllDayHeadway), the same as the lists.
  const allDay = period === 'all' ? routeFilterAllDayContract(directions) : undefined;
  const noRegularService = (contract != null && contract.filterValue == null && contract.runs)
    || (allDay != null && allDay.filterValue == null);
  const noRegularLabel = allDay?.limited ? LIMITED_SERVICE_LABEL : NO_REGULAR_SERVICE_LABEL;
  const hasPeriodService = period === 'all' || directionGroups.some(group =>
    group.realTier.some(direction => rowTrips(direction, period).value != null) ||
    group.span.length > 0,
  );
  const hasPartialPeriodService = period !== 'all' && !hasPeriodService && directions.some(direction =>
    hasDirectionPeriodService(direction, period),
  );
  // Largest multi-branch direction group: the same branches as the Westbound / Eastbound rows.
  const primaryMultiBranch = directionGroups
    .filter(g => g.realTier.length >= 2)
    .sort((a, b) => b.realTier.length - a.realTier.length)[0];
  const activeRangeDirections = sparklineSourceDirections(directions, primaryMultiBranch?.realTier);

  const allLackHeadsigns = directionGroups.every(g => g.realTier.every(d => !d.headsign));
  const groupHeadway = (g: RouteCardDirectionGroup) => g.realTier[0]
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
  const destinationLabel = (group: RouteCardDirectionGroup, direction: ShapeProperties, gi: number) => resolveBranchLabel({
    headsign: direction.headsign,
    shortName: input.routeShortName ?? '',
    longName: input.routeLongName ?? '',
    directionId: needsNumbered ? gi : group.dirId,
    multipleDirections: showDirectionSections,
    sectionBoundLabel: showDirectionSections ? group.boundLabel : undefined,
  });
  const branchLabel = (group: RouteCardDirectionGroup, direction: ShapeProperties, gi: number) =>
    rowLabelWithOrigin(destinationLabel(group, direction, gi), direction, group.realTier);
  const rowContext = { period, hoveredHour: null, stretchMode, allDay, contract, noRegularService, maxHeadway };
  const rowDisplay = (d: ShapeProperties, pooledMainH?: number, sharedRowShown?: boolean) => (hoveredHour: number | null): CardRowDisplay => {
    const value = routeCardRowValue(d, { ...rowContext, hoveredHour, pooledMainH, sharedRowShown });
    return {
      value,
      limitedLabel: value.isLimited && value.edgeText ? value.edgeText : value.rowNoRegular ? (stableColors ? keepLastWordsTogether(noRegularLabel) : noRegularLabel) : undefined,
      // Compare (CIV-844): a row that reads "no regular service during this period" puts the whole
      // destination name on its line and the value under it (the row's own wrap layout), never "to Roncesval…".
      singleLine: !(stableColors && value.rowNoRegular),
      valueEnd: stableColors && value.rowNoRegular,
    };
  };

  const groups: CardGroup[] = displayGroups.map((group, gi) => {
    // CIV-82: real pooled departures replace the reciprocal-of-medians estimate when the
    // data has them ("Shared stretch every N"; branch rows keep each branch's own M).
    const groupShared = stretchMode ? null : sharedStretchHeadway(agencyFeatures, group.realTier, period, maxHeadway);
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
    const shared: CardSharedRow | null = groupHasCoreSummary && groupCoreHeadway != null
      ? {
        label: groupShared || stretchShared != null ? SHARED_STRETCH_LABEL : 'Combined',
        headway: groupCoreHeadway,
        hover: { directionId: group.dirId, headsigns: coreHeadsigns, sharedStopIds: groupSharedStopIds, sharedHeadway: groupCoreHeadway, isCore: true },
      }
      : null;

    const rows: CardRow[] = group.realTier.map((d, i) => {
      const base = {
        id: `${group.dirId}:${i}:${(d.headsign ?? '').trim().toLowerCase()}:${d.routeVariant?.trim().toLowerCase() ?? ''}`,
        dirId: group.dirId,
        feature: d,
        label: branchLabel(group, d, gi),
        hover: rowHover(group.dirId, d.headsign, d.routeVariant),
      };
      if (nightView) {
        // The row's night grade: 30 when it passes the 30-minute night check, else 60 when it passes the
        // hourly one, as the Night list reads it (an upper bound, never overstated).
        const grade = d.nightService30 === true ? 30 : d.nightService60 === true || d.nightService === true ? 60 : null;
        return { ...base, night: { grade, partOfRoute: d.nightServicePartOfRoute === true }, display: rowDisplay(d) };
      }
      return { ...base, display: rowDisplay(d, group.pooledMain?.feature === d ? group.pooledMain.headway : undefined, shared != null) };
    });

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
    // Span-only branches use the same limited row whether or not the irregular-service
    // filter is on: the filter hides them from the map, not from the route's own card.
    const spanRows: CardSpanRow[] = exclusiveSpans.length === 1
      ? [{ label: branchLabel(group, exclusiveSpans[0], gi) || 'limited service', feature: exclusiveSpans[0], hover: rowHover(group.dirId, exclusiveSpans[0].headsign, exclusiveSpans[0].routeVariant) }]
      : exclusiveSpans.length > 1
        ? [{ label: exclusiveSpans.map(d => branchLabel(group, d, gi)).filter(Boolean).join(' · '), hover: null }]
        : [];

    return {
      source: group,
      dirId: group.dirId,
      boundLabel: group.boundLabel,
      shared,
      onlySharedPasses,
      rows,
      spanRows,
      hasVisibleRows: groupHasCoreSummary || group.realTier.length > 0 || exclusiveSpans.length > 0,
    };
  });

  // #1230: the issue report states what the card shows, row by row, read from the same groups and rows (it used to
  // recompute its own values: TTC 100 AM read "every 32" beside the card's "Shared stretch every 5").
  const reportServiceLines = groups.flatMap((group, gi) => {
    const section = showDirectionSections && group.boundLabel ? [`${group.boundLabel}:`] : [];
    const shown = group.rows.map(row => ({ row, value: row.night ? null : row.display(null).value }));
    const branchHeadways = [...new Set(shown
      .map(({ value }) => (value && !value.isLimited ? value.headway : undefined))
      .filter((h): h is number => h != null))].sort((a, b) => a - b);
    const sharedLines = group.shared
      ? [`- ${group.shared.label} ${headwayAbout(group.shared.headway)}${branchHeadways.length === 0 ? ''
        : `; each branch ${branchHeadways.length === 1 ? headwayAbout(branchHeadways[0]) : headwayAboutRange(branchHeadways[0], branchHeadways[branchHeadways.length - 1])}`}`]
      : [];
    const branchLines = shown.map(({ row }) => {
      // The report's whole job is completeness: a row whose label is empty (redundant with its section) still gets
      // one (#300).
      const reportLabel = row.label || row.feature.headsign?.trim() || `Direction ${row.feature.directionId ?? gi}`;
      return `- ${reportLabel}: ${reportRowValueText(row)}`;
    });
    const spanLines = group.spanRows.filter(span => span.label).map(span => `- ${span.label}: ${LIMITED_SERVICE_LABEL}`);
    return [...section, ...sharedLines, ...branchLines, ...spanLines];
  });

  const rowHeadways = groups.flatMap(g => g.source.realTier).map(d => routeCardRowValue(d, rowContext).headway)
    .filter((h): h is number => typeof h === 'number');

  return {
    stretchMode, contract, allDay, noRegularService, noRegularLabel, hasPeriodService, hasPartialPeriodService,
    unevenGap: () => unevenPeriodMaxGap(directionGroups, period),
    primaryMultiBranch, activeRangeDirections, doesNotRun, collapseGroups, displayGroups, showDirectionSections, groups, rowHeadways, reportServiceLines,
  };
}
