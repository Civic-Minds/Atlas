import type { ShapeProperties, TimePeriod } from '../hooks/useIntervalStats';
import { formatPeriodHourLong, formatPeriodRangeLong, TIME_PERIODS } from '../../shared/config';
import { ROUTE_DATA_QUALITY_WARNING } from '../../shared/routeDataQuality';
import {
  BOOKING_REQUIRED_NOTICE, expiredFeedNotice, noServiceInPeriodText, ONLY_SHARED_SECTION_MEETS_FILTER, listingEndedNotice, NO_ROUTE_SHAPE_NOTICE, periodServiceNotice,
  ROUTE_DATA_QUALITY_WARNING_MESSAGE, selectedRouteFilterNotice, selectedRouteOutsideFilterNotice,
  selectedRoutePartMeetsFilterNotice, unevenServiceNotice, variantsIncludedNotice, WEEKDAY_VARIATION_NOTICE,
} from '../content/noticeCopy';
import { partPeriodNoticeApplies, partPeriodNoticeHeadway, partPeriodOutside, periodTripRanges } from './periodActiveRanges';
import { routePartMeetsFilter } from './routeCardTrunk';
import type { RouteCardModel } from './routeCardRows';

/**
 * Every notice the route card shows, decided in one place (CIV-1200). The card renders what this returns, slot by slot;
 * it decides nothing itself. Codes are noticeCopy's (N1 … N123). The wording is unchanged.
 *
 * Each notice also carries the place it belongs to (Ryan's trial, CIV-1202; one kind of notice, one place):
 * 1 under the title, what the card is (variants, data warnings); 2 on the rows, anything about one direction or row;
 * 3 below the rows, the whole route in the period. `slot` is where the card draws it today, unchanged.
 */
export type NoticePlace = 1 | 2 | 3;
export const NOTICE_PLACE_NAMES: Record<NoticePlace, string> = { 1: 'under the title', 2: 'on the rows', 3: 'below the rows' };
export interface RouteCardNoticeInput {
  directions: ShapeProperties[];
  /** The card's rows, built once (buildRouteCardModel). */
  model: Pick<RouteCardModel, 'contract' | 'doesNotRun' | 'hasPeriodService' | 'hasPartialPeriodService' | 'activeRangeDirections' | 'rowHeadways' | 'unevenGap' | 'groups' | 'showDirectionSections'>;
  /** The Night view's card has no direction notes. */
  nightView?: boolean;
  agencyFeatures?: readonly GeoJSON.Feature[];
  period: TimePeriod;
  maxHeadway: number;
  /** The route misses the map's current filter (decided by the map, as for its colour). */
  selectedRouteOutOfFilter: boolean;
  /** Night and Frequent Service ignore the period and speed filters, so no notice about them. */
  hideFilterNotices: boolean;
  /** The beta uneven-service notice (FEATURES.unevenBanner). */
  unevenEnabled: boolean;
  /** The variant family's short names, when route variants are on and the route has a family (N15). */
  variantShortNames?: string[] | null;
  agency?: {
    name?: string;
    feedReviewStatus?: string | null;
    overrideNote?: string | null;
    manualFeedSource?: boolean;
  };
  /** The agency's override note when it applies to this route (N5). */
  routeOverrideNote?: string;
  routeIsStale: boolean;
  expDateStr: string;
  /** N25: the formatted date most of the agency's routes stopped being listed ('' when not). */
  listingEndedDate: string;
  listingEnded: boolean;
}

export type CardNoticeCode = 'N1' | 'N2' | 'N3' | 'N4' | 'N5' | 'N6' | 'N7' | 'N8' | 'N9' | 'N10' | 'N11' | 'N12' | 'N13' | 'N15' | 'N16' | 'N25' | 'N123';
export interface CardNotice { code: CardNoticeCode; text: string; place: NoticePlace }
/** N4 and N5 render through their own components (they carry the agency's own wording and Learn more), so they have no text here. */
export interface CardFooterNotice { code: Exclude<CardNoticeCode, 'N8' | 'N9' | 'N10' | 'N11' | 'N12' | 'N13' | 'N15' | 'N16' | 'N123'>; text?: string; place: NoticePlace }
/** A note under one direction's heading: it has no rows in the period, or only its shared section meets the filter. */
export interface CardDirectionNotice { dirId: number; kind: 'no-service' | 'only-shared'; text: string; place: 2 }

export interface RouteCardNotices {
  /** Under the title: the variants the card includes. */
  variants: CardNotice | null;
  /** Above the rows: why the route misses the filter. */
  filter: CardNotice | null;
  /** Under the rows: when the route runs in the period, or how uneven its gaps are. */
  period: CardNotice | null;
  /** Under the rows: rides must be booked ahead. */
  booking: CardNotice | null;
  /** Under a direction's heading. */
  directions: CardDirectionNotice[];
  /** The card's last block, in this order: data and schedule notices, each with a Learn more. */
  footer: CardFooterNotice[];
  /**
   * Whether the card draws its last block. The same test as before CIV-1200, which also draws it for an agency under
   * review that carries its own override note (N4 then stands aside for N5), even when N5 doesn't apply to this route.
   */
  showFooter: boolean;
}

export function routeCardNotices(input: RouteCardNoticeInput): RouteCardNotices {
  const { directions, model, period, maxHeadway } = input;
  const selectedPeriod = period !== 'all' ? TIME_PERIODS.find(p => p.key === period) : undefined;
  const periodRange = selectedPeriod ? formatPeriodRangeLong(selectedPeriod.startHour, selectedPeriod.endHour) : null;
  const hasPartialPeriodService = selectedPeriod != null && model.hasPartialPeriodService;

  // #1186: both period lines read the same window, the hours inside the period. A route runs there when one of those
  // hours has trips; "This route runs only from …" names those hours, and the "no scheduled trips" line shows only
  // when there are none (TTC 504 Sunday read both: its run from 1 AM counted the hour before the period).
  // Whether it runs reads every direction, as the period check does; the hours named are the chart's where it has some.
  const tripRangesOf = (list: ShapeProperties[]) => (selectedPeriod ? periodTripRanges(list, selectedPeriod.startHour, selectedPeriod.endHour) : []);
  const allDirectionRanges = tripRangesOf(directions);
  const chartRanges = tripRangesOf(model.activeRangeDirections);
  const periodRanges = chartRanges.length > 0 ? chartRanges : allDirectionRanges;
  const runsInPeriod = hasPartialPeriodService && allDirectionRanges.length > 0;

  // The filter line. #1186: a route with trips inside the period never also reads "no scheduled trips" there; the
  // period notice says when it runs.
  let filter: CardNotice | null = null;
  if (input.selectedRouteOutOfFilter && !(model.doesNotRun && runsInPeriod)) {
    // #1186: the hours named are the chart's, inside the period (TTC 31 overnight read "runs from 1–2 AM, but not
    // throughout 2–6 AM" beside "runs only from 2–3 AM"). Never another direction's hours: with none of its own the notice
    // doesn't show (MiWay 49 weekday midday read "runs every 45 min from 9 AM–3 PM, but not throughout … 9 AM–3 PM").
    const activePeriodRangeText = chartRanges.map(([start, end]) => formatPeriodRangeLong(start, end)).join(', ');
    // #995: "but not throughout the selected period" only when service really stops short of it;
    // a route running the whole period that misses the frequency filter gets the filter notice.
    const showPartPeriodNotice = selectedPeriod != null
      && partPeriodNoticeApplies(model.activeRangeDirections, selectedPeriod.startHour, selectedPeriod.endHour, maxHeadway, model.contract?.filterValue);
    if (model.doesNotRun) {
      filter = { code: 'N11', text: selectedRouteOutsideFilterNotice(Infinity, periodRange), place: 3 };
    } else if (selectedPeriod && activePeriodRangeText && showPartPeriodNotice) {
      // N13 (Ryan): name what the rest of the period has, from the card's own hourly data. CIV-1069: the notice names
      // the rows' own value (the slowest row), not the route's filter value; CIV-975's rule still checks it against every row.
      const split = partPeriodOutside(model.activeRangeDirections, selectedPeriod.startHour, selectedPeriod.endHour);
      const rowHeadways = model.rowHeadways;
      filter = {
        code: 'N13',
        place: 3,
        text: selectedRouteFilterNotice({
          headway: partPeriodNoticeHeadway(rowHeadways.length > 0 ? Math.max(...rowHeadways) : null, rowHeadways),
          ...(split
            ? {
              activeRange: formatPeriodRangeLong(split.active[0], split.active[1]),
              outside: split.parts.map(part => (part.at === 'start'
                ? { service: part.service, range: formatPeriodRangeLong(part.hours[0], part.hours[1]) }
                : { service: part.service, after: formatPeriodHourLong(part.hours[0]) })),
            }
            : { activeRange: activePeriodRangeText }),
          periodRange: formatPeriodRangeLong(selectedPeriod.startHour, selectedPeriod.endHour),
        }),
      };
    } else if (routePartMeetsFilter(input.agencyFeatures, directions, period, maxHeadway)) {
      // CIV-514: part of the route qualifies, as the map's shared-stretch overlay shows.
      filter = { code: 'N123', text: selectedRoutePartMeetsFilterNotice(maxHeadway), place: 3 };
    } else {
      filter = { code: maxHeadway === Infinity ? 'N11' : 'N12', text: selectedRouteOutsideFilterNotice(maxHeadway, periodRange), place: 3 };
    }
  }

  // The period line, under the rows: when the route runs in the period, else how uneven its gaps are.
  // When the route has no trips in the period, the out-of-filter line already says so: the period line would repeat it.
  const noTripsLineShown = input.selectedRouteOutOfFilter && model.doesNotRun && !runsInPeriod;
  let periodNotice: CardNotice | null = null;
  if (!input.hideFilterNotices && selectedPeriod && !model.hasPeriodService && !noTripsLineShown) {
    periodNotice = {
      code: runsInPeriod ? 'N9' : 'N8',
      place: 3,
      text: periodServiceNotice(periodRange!, runsInPeriod, periodRanges.map(([start, end]) => formatPeriodRangeLong(start, end)).join(', ')),
    };
  } else if (!input.hideFilterNotices && selectedPeriod && model.hasPeriodService) {
    // Only primary patterns per direction drive the uneven notice (#381); the model reads them.
    const unevenGap = input.unevenEnabled ? model.unevenGap() : 0;
    if (unevenGap > 0) periodNotice = { code: 'N10', text: unevenServiceNotice(unevenGap), place: 3 };
  }

  // Data and schedule notices, in the card's order. Only say the map is unavailable when nothing of this route is
  // drawn: a route with one shaped direction still shows its line.
  const footer: CardFooterNotice[] = [];
  if (directions.length > 0 && directions.every(direction => direction.noRouteShape)) footer.push({ code: 'N7', text: NO_ROUTE_SHAPE_NOTICE, place: 1 });
  if (directions.some(direction => direction.routeDataQualityWarning === ROUTE_DATA_QUALITY_WARNING)) footer.push({ code: 'N6', text: ROUTE_DATA_QUALITY_WARNING_MESSAGE, place: 1 });
  // N25 (CIV-1055): most of the agency's routes stopped being listed; an ended timetable (N2) says more, so it wins.
  if (input.listingEndedDate) footer.push({ code: 'N25', text: listingEndedNotice(input.listingEndedDate, input.listingEnded), place: 1 });
  if (input.routeIsStale) {
    footer.push({ code: input.agency?.manualFeedSource ? 'N3' : 'N2', text: expiredFeedNotice(input.agency?.name ?? 'This agency', input.expDateStr, input.agency?.manualFeedSource), place: 1 });
  }
  if (input.agency?.feedReviewStatus === 'review' && !input.agency.overrideNote) footer.push({ code: 'N4', place: 1 });
  if (input.agency && input.routeOverrideNote) footer.push({ code: 'N5', place: 1 });
  if (directions.some(direction => direction.weekdayTierVariation)) // N1 is about the route's service (its weekdays differ), not its data: place 3.
  if (directions.some(direction => direction.weekdayTierVariation)) footer.push({ code: 'N1', text: WEEKDAY_VARIATION_NOTICE, place: 3 });

  // Direction notes, in the card's group order: a heading with no rows in the period, and a direction whose only
  // passing part is the shared section.
  const directionNotices: CardDirectionNotice[] = [];
  for (const group of model.groups) {
    if (model.showDirectionSections && group.boundLabel && !group.hasVisibleRows && selectedPeriod && !input.nightView) {
      directionNotices.push({ dirId: group.dirId, kind: 'no-service', text: noServiceInPeriodText(selectedPeriod.label), place: 2 });
    }
    if (group.onlySharedPasses && !input.nightView) {
      directionNotices.push({ dirId: group.dirId, kind: 'only-shared', text: ONLY_SHARED_SECTION_MEETS_FILTER, place: 2 });
    }
  }

  return {
    variants: input.variantShortNames?.length ? { code: 'N15', text: variantsIncludedNotice(input.variantShortNames.join(', ')), place: 1 } : null,
    directions: directionNotices,
    filter,
    period: periodNotice,
    booking: directions.some(direction => direction.bookingRequired === true) ? { code: 'N16', text: BOOKING_REQUIRED_NOTICE, place: 3 } : null,
    footer,
    showFooter: input.routeIsStale || !!input.listingEndedDate || input.agency?.feedReviewStatus === 'review' || !!input.routeOverrideNote
      || footer.some(notice => notice.code === 'N6' || notice.code === 'N7' || notice.code === 'N1'),
  };
}
