import type { HoveredBranch, ShapeProperties, TimePeriod } from '../hooks/useIntervalStats';
import type { PeriodKey } from '../../shared/config';
import { resolveBranchLabel } from './format';
import { directionBranchFallback } from '../../shared/headsignDisplay';
import { hasDirectionPeriodService, mainStretchEdge, periodEdgeText } from './effectiveHeadway';
import { buildRouteServiceSummary } from './routeFacts';
import { unevenPeriodMaxGap } from './routeCardUneven';
import { rowOwnTreatment, rowOwnTripsEven, rowTrips } from './rowTrips';
import { routeCardRowValue, type RouteCardRowValue } from './routeCardRowValue';
import { dirIdNum, groupTrunkHeadway, oneRowMainStretchHeadway, sharedStopIdsForBranches, sharedStretchHeadway, shouldShowTrunkSummary, sparklineSourceDirections, stretchSharedHeadway } from './routeCardTrunk';
import { shouldShowDirectionSections } from './routeCardDirectionLayout';
import { rowLabelWithOrigin } from './rowOriginLabel';
import { branchBase, branchCodeOf } from '../../shared/branchCode';
import { hasStretchRoles, routeFilterAllDayContract, routeFilterContract, stretchRowFeatures, type RouteContract } from './stretchCard';
import { branchRowValue, directionPieceTreatments, tailText } from './branchReadings';
import { BRANCH_READINGS_ENABLED } from '../../shared/rules/flags';
import { featurePassesHeadwayFilter } from '../../shared/routeHeadwayFilter';
import { headwayAbout, headwayAboutRange, headwayRangeShown } from './headwayText';
import { LIMITED_SERVICE_LABEL, noNumberRowLabel, SHARED_STRETCH_LABEL } from '../content/noticeCopy';
import { buildDirectionGroups, type RouteCardDirectionGroup } from './routeCardDirectionGroups';
import { rowNightGrade, type NightServiceFrequency } from '../../shared/nightService';

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
  night?: { grade: NightServiceFrequency | null; partOfRoute: boolean };
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
  /** CIV-1251 row 8: the shared stretch's own late start or early end ("every 15 min from 8:07 AM"), in place of the number. */
  edgeText?: string;
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
  /** CIV-995 (b): rows read their stretch's values (default). false keeps each row's own trips: the lists' range and History
   * (routeCardLowestHeadway) and the stop card's no-number words (routeCardNoNumberWords) don't change with the card. */
  stretchValues?: boolean;
  /** #1506: the map colours lines section by section (beta, FEATURES.segmentColours); see RouteCardRowContext.sectionColours. */
  sectionColours?: boolean;
  /** CIV-1959 B3: the trunk line and each branch's own reading or no number, from the pieceReadings data. Behind BRANCH_READINGS_ENABLED. */
  branchReadings?: boolean;
}

export interface RouteCardModel {
  stretchMode: boolean;
  contract: RouteContract | undefined;
  allDay: { filterValue: number | null; limited: boolean } | undefined;
  noRegularService: boolean;
  noRegularLabel: string;
  /** CIV-1251: what a row the card can't give a number reads (noNumberRowLabel): Irregular in a period, or overnight on the Night card. */
  limitedWord: string;
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

/** CIV-1456: the row's branch ID, from processing's headsign code, the route_variant or a lettered short name, in that order. */
export function rowBranchCode(row: Pick<ShapeProperties, 'branchCode' | 'routeVariant' | 'routeShortName'>, base: string): string | null {
  return branchCodeOf(row.branchCode, base) ?? branchCodeOf(row.routeVariant, base) ?? branchCodeOf(row.routeShortName, base);
}

/** A row label led by its branch ID, in the card's "variant · label" form; unchanged with no ID or one it already shows. */
export function withBranchCode(label: string, code: string | null): string {
  if (!code) return label;
  if (!label) return code;
  return label.toUpperCase().startsWith(code.toUpperCase()) ? label : `${code} · ${label}`;
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
  if (row.night) return row.night.grade != null ? headwayAbout(row.night.grade) : noNumberRowLabel({ nightView: true });
  const { value, limitedLabel } = row.display(null);
  if (value.isLimited) return limitedLabel ?? LIMITED_SERVICE_LABEL;
  if (value.headway == null) return 'no data for this period';
  if (value.trunkHeadway != null && headwayRangeShown(value.trunkHeadway, value.headway)) {
    return headwayAboutRange(value.trunkHeadway, value.headway);
  }
  return value.headwayLabel ?? headwayAbout(value.headway);
}

export function buildRouteCardModel(input: RouteCardModelInput): RouteCardModel {
  const { directions, directionGroups, agencyFeatures, period, maxHeadway, nightView, stableColors } = input;
  const stretchValues = input.stretchValues !== false;
  const branchReadings = input.branchReadings ?? BRANCH_READINGS_ENABLED;
  // Frequency focus: rows come from the stretches, and the route-level number is the filter's own value with its range.
  const stretchMode = hasStretchRoles(directions);
  const contract = routeFilterContract(directions, period);
  // All day reads the route's all-day filter value (routeAllDayHeadway), the same as the lists.
  const allDay = period === 'all' ? routeFilterAllDayContract(directions) : undefined;
  const noRegularService = (contract != null && contract.filterValue == null && contract.runs)
    || (allDay != null && allDay.filterValue == null);
  const noRegularLabel = noNumberRowLabel({ nightView });
  const limitedWord = noRegularLabel;
  const hasPeriodService = period === 'all' || directionGroups.some(group =>
    group.realTier.some(direction => rowTrips(direction, period, { stretch: stretchValues }).value != null) ||
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
  // #1277: a period the route only runs part of (TTC 110 Sunday AM, from 7:52 AM) still runs where a row reads its start or
  // end ("every 30 min from 7:53 AM", rowReadsPeriodEdge): the card shows those rows, and only those (no "limited" beside
  // them), not "no scheduled trips".
  const noFilterValue = contract != null && contract.filterValue == null && !contract.runs;
  const partPeriodGroups = noFilterValue && period !== 'all'
    ? directionGroups
      .map(group => ({ ...group, realTier: group.realTier.filter(direction => rowTrips(direction, period, { stretch: stretchValues, branchReadings }).partPeriod != null), span: [] }))
      .filter(group => group.realTier.length > 0 || sharedStretchEdge(group, period, stretchMode) != null)
    : [];
  const doesNotRun = noFilterValue && partPeriodGroups.length === 0;
  const displayGroups = doesNotRun ? [] : partPeriodGroups.length > 0 ? partPeriodGroups : collapseGroups ? [directionGroups[0]] : directionGroups;
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
  // CIV-1456: a branch row leads with the branch ID the agency's data names (TTC 52A, GO 41G, Halifax 10B); no ID, no change.
  const base = branchBase(input.routeShortName ?? '');
  // A row speaks for one branch only when nothing else to its destination in that direction carries another ID (or none):
  // a row that stands for 10A, 10B and 10C to one stop, or a stretch row several variants share, gets no ID.
  const destinationKey = (d: ShapeProperties) => (d.headsign ?? '').trim().toLowerCase();
  const rowCode = (group: RouteCardDirectionGroup, d: ShapeProperties): string | null => {
    const code = rowBranchCode(d, base);
    if (!code) return null;
    const key = destinationKey(d);
    if (group.realTier.filter(r => destinationKey(r) === key).length > 1) return code;
    const peers = (group.directionFeatures ?? directions.filter(x => dirIdNum(x.directionId) === dirIdNum(group.dirId))).filter(x => destinationKey(x) === key);
    return peers.every(p => rowBranchCode(p, base) === code) ? code : null;
  };
  const branchLabel = (group: RouteCardDirectionGroup, direction: ShapeProperties, gi: number) =>
    withBranchCode(rowLabelWithOrigin(destinationLabel(group, direction, gi), direction, group.realTier), rowCode(group, direction));
  const rowContext = { period, hoveredHour: null, stretchMode, allDay, contract, noRegularService, maxHeadway, stretchValues, sectionColours: input.sectionColours, branchReadings };
  const rowDisplay = (d: ShapeProperties, pooledMainH?: number, sharedRowShown?: boolean, oneRowMainH?: number) => (hoveredHour: number | null): CardRowDisplay => {
    const value = routeCardRowValue(d, { ...rowContext, hoveredHour, pooledMainH, sharedRowShown, oneRowMainH });
    return {
      value,
      limitedLabel: value.isLimited && value.edgeText ? value.edgeText : value.rowNoRegular || value.isLimited
        ? (word => (stableColors ? keepLastWordsTogether(word) : word))(value.rowNoRegular ? noRegularLabel : limitedWord)
        : undefined,
      // Compare (CIV-844): a row that reads "Runs irregularly in this period" puts the whole
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
    // CIV-1251 row 8 (Ryan, 2026-11-01): branches that take turns on a shared stretch that starts late or ends early. The
    // Shared stretch row carries the stretch's own edge ("Shared stretch every 15 min from 8:07 AM", TTC 110 Sunday AM) and
    // each branch row its own; the branches never read the shared one (rowReadsPeriodEdge).
    const sharedEdge = sharedStretchEdge(group, period, stretchMode && !nightView);
    // A shared or combined value is a daytime reading: none on the Night card (CIV-934).
    const groupHasCoreSummary = !nightView && (stretchMode ? stretchShared != null || sharedEdge != null : groupShared != null || shouldShowTrunkSummary(group.realTier, period));
    const groupCoreHeadway = sharedEdge?.every ?? groupShared?.headway ?? stretchShared ?? (groupHasCoreSummary
      ? groupTrunkHeadway(group.realTier, period === 'all' ? 'midday' : period)
      : null);
    const groupSharedStopIds = groupShared?.stopIds ?? (groupHasCoreSummary ? sharedStopIdsForBranches(group.realTier) : []);
    const coreHeadsigns = group.realTier
      .filter(d => d.tier !== 'infrequent' && d.tier !== 'span' && !/drop[- ]?offs?\s+only/i.test(d.headsign ?? ''))
      .map(d => d.headsign)
      .filter((headsign): headsign is string => !!headsign);
    const sharedRow: CardSharedRow | null = groupHasCoreSummary && groupCoreHeadway != null
      ? {
        // CIV-1251: one name for the shared part of a route; how its number was worked out belongs in the glossary.
        label: SHARED_STRETCH_LABEL,
        headway: groupCoreHeadway,
        ...(sharedEdge ? { edgeText: periodEdgeText(sharedEdge) } : {}),
        hover: { directionId: group.dirId, headsigns: coreHeadsigns, sharedStopIds: groupSharedStopIds, sharedHeadway: groupCoreHeadway, isCore: true },
      }
      : null;
    // CIV-1447: a direction whose only row is a branch reads the range from the main stretch to that branch.
    const oneRowMainH = stretchMode && !nightView && sharedRow == null ? oneRowMainStretchHeadway(group, period) ?? undefined : undefined;

    const rows: CardRow[] = group.realTier.map((d, i) => {
      const base = {
        id: `${group.dirId}:${i}:${(d.headsign ?? '').trim().toLowerCase()}:${d.routeVariant?.trim().toLowerCase() ?? ''}`,
        dirId: group.dirId,
        feature: d,
        label: branchLabel(group, d, gi),
        hover: rowHover(group.dirId, d.headsign, d.routeVariant),
      };
      if (nightView) {
        // The row's night grade: 30, 60 or 90, the strictest night check it passes, as the Night list reads it
        // (an upper bound, never overstated; CIV-1329).
        const grade = rowNightGrade(d);
        return { ...base, night: { grade, partOfRoute: d.nightServicePartOfRoute === true }, display: rowDisplay(d) };
      }
      return { ...base, display: rowDisplay(d, group.pooledMain?.feature === d ? group.pooledMain.headway : undefined, sharedRow != null, oneRowMainH) };
    });
    // CIV-995 Q2 (Ryan, 2026-11-13): now that a direction's main row reads every bus on its stretch, the Shared stretch row
    // often repeats its number. It is left out when it shows exactly the same number as a main row of the group, and kept
    // whenever they differ (or it words a late start or early end). Only on the card (stretchValues): the stop card's
    // no-number words and the lists read the model as before.
    const repeats = sharedRow != null && stretchValues && !sharedRow.edgeText && rows.some(row => {
      if (row.feature.stretchRole !== 'main' || row.night) return false;
      const v = row.display(null).value;
      // A main row reading the range from that number to its short end (#1502) repeats it too.
      return !v.isLimited && !v.headwayLabel && (v.trunkHeadway ?? v.headway) === sharedRow.headway;
    });
    let shared = repeats ? null : sharedRow;
    let finalRows = rows;
    // CIV-1959 B3 (BRANCH_READINGS_ENABLED, data from ATLAS_BRANCH_READINGS=1): with the headline from the trunk, the branch wait
    // must be visible. The trunk is one line, always shown (no 0.65 rule), and each branch is its own line from its piece:
    // a reading, "every N until HH:MM" for a tail, or the no-number words (noNumberRowLabel) for a piece with too few or uneven trips. A branch the card hid for the period (#1115)
    // gets its line back. The main stretch's own row stays (it names a destination) and the trunk line is left out only when that row already reads the same number.
    const slotFeatures = branchReadings && stretchMode && !nightView ? stretchRowFeatures(group.directionFeatures ?? [], period).filter(d => d.stretchRole === 'tail') : [];
    // A branch with a feature of its own is named by it. One with none (#1636) is named by the pipeline's `to` (its terminus: a headsign, else a stop
    // name), the same "to <place>" row; a branch with neither (an origin leg, say) has no line, as today. With none that can be named, the card keeps today's rows.
    const treatments = branchReadings && stretchMode && !nightView ? directionPieceTreatments(group.directionFeatures, period) : null;
    const hasSlot = (index: number) => slotFeatures.some(d => (d.stretchIndex ?? 0) === index);
    const named = treatments && new Map([...treatments.branches].filter(([index]) => hasSlot(index) || treatments.names.has(index)));
    const pieces = treatments && named && named.size > 0 ? { ...treatments, branches: named } : null;
    if (pieces) {
      const trunkValue = pieces.trunk.v;
      // The trunk is one line, always shown, unless a main row already reads exactly that number (Ryan, CIV-995 Q2: not twice).
      const mainRowIsTrunk = pieces.trunk.t === 'reading' && rows.some(row => {
        if (row.feature.stretchRole !== 'main' || row.night) return false;
        const v = row.display(null).value;
        return !v.isLimited && !v.headwayLabel && (v.trunkHeadway ?? v.headway) === trunkValue;
      });
      shared = mainRowIsTrunk ? null : {
        label: SHARED_STRETCH_LABEL,
        headway: trunkValue,
        ...(pieces.trunk.t === 'tail' ? { edgeText: tailText(pieces.trunk) } : {}),
        hover: sharedRow?.hover ?? { directionId: group.dirId, headsigns: coreHeadsigns, sharedStopIds: groupSharedStopIds, sharedHeadway: trunkValue, isCore: true },
      };
      const rowOf = (d: ShapeProperties, i: number): CardRow => {
        const base = rows.find(r => r.feature === d);
        return base ?? {
          id: `${group.dirId}:piece${d.stretchIndex ?? i}:${(d.headsign ?? '').trim().toLowerCase()}`,
          dirId: group.dirId, feature: d, label: branchLabel(group, d, gi), hover: rowHover(group.dirId, d.headsign, d.routeVariant), display: rowDisplay(d),
        };
      };
      const tailRows = slotFeatures.flatMap((d, i) => {
        const t = pieces.branches.get(d.stretchIndex ?? 0);
        if (!t) return rows.filter(r => r.feature === d);
        const row = rowOf(d, i);
        // A piece's reading counts every trip on that stretch, so it stands for the row only where all of the row's own trips run it
        // (stretchRowPeriods, as rowStretchReading has it), and never reads better than the row's own number today: a destination
        // that shares the stretch with another keeps its own wait, never the pooled one (overstating service is worse). A piece with no number
        // holds either way: the row's trips are a part of the piece's.
        const stands = d.stretchRowPeriods?.includes(period as PeriodKey) ?? false;
        return [{ ...row, display: (hoveredHour: number | null): CardRowDisplay => {
          const shown = row.display(hoveredHour);
          const today = shown.value.isLimited || shown.value.rowNoRegular ? null : shown.value.shownHeadway ?? shown.value.headway ?? null;
          if (t.t !== 'limited') {
            if (!stands) return shown;
            // Atlas Issue Response (CIV-1251, CIV-1411): a branch row keeps the wording and value rule the card's rows always had (its typical spacing,
            // the range, the gap form, its own from / until words); a piece's reading is its stretch's longest wait and never replaces them. Only the
            // source of the trips changes (the branch's own departures), not the words.
            if (t.t === 'reading') return shown;
            if (t.t === 'tail' && today != null && t.v < today) return shown;
          }
          // CIV-1959 (Ryan: any 3 or more evenly spaced trips get a number; Atlas Issue Response: a branch's own trips decide it, not the
          // piece's pooled list): a row whose own trips pass rule D keeps its own reading, with its from / until words, under a piece with no number.
          if (t.t === 'limited') {
            if (!shown.value.isLimited && !shown.value.rowNoRegular && rowOwnTripsEven(d, period)) return shown;
            const ownT = rowOwnTreatment(d, period);
            if (ownT) { const own = branchRowValue(shown.value, ownT, ''); return { ...shown, value: own.value, limitedLabel: undefined, singleLine: true, valueEnd: false }; }
          }
          // A piece with no number reads and sits as any row with no number does (as rowDisplay has it).
          const own = branchRowValue(shown.value, t, stableColors ? keepLastWordsTogether(noRegularLabel) : noRegularLabel);
          const noNumber = t.t === 'limited';
          return { ...shown, value: own.value, limitedLabel: own.limitedLabel, singleLine: !(stableColors && noNumber), valueEnd: stableColors && noNumber };
        } }];
      });
      // #1636: a branch with no feature of its own gets a row named from where it ends ("to Tower Rd"), the words every branch row has. An origin leg
      // (one that comes before the trunk) is named from where it starts, in the existing "from A to B" form, and only when the direction has no named branch row:
      // a named row already speaks for the starting legs (DRT 900 eastbound: "to Ritson every 13-24 min" reads both of its starting legs, so the second gets no row).
      const mainFeature = rows.find(r => r.feature.stretchRole === 'main')?.feature ?? group.directionFeatures?.[0] ?? rows[0]?.feature;
      const unnamedRows = mainFeature ? [...pieces.branches].filter(([index]) => !hasSlot(index)).sort(([a], [b]) => a - b).flatMap(([index, t]): CardRow[] => {
        const name = pieces.names.get(index);
        if (!name) return [];
        if (name.from && [...pieces.branches].some(([other]) => hasSlot(other))) return [];
        const d: ShapeProperties = { ...mainFeature, headsign: name.to ?? mainFeature.headsign, routeVariant: name.from ? `from ${name.from}` : undefined, stopOrder: [`piece${index}`], stretchRole: 'tail', stretchIndex: index };
        const base = rowOf(d, index);
        // The existing origin form needs a row that starts elsewhere to count as a different origin.
        const label = name.from ? rowLabelWithOrigin(destinationLabel(group, d, gi), d, [d, { ...d, stopOrder: ['other'] }]) : base.label;
        return [{ ...base, label, id: `${group.dirId}:piece${index}:${(d.headsign ?? '').trim().toLowerCase()}`, display: (hoveredHour: number | null): CardRowDisplay => {
          const shown = base.display(hoveredHour);
          const own = branchRowValue(shown.value, t, stableColors ? keepLastWordsTogether(noRegularLabel) : noRegularLabel);
          const noNumber = t.t === 'limited';
          return { ...shown, value: own.value, limitedLabel: own.limitedLabel, singleLine: !(stableColors && noNumber), valueEnd: stableColors && noNumber };
        } }];
      }) : [];
      // A line that reads exactly as one the card already has (same words, same reading) adds nothing and is left out.
      const kept = [...rows.filter(r => r.feature.stretchRole !== 'tail'), ...tailRows];
      const readsAs = (r: CardRow) => `${r.label}\u0000${reportRowValueText(r)}`;
      const seen = new Set(kept.map(readsAs));
      finalRows = [...kept, ...unnamedRows.filter(r => { const k = readsAs(r); if (seen.has(k)) return false; seen.add(k); return true; })];
    }

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
      ? [{ label: branchLabel(group, exclusiveSpans[0], gi), feature: exclusiveSpans[0], hover: rowHover(group.dirId, exclusiveSpans[0].headsign, exclusiveSpans[0].routeVariant) }]
      : exclusiveSpans.length > 1
        ? [{ label: exclusiveSpans.map(d => branchLabel(group, d, gi)).filter(Boolean).join(' · '), hover: null }]
        : [];

    return {
      source: group,
      dirId: group.dirId,
      boundLabel: group.boundLabel,
      shared,
      onlySharedPasses,
      rows: finalRows,
      spanRows,
      hasVisibleRows: groupHasCoreSummary || pieces != null || group.realTier.length > 0 || exclusiveSpans.length > 0,
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
      ? [`- ${group.shared.label} ${group.shared.edgeText ?? headwayAbout(group.shared.headway)}${branchHeadways.length === 0 ? ''
        : `; each branch ${branchHeadways.length === 1 ? headwayAbout(branchHeadways[0]) : headwayAboutRange(branchHeadways[0], branchHeadways[branchHeadways.length - 1])}`}`]
      : [];
    const branchLines = shown.map(({ row }) => {
      // The report's whole job is completeness: a row whose label is empty (redundant with its section) still gets
      // one (#300).
      const reportLabel = row.label || row.feature.headsign?.trim() || directionBranchFallback(row.feature.directionId ?? gi);
      return `- ${reportLabel}: ${reportRowValueText(row)}`;
    });
    const spanLines = group.spanRows.filter(span => span.label).map(span => `- ${span.label}: ${limitedWord}`);
    return [...section, ...sharedLines, ...branchLines, ...spanLines];
  });

  // CIV-1199 (one calculation per fact): the numbers the rows show, read from the shown rows like the issue report above,
  // so the part-period notice never names a number no row shows (Metro Transit 10 Saturday late read "every 26 min"
  // beside its one row's "every 31 min, with one 56 min gap").
  const rowHeadways = groups.flatMap(g => g.rows)
    .map(row => (row.night ? null : row.display(null).value))
    .map(value => (value && !value.isLimited ? value.shownHeadway ?? value.headway : null))
    .filter((h): h is number => typeof h === 'number');

  return {
    stretchMode, contract, allDay, noRegularService, noRegularLabel, limitedWord, hasPeriodService, hasPartialPeriodService,
    unevenGap: () => unevenPeriodMaxGap(directionGroups, period),
    primaryMultiBranch, activeRangeDirections, doesNotRun, collapseGroups, displayGroups, showDirectionSections, groups, rowHeadways, reportServiceLines,
  };
}

/**
 * CIV-1251 row 8: the shared main stretch's own edge for a direction whose rows are branches (no main row reads it), or
 * undefined. A direction with a main row keeps the edge on that row.
 */
function sharedStretchEdge(group: RouteCardDirectionGroup, period: TimePeriod, stretchMode: boolean) {
  if (!stretchMode || period === 'all' || group.realTier.some(d => d.stretchRole === 'main')) return undefined;
  if (!(group.directionFeatures ?? []).some(d => d.stretchRole === 'tail')) return undefined;
  for (const d of group.directionFeatures ?? []) {
    const edge = mainStretchEdge(d, period);
    if (edge) return edge;
  }
  return undefined;
}

/** CIV-1251 row 8: the route card's Shared stretch time for one direction, from the route's features for the day, for the stop card. */
export function routeCardSharedStretchEdge(features: readonly ShapeProperties[], directionId: number, period: TimePeriod) {
  if (period === 'all' || !hasStretchRoles(features)) return undefined;
  const group = buildDirectionGroups({ directions: [...features] }, period).find(g => g.dirId === directionId);
  return group ? sharedStretchEdge(group, period, true) : undefined;
}
