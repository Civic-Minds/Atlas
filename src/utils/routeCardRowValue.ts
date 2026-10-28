import type { ShapeProperties, TimePeriod } from '../hooks/useIntervalStats';
import { featurePassesHeadwayFilter, routeFilterHeadway } from '../../shared/routeHeadwayFilter';
import { routeCardDisplayHeadway, routeCardDisplayLimited, routeCardPeriodShapeText } from './effectiveHeadway';
import { headwayAboutRange } from './headwayText';
import { branchDisplayHourHeadway } from './routeFacts';
import { headsignTrunkHeadway } from './routeCardTrunk';
import { hasRegularServiceInPeriod, isOneGapRow, variantRowHeadway, type RouteContract } from './stretchCard';

/** The card-level facts every row of the route card reads (CIV-992). */
export interface RouteCardRowContext {
  period: TimePeriod;
  /** The sparkline hour under the pointer, or null. */
  hoveredHour: number | null;
  /** The data carries the stretch roles (frequency focus). */
  stretchMode: boolean;
  /** The route's all-day contract, on All day only. */
  allDay?: { filterValue: number | null; limited: boolean };
  /** The route's contract for the selected period. */
  contract?: RouteContract;
  /** The route has no regular service in the period. */
  noRegularService: boolean;
  /** The frequency filter's maximum headway (Infinity when off). */
  maxHeadway: number;
}

/** What one route card row shows: its number, its words and its colour (CIV-992; moved out of RouteCardHeadway). */
export interface RouteCardRowValue {
  /** The row's cadence before the no-regular-service rule (a null row with no label is dropped). */
  displayH: number | null | undefined;
  /** Shown as the row's number. */
  headway: number | undefined;
  /** The row reads limited (or the no-regular-service label). */
  isLimited: boolean;
  /** The row reads as the route does when it has no regular service. */
  rowNoRegular: boolean;
  /** #934 / D6: a late start, an early end or one gap inside steady service, in place of a long wait. */
  edgeText: string | undefined;
  /** The text beside or under the number. */
  headwayLabel: string | undefined;
  /** The filter's colour for the row's dot. */
  colorHeadway: number | null | undefined;
  trunkHeadway: number | null | undefined;
  dimmed: boolean;
}

export function routeCardRowValue(d: ShapeProperties, ctx: RouteCardRowContext): RouteCardRowValue {
  const { period, hoveredHour, stretchMode, allDay, contract, noRegularService, maxHeadway } = ctx;
  // Dimming and colour follow the one frequency rule (worst direction decides),
  // exactly as the map does; the row's own cadence stays display-only (#564).
  const branchFilterHeadway = routeFilterHeadway(d, period);
  const dimmed = maxHeadway !== Infinity && !featurePassesHeadwayFilter(d, period, maxHeadway);
  const variantH = hoveredHour == null ? variantRowHeadway(d, period) : undefined;
  // A main-stretch row the card cannot read a cadence for (its own gaps are uneven) takes its direction's filter
  // value. A tail never does: that value is the trunk's (#1115, Ryan 2026-10-26).
  const ownH = hoveredHour != null
    ? branchDisplayHourHeadway(d, hoveredHour) ?? routeCardDisplayHeadway(d, period)
    : routeCardDisplayHeadway(d, period);
  const directionH = stretchMode && hoveredHour == null && ownH == null && period !== 'all' && d.stretchRole !== 'tail'
    ? d.directionFilterHeadwayByPeriod?.[period as keyof NonNullable<ShapeProperties['directionFilterHeadwayByPeriod']>]
    : undefined;
  const allDayH = allDay?.filterValue != null && hoveredHour == null ? allDay.filterValue : undefined;
  // All day: every row reads the route's all-day value, the number the lists and the map filter use.
  const directionFallback = allDayH ?? (typeof directionH === 'number' ? directionH : undefined);
  const fallbackRange = directionFallback != null && contract?.range && contract.range[0] < directionFallback && contract.range[1] >= directionFallback
    ? headwayAboutRange(contract.range[0], directionFallback)
    : undefined;
  // #1142 (CIV-1018): an uneven period reads typical to worst ("every 5–18 min") on the main stretch's row, its number the
  // direction's worst wait, as the filter and colour use. A tail's own value stays (the direction's is the trunk's).
  const periodKey = period as keyof NonNullable<ShapeProperties['stretchPeriodTypical']>;
  const typical = period !== 'all' ? d.stretchPeriodTypical?.[periodKey] : undefined;
  const worst = period !== 'all' ? d.stretchPeriodHeadway?.[periodKey] : undefined;
  const uneven = stretchMode && hoveredHour == null && d.stretchRole === 'main' && variantH === undefined && allDayH == null
    && typeof typical === 'number' && typeof worst === 'number' && typical < worst
    ? { typical, worst }
    : undefined;
  const displayH = variantH !== undefined ? variantH : uneven?.worst ?? directionFallback ?? ownH;
  // #934 and D6: the main stretch's row names a late start, an early end or one gap inside
  // steady service, in place of a long wait or "limited"; the dot keeps the filter's colour.
  // A period that is one gap between a few departures (#955) has no cadence to word.
  const edgeText = hoveredHour == null && variantH === undefined && allDayH == null && d.stretchRole === 'main' && !isOneGapRow(d, period)
    ? routeCardPeriodShapeText(d, period)
    : undefined;
  const trunkHeadway = hoveredHour == null && period !== 'all'
    ? headsignTrunkHeadway(d, period)
    : undefined;
  // The stop card's rule (hasRegularServiceInPeriod), so the two cards agree. #954: when
  // the route has no regular service in the period, a row still shows its own direction
  // value when it has one (SF Muni 8 PM: Fisherman's Wharf every 8), on data that carries
  // the one-gap flag; every other row, and All day, reads as the route does. #955: a number
  // that is one gap between a few departures is not a cadence (TTC 10 weekday midday to
  // Victoria Park, 09:07 then 14:22: "every 315"); a row with a steady value of its own keeps it.
  const rowNoRegular = hoveredHour == null && (
    (noRegularService && (period === 'all' || d.stretchPeriodOneGap === undefined || !hasRegularServiceInPeriod(d, period) || displayH == null))
    || isOneGapRow(d, period));
  const isLimited = rowNoRegular
    ? true
    : displayH == null && hoveredHour == null && routeCardDisplayLimited(d, period);
  return {
    displayH,
    headway: rowNoRegular ? undefined : displayH ?? undefined,
    isLimited,
    rowNoRegular,
    edgeText,
    headwayLabel: hoveredHour == null && variantH === undefined
      ? (edgeText ?? (uneven ? headwayAboutRange(uneven.typical, uneven.worst) : fallbackRange))
      : undefined,
    colorHeadway: hoveredHour == null && !rowNoRegular ? branchFilterHeadway : undefined,
    trunkHeadway,
    dimmed,
  };
}
