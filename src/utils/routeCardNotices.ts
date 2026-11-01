import type { ShapeProperties, TimePeriod } from '../hooks/useIntervalStats';
import { formatPeriodHourLong, formatPeriodRangeLong, TIME_PERIODS } from '../../shared/config';
import { ROUTE_DATA_QUALITY_WARNING } from '../../shared/routeDataQuality';
import {
  BOOKING_REQUIRED_NOTICE, expiredFeedNotice, noServiceInPeriodText, listingEndedNotice, NO_ROUTE_SHAPE_NOTICE, periodServiceNotice,
  ROUTE_DATA_QUALITY_WARNING_MESSAGE, selectedRouteFilterNotice, selectedRouteOutsideFilterNotice, stopRunsOnlyText,
  selectedRoutePartMeetsFilterNotice, unevenServiceNotice, variantsIncludedNotice, WEEKDAY_VARIATION_NOTICE,
} from '../content/noticeCopy';
import { partPeriodNoticeApplies, partPeriodNoticeHeadway, partPeriodOutside, periodTripRanges } from './periodActiveRanges';
import { routePartMeetsFilter } from './routeCardTrunk';
import { buildRouteCardModel, type RouteCardModel } from './routeCardRows';
import { buildDirectionGroups } from './routeCardDirectionGroups';

/**
 * Every notice the route card shows, decided in one place (CIV-1200). The card renders what this returns and decides
 * nothing itself. Codes are noticeCopy's (N1 … N123).
 *
 * Each notice has one place (Ryan, CIV-1202; one kind of notice, one place; docs/STYLE.md "Card notices"):
 * 1 under the title, what the card is (variants, data warnings); 2 on the rows, anything about one direction or row;
 * 3 below the rows, the whole route in the period. And each fact once: a notice shows only when it says something the
 * rows don't.
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
export interface CardNotice { code: CardNoticeCode; text: string; place: NoticePlace; /** N9: the hours it names, for the stop card's own words (CIV-1251). */ activeRange?: string }
/** N4 and N5 render through their own components (they carry the agency's own wording and Learn more), so they have no text here. */
export interface CardFooterNotice { code: Exclude<CardNoticeCode, 'N8' | 'N9' | 'N10' | 'N11' | 'N12' | 'N13' | 'N15' | 'N16' | 'N123'>; text?: string; place: NoticePlace }
/** A note under one direction's heading: it has no rows in the period, or only its shared section meets the filter. */
export interface CardDirectionNotice { dirId: number; kind: 'no-service'; text: string; place: 2 }

export interface RouteCardNotices {
  /** Under the title: the variants the card includes. */
  variants: CardNotice | null;
  /** Below the rows (place 3), first: why the route misses the filter. */
  filter: CardNotice | null;
  /** Below the rows (place 3): when the route runs in the period, or how uneven its gaps are. */
  period: CardNotice | null;
  /** Below the rows (place 3): rides must be booked ahead. */
  booking: CardNotice | null;
  /** On the rows (place 2): a direction with no service in the period, or only its shared section passing. */
  directions: CardDirectionNotice[];
  /** Data and schedule notices, each with a Learn more: place 1 (under the title) except N1 (below the rows). */
  footer: CardFooterNotice[];
  /** Notices left out because the rows already say it (CIV-1202, "each fact once"), with why: for counts and tests. */
  dropped: Array<{ code: CardNoticeCode; why: string }>;
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
  // #1277: a route the filter says doesn't run (no rows) can still have trips inside the period: TTC 110 Sunday AM, first
  // trip 7:52: its directions carry AM values, but the route reads as not running. It has trips there, so it never reads "no scheduled trips".
  const runsInPeriod = (hasPartialPeriodService || (selectedPeriod != null && model.doesNotRun)) && allDirectionRanges.length > 0;

  // The filter line. #1186: a route with trips inside the period never also reads "no scheduled trips" there; the
  // period notice says when it runs.
  let filter: CardNotice | null = null;
  const sharedPassDirections = input.selectedRouteOutOfFilter ? routePartMeetsFilter(input.agencyFeatures, directions, period, maxHeadway) : [];
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
    } else if (sharedPassDirections.length > 0) {
      // CIV-514: part of the route qualifies, as the map's shared-stretch overlay shows. CIV-1251: one line, naming the
      // direction when only one is like this (the direction note it replaces is gone).
      const only = sharedPassDirections.length === 1 && model.showDirectionSections && model.groups.length > 1
        ? model.groups.find(group => group.dirId === sharedPassDirections[0])?.boundLabel
        : undefined;
      filter = { code: 'N123', text: selectedRoutePartMeetsFilterNotice(maxHeadway, periodRange, only), place: 3 };
    } else {
      filter = { code: maxHeadway === Infinity ? 'N11' : 'N12', text: selectedRouteOutsideFilterNotice(maxHeadway, periodRange), place: 3 };
    }
  }

  // The period line, under the rows: when the route runs in the period, else how uneven its gaps are.
  // When the route has no trips in the period, the out-of-filter line already says so: the period line would repeat it.
  const noTripsLineShown = input.selectedRouteOutOfFilter && model.doesNotRun && !runsInPeriod;
  let periodNotice: CardNotice | null = null;
  // #1277: a route with no rows (doesNotRun) but trips in the period gets the period line, even when a direction has a period value.
  if (!input.hideFilterNotices && selectedPeriod && (!model.hasPeriodService || (model.doesNotRun && runsInPeriod)) && !noTripsLineShown) {
    const activeRange = periodRanges.map(([start, end]) => formatPeriodRangeLong(start, end)).join(', ');
    periodNotice = {
      code: runsInPeriod ? 'N9' : 'N8',
      place: 3,
      text: periodServiceNotice(periodRange!, runsInPeriod, activeRange),
      ...(runsInPeriod ? { activeRange: activeRange || periodRange! } : {}),
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
  // N1 is about the route's service (its weekdays differ), not its data: place 3.
  if (directions.some(direction => direction.weekdayTierVariation)) footer.push({ code: 'N1', text: WEEKDAY_VARIATION_NOTICE, place: 3 });

  // Direction notes, in the card's group order: a heading with no rows in the period, and a direction whose only
  // passing part is the shared section.
  const directionNotices: CardDirectionNotice[] = [];
  for (const group of model.groups) {
    if (model.showDirectionSections && group.boundLabel && !group.hasVisibleRows && selectedPeriod && !input.nightView) {
      directionNotices.push({ dirId: group.dirId, kind: 'no-service', text: noServiceInPeriodText(formatPeriodRangeLong(selectedPeriod.startHour, selectedPeriod.endHour)), place: 2 });
    }
  }

  // Each fact once (CIV-1202): what the rows already say, read from the rows as the card shows them.
  const rowNumbers: number[] = [];
  const rowWords: string[] = [];
  const hoursText = /\b(until|from) \d/;
  // Whether every row names its own hours: only then do the rows say when the whole route runs (AC Transit 70: one row
  // "from 7:14 AM" and one "every 30 min" don't say the route has no trips from 6–7 AM).
  let everyRowGivesHours = true;
  let rowCount = 0;
  // CIV-1241 (Ryan, 2026-11-01): the rows that fall short of the filter, and whether each names its until or from time
  // from its period edge, the words the row prints (rowReadsPeriodEdge, as the stop card reads them).
  let shortRows = 0;
  let everyShortRowGivesEdge = true;
  for (const group of model.groups) {
    // CIV-1251 row 8: a Shared stretch row that gives its hours says when the shared stretch runs.
    if (group.shared) {
      rowNumbers.push(group.shared.headway);
      if (group.shared.edgeText) rowWords.push(group.shared.edgeText);
      else everyRowGivesHours = false;
    }
    for (const row of group.rows) {
      if (row.night) continue;
      const shown = row.display(null);
      const v = shown.value;
      if (v.headwayLabel) rowWords.push(v.headwayLabel);
      if (shown.limitedLabel) rowWords.push(shown.limitedLabel);
      rowCount++;
      if (!hoursText.test(`${v.headwayLabel ?? ''} ${shown.limitedLabel ?? ''}`)) everyRowGivesHours = false;
      // A row falls short when its own direction's filter value misses the filter (the route's dims every row).
      const own = period !== 'all' ? row.feature?.directionFilterHeadwayByPeriod?.[period] : undefined;
      if (typeof own === 'number' ? own > maxHeadway : v.dimmed) {
        shortRows++;
        if (!hoursText.test(v.edgeText ?? '')) everyShortRowGivesEdge = false;
      }
      if (v.rowNoRegular || v.isLimited) continue;
      if (v.headway != null) rowNumbers.push(v.headway);
    }
  }
  const words = rowWords.join(' | ');
  const rowGivesHours = hoursText.test(words);
  // The gaps the rows name: "with a 32 min gap", "longest gap 32 min", and a range's top ("every 25–30 min").
  const rowGaps = [...words.matchAll(/(\d+) min gap|longest gap (\d+) min|\u2013(\d+) min/g)].map(m => Number(m[1] ?? m[2] ?? m[3]));
  const rowsGiveHours = rowCount > 0 && everyRowGivesHours;
  const dropped: RouteCardNotices['dropped'] = [];
  const drop = (notice: CardNotice | null, why: string): null => {
    if (notice) dropped.push({ code: notice.code, why });
    return null;
  };

  if (periodNotice?.code === 'N10') {
    const gap = model.unevenGap();
    // A row naming a smaller gap doesn't say this one (CTA 74 overnight: rows name 24–25 min, the route's gap is 116).
    if (rowGaps.some(g => g >= gap)) periodNotice = drop(periodNotice, 'a row names that gap or a longer one');
    else if (rowNumbers.length > 0 && gap <= Math.max(...rowNumbers)) periodNotice = drop(periodNotice, "the gap isn't longer than a row's wait");
    else if (rowGivesHours) periodNotice = drop(periodNotice, 'a row gives its hours, so the route does not run all period');
  }
  // #1225: the period line and the filter line can be the same sentence ("no scheduled trips from 6–9 AM").
  // CIV-1251: N13 opens with N9's sentence and adds the rest of the period, so N9 beside it says the same thing again.
  if (periodNotice && filter && (periodNotice.text === filter.text || (periodNotice.code === 'N9' && filter.code === 'N13' && filter.text.startsWith(periodNotice.text)))) periodNotice = drop(periodNotice, 'the filter line says the same');
  // #1226: every row giving its hours already says what the line says (CIV-1251 row 8: nothing below the rows).
  if (periodNotice?.code === 'N9' && rowsGiveHours) periodNotice = drop(periodNotice, 'every row gives its hours');
  if (filter?.code === 'N13' && rowsGiveHours) filter = drop(filter, 'every row gives its hours');
  // CIV-1241 (Ryan, 2026-11-01): "Only part of this route runs every 60 minutes or better" says what a falling-short row's
  // "every 30 min until 9:18 PM" already does (OC Transpo 11 evening, CIV-1241 crops). It stays while any falling-short row has no such time.
  if (filter?.code === 'N123' && shortRows > 0 && everyShortRowGivesEdge) filter = drop(filter, 'every row that falls short gives its until or from time');
  if (filter?.code === 'N12') {
    // The rows or the period line already say why the route misses the filter.
    if (periodNotice && (periodNotice.code === 'N8' || periodNotice.code === 'N9')) filter = drop(filter, 'the period line says when it runs');
    else if (rowNumbers.length > 0 && rowNumbers.every(h => h > maxHeadway)) filter = drop(filter, 'every row shows a longer wait');
    // #1227: rows that read every 15 beside "doesn't meet the 15-minute filter". Every direction must pass the filter, so
    // the gap line, or one row naming its gap or hours, says why.
    else if (periodNotice?.code === 'N10') filter = drop(filter, 'the gap line says why');
    else if (rowGaps.some(g => g > maxHeadway)) filter = drop(filter, "a row's gap is longer than the filter");
    else if (rowGivesHours) filter = drop(filter, 'a row gives its hours');
  }

  return {
    variants: input.variantShortNames?.length ? { code: 'N15', text: variantsIncludedNotice(input.variantShortNames.join(', ')), place: 1 } : null,
    directions: directionNotices,
    filter,
    period: periodNotice,
    booking: directions.some(direction => direction.bookingRequired === true) ? { code: 'N16', text: BOOKING_REQUIRED_NOTICE, place: 3 } : null,
    footer,
    dropped,
  };
}

/**
 * #1278: the route card's own words for a period in which the route has trips but shows no number: its period line
 * (the stop card's "Runs only from 7–9 AM", CIV-1251) or, without one and
 * where every row reads it, the rows' label ("Runs irregularly in this period"). Null when the card shows a number or neither. The stop
 * card lists such a route with these words, so the two cards agree. `features` are the route's for the day, as the card's.
 */
export function routeCardNoNumberWords(features: readonly ShapeProperties[], period: TimePeriod): string | null {
  if (period === 'all' || features.length === 0) return null;
  const directions = [...features];
  const route = { routeShortName: directions[0].routeShortName ?? null, routeLongName: directions[0].routeLongName ?? null, directions };
  const model = buildRouteCardModel({
    ...route, directionGroups: buildDirectionGroups(route, period), agencyFeatures: undefined,
    period, maxHeadway: Infinity, nightView: false, stableColors: false, hideSpan: false,
  });
  const rows = model.groups.flatMap(group => group.rows.filter(row => !row.night).map(row => row.display(null).value));
  if (model.groups.some(group => group.shared) || rows.some(value => !value.rowNoRegular)) return null;
  // The card's period line says when the route runs (#1277; TTC 72 weekday overnight beside its "irregularly" rows);
  // without one, the rows' label.
  const notices = routeCardNotices({
    directions, model, period, maxHeadway: Infinity, selectedRouteOutOfFilter: model.doesNotRun, hideFilterNotices: false,
    unevenEnabled: false, routeIsStale: false, expDateStr: '', listingEndedDate: '', listingEnded: false,
  });
  if (notices.period?.code === 'N9') return stopRunsOnlyText(notices.period.activeRange!);
  return rows.length > 0 ? model.noRegularLabel : null;
}
