import type { ShapeProperties, TimePeriod } from '../hooks/useIntervalStats';
import { PERIOD_COVERAGE_MAX_HEADWAY } from '../../shared/periodEligibility';
import { periodEdgeText, routeCardDisplayHeadway, routeCardPeriodShapeEvery, routeCardPeriodShapeGap, routeCardPeriodShapeText, infrequentRowNoCadence, rowCarriesStretchWords, rowReadsPeriodEdge } from './effectiveHeadway';
import { headwayPeriodShape } from './headwayText';
import { isOneGapRow, rowStretchReading, SHARED_STRETCH_RATIO, type StretchRowReading } from './stretchCard';
import { pairedTripSafeHeadway } from './pairedTripFloor';
import { periodKeyForHour } from '../../shared/config';
import { isHourInPeriod } from '../../shared/rules/periods';

type PeriodKey = Exclude<TimePeriod, 'all'>;

/** One card row's reading of a period, every part from the same trips (CIV-1069). */
export interface RowTrips {
  /** The row's own value ("every N"), or null. */
  value: number | null;
  /** The longest gap of the departures `value` reads; null when the data has none for them. */
  longestGap: number | null;
  /** #934 / D6 wording for a main stretch's late start, early end or one gap inside steady service. */
  partPeriod: string | undefined;
  /** The number `partPeriod`'s words name ("every 31 min, …" -> 31), so a notice can name the same number (CIV-1199). */
  partPeriodEvery?: number;
  /** The headsign runs under three times itself in the period: its value is other headsigns' (CTA 77 Belmont & Octavia). */
  noOwnService: boolean;
  /** #773, as #962: the row's only number was a full-window wait over PERIOD_COVERAGE_MAX_HEADWAY, so it reads no regular service. */
  waitNotCadence?: boolean;
}

const NONE: RowTrips = { value: null, longestGap: null, partPeriod: undefined, noOwnService: false };

/** The stretch slot a main or tail row stands for, from its stretchMeta; null for a variant or data without it. */
function stretchSlot(d: ShapeProperties) {
  if (d.stretchRole === 'main') return d.stretchMeta?.main ?? null;
  if (d.stretchRole === 'tail') return d.stretchMeta?.tails?.[d.stretchIndex ?? 0] ?? null;
  return null;
}

import { ROW_GAP_WORDS_RATIO } from '../../shared/rules/frequency';
export { ROW_GAP_WORDS_RATIO };

/**
 * #1239 (Ryan, 2026-10-31): a main stretch's row reads the number the filter decides on: its direction's filter value
 * (directionFilterHeadwayByPeriod), one value for the row and the filter (AC Transit 281 AM to NewPark Mall: every 66,
 * where the row read 60 from its own trips). When one gap between buses is what sets that value
 * (a wait over PERIOD_COVERAGE_MAX_HEADWAY, #524) and it is at least ROW_GAP_WORDS_RATIO times the stretch's steady spacing,
 * the row says both: the spacing and the gap ("every 42 min, with a 65 min gap"). Only a steady period on a direction with
 * no tail of its own in it, where the stretch's value is the main stretch's. null otherwise.
 */
function mainFilterReading(d: ShapeProperties, key: PeriodKey): { every: number; gap?: number } | null {
  if (d.stretchRole !== 'main' || d.stretchPeriodSustained?.[key] !== true || d.stretchPeriodOneGap?.[key] === true) return null;
  if (d.stretchPeriodTypical?.[key] != null || d.stretchMeta?.main?.noRegular?.includes(key)) return null;
  if (d.stretchMeta?.tails?.some(t => t.period?.[key] != null)) return null;
  const every = d.stretchPeriodHeadway?.[key];
  if (typeof every !== 'number') return null;
  // The stretch's spacing counts every trip at its stop: the row reads it only when its own trips are all of them (SEPTA 19
  // Saturday midday: two destinations every 120 on a stretch every 63 keep their own), and a period with a late start or
  // early end keeps its own reading (A2).
  const ownTrips = Object.values(d.departuresByHour ?? {}).reduce((sum, n) => sum + n, 0);
  if (ownTrips !== d.stretchMeta?.main?.trips || rowReadsPeriodEdge(d, key)) return null;
  const filter = d.directionFilterHeadwayByPeriod?.[key];
  const gap = d.stretchMeta?.main?.maxGap?.[key];
  if (typeof filter !== 'number') return null;
  const gapSetsFilter = filter > PERIOD_COVERAGE_MAX_HEADWAY && filter > every && gap === filter;
  // A filter value over the limit that no gap between buses explains is the full-period wait of service that starts late or
  // stops early (settled rule 3, #1268: AC Transit 22 Sunday midday, every 30 then nothing, 168). Data with the branch's edge
  // (CIV-1241) on a row that covers it (#1276) words it before this (TTC 110 weekday PM via 30th Street: "every 30 until 5:55 PM"); without it, the row reads the stretch's steady spacing there
  // ("every 30"), never a bare "every 168", and never its own faster trips.
  if (filter > PERIOD_COVERAGE_MAX_HEADWAY && filter > every && !gapSetsFilter) return { every };
  return gapSetsFilter && gap >= every * ROW_GAP_WORDS_RATIO ? { every, gap } : { every: filter };
}

/**
 * CIV-995 (b): the stretch reading a row's value uses, with the guards routeCardDisplayHeadway applies to the row's own
 * value: an infrequent row whose longest gap is over 1.5 times the cadence shows no stretch number (MBTA SLW Saturday
 * midday: 100 beside a 162 gap keeps its own reading), and the paired-trip floor (#761) still raises it. Null keeps the
 * row's own trips. The hovered hour reads the same way (rowStretchHourValue).
 */
export function rowStretchValue(d: ShapeProperties, period: TimePeriod): (StretchRowReading & { cadence: number }) | null {
  const r = rowStretchReading(d, period);
  if (!r || r.cadence == null) return null;
  if (d.tier === 'infrequent' && r.longestGap != null && r.longestGap > r.cadence * 1.5) return null;
  // #773: a row the all-day grade called infrequent that now runs steadily in the period keeps its own value where the stretch
  // is materially better than its own trips (the card's Combined rule's ratio, which then shows the "Shared stretch every N"
  // row): TTC 43 PM, Village Green Square every 20 on a stretch of 7.
  const own = d.headwayByPeriodSustained?.[period as Exclude<TimePeriod, 'all'>] === true ? d.headwayByPeriod?.[period as Exclude<TimePeriod, 'all'>] : null;
  // A row that carries the stretch's words for the period (#934 / D6) keeps the stretch's number beside them (Regina 1 Saturday
  // evening to Dieppe: "every 30 min, with one 55 min gap" reads the stretch's 37, not its own 67).
  const carriesStretchWords = rowCarriesStretchWords(d, period);
  if (d.tier === 'infrequent' && own != null && r.cadence < own * SHARED_STRETCH_RATIO && !carriesStretchWords) return null;
  const cadence = pairedTripSafeHeadway(d, period, r.cadence);
  return cadence == null ? null : { ...r, cadence };
}

/** CIV-995 (b): the hovered hour's number from the row's stretch, under the row's own checks; undefined keeps the row's own hours. */
export function rowStretchHourValue(d: ShapeProperties, hour: number): number | null | undefined {
  const period = periodKeyForHour(hour);
  if (!period || !rowStretchValue(d, period)) return undefined;
  return pairedTripSafeHeadway(d, period, rowStretchReading(d, period)?.hourly?.[hour] ?? null);
}

/**
 * One row's value, longest gap and part-period words for a period, all from the trips the value reads (CIV-1069).
 * - A headsign with no service of its own in the period (noOwnServiceByPeriod) reads nothing: the row shows Irregular.
 * - A period that is not steady for the row's own trips reads its stretch's value where the stretch runs regularly and is not
 *   materially better than the row's own trips (a short burst never takes the stretch's number), else its own value on a
 *   stretch, or its full-window wait off one, unless a main stretch's words (late start, early end, one gap) say it.
 * - A main or tail row whose value is its stretch's pairs it with that stretch's longest gap (stretchMeta maxGap, the same pooled
 *   departures; Sun Metro 205's "Mesa Inbound" no longer reads one headsign's 315-minute hole). A row with a value of its own,
 *   faster or slower than its stretch (NYCT R late; Phoenix 35's branch rows), keeps its own trips' gap.
 * - Otherwise the row's own value and its own longest gap (maxGapByPeriod follows the value's source, #281).
 */
export function rowTrips(d: ShapeProperties, period: TimePeriod, opts: { ownTrips?: boolean; stretch?: boolean; branchReadings?: boolean } = {}): RowTrips {
  if (period === 'all') return { ...NONE, value: routeCardDisplayHeadway(d, period) };
  const key = period as PeriodKey;
  if (d.noOwnServiceByPeriod?.includes(key)) return { ...NONE, noOwnService: true };
  const readsShape = (d.stretchRole === 'main' || rowReadsPeriodEdge(d, period)) && !isOneGapRow(d, period);
  let partPeriod = readsShape ? routeCardPeriodShapeText(d, period) : undefined;
  let partPeriodEvery = partPeriod != null ? routeCardPeriodShapeEvery(d, period) : undefined;
  // CIV-2171: the gap the words name, if any, for the one-hour cap below.
  let partPeriodGap = partPeriod != null ? routeCardPeriodShapeGap(d, period) : undefined;
  // CIV-995 (b): a main or tail row reads its stretch's own values (every trip at the stretch's stop) where the stretch runs
  // through the period: its cadence, steadiness and longest gap. Elsewhere, and on older data, the row's own trips. The
  // shared and pooled rows' comparison (ownTrips) and the stop card (stretch: false) keep reading the row's own trips.
  const stretch = opts.ownTrips || opts.stretch === false ? null : rowStretchValue(d, period);
  let value = stretch ? stretch.cadence : routeCardDisplayHeadway(d, period);
  // ownTrips: the card's shared and pooled rows compare the rows' own trips with the stretch's, so they stay as they are
  // (SEPTA 19 Saturday midday keeps "Shared stretch every 63" over its two destinations every 120).
  const filterReading = partPeriod == null && value != null && !opts.ownTrips ? mainFilterReading(d, key) : null;
  if (filterReading) {
    value = filterReading.every;
    if (filterReading.gap != null) { partPeriod = headwayPeriodShape(filterReading); partPeriodEvery = filterReading.every ?? undefined; partPeriodGap = filterReading.gap; }
  }
  const slot = stretchSlot(d);
  const slotGap = slot?.maxGap?.[key];
  const slotValue = slot?.period?.[key];
  // CIV-1074 2a: a period that is not steady for the row's own trips reads the trips its riders get. A main or tail row on a
  // stretch with regular service reads the stretch (CTA 9 Ashland & 95th midday: every 10 at 74th-95th, where its own 8 trips
  // start at 13:04); any other row reads its full-window wait (the settled rule, #567-#571), not the median of its gaps.
  const unsteady = value != null && !partPeriod && !filterReading && (stretch ? stretch.consistent === false : d.headwayByPeriodSustained?.[key] === false);
  const wait = d.periodCoverageHeadway?.[key];
  let waitNotCadence = false;
  if (unsteady && typeof slotValue === 'number' && !slot?.noRegular?.includes(key)) {
    // A short burst can't take the shared stretch's number. Where the stretch is materially better than the row's own trips
    // (by the card's Combined rule's ratio, which then shows a "Shared stretch every N" row), the burst rides on other trips and the row
    // keeps its own value: SEPTA 66 PM, 7 Express trips every 12 on locals every 12, pooled 6; TTC 63 AM, 63B to St Clair every 9
    // from 7:07 on a stretch of 5. Otherwise the row's trips are the stretch's (CTA 9: 13 on its own trips, every 10 at
    // 74th-95th; TTC 25: 6 and 5).
    if (slotValue > value! * SHARED_STRETCH_RATIO) value = slotValue;
  } else if (unsteady && typeof wait === 'number' && wait > value!) {
    // #773, as #962: for a row the all-day grade called infrequent (it read limited before #773), a full-window wait over
    // PERIOD_COVERAGE_MAX_HEADWAY is the filter's eligibility bound, not a cadence, so the row reads no regular service (CTA 9
    // to Vincennes midday: two bursts 313 minutes apart, never "every 313"). A shorter wait keeps the period's number, and the
    // gap is named below (gap words).
    if (d.tier !== 'infrequent') value = wait;
    else if (wait > PERIOD_COVERAGE_MAX_HEADWAY) { value = null; waitNotCadence = true; }
  }
  // CIV-1959 follow-up (CIV-1241, CIV-1411, #934): a row that starts late, stops early or starts slowly on its own trips (rowPeriodEdge, read
  // from its own departures with the test stretches use) says when, with its in-service spacing, never the bare wait or a number that
  // hides the edge. The value stays what it was, so the colour and the filter are unchanged (CIV-1411: card wording only).
  if (opts.branchReadings && !opts.ownTrips && !partPeriod && !filterReading && value != null) {
    const own = d.rowPeriodEdge?.[key];
    if (own && (own.from != null || own.until != null)) { partPeriod = periodEdgeText(own); partPeriodEvery = own.every; partPeriodGap = undefined; }
    // D6 (settled): the row's own steady service with one gap in it keeps the card's usual words, "every 28 min, with one 55 min gap".
    const gap = !partPeriod ? d.rowPeriodGap?.[key] : undefined;
    if (gap && gap.gap >= gap.every * ROW_GAP_WORDS_RATIO) { partPeriod = headwayPeriodShape(gap); partPeriodEvery = gap.every; partPeriodGap = gap.gap; }
  }
  // #773 (Strategy's pick for Ryan, 2026-11-22: gap words): a row the all-day grade called infrequent, with no words of its
  // own, names its one long gap where it is at least ROW_GAP_WORDS_RATIO times its number (#1239), "every 30 min, with one
  // 60 min gap". A gap over PERIOD_COVERAGE_MAX_HEADWAY is no cadence (#962): the row reads "Runs irregularly in this period"
  // (CTA 9 to Vincennes midday, two bursts 313 minutes apart; LA Metro 108 Mesmer / Major PM, 167).
  if (d.tier === 'infrequent' && !partPeriod && value != null && !stretch && !waitNotCadence) {
    const g = d.maxGapByPeriod?.[key];
    if (typeof g === 'number' && g >= value * ROW_GAP_WORDS_RATIO) {
      if (g <= PERIOD_COVERAGE_MAX_HEADWAY) { partPeriod = headwayPeriodShape({ every: value, gap: g }); partPeriodEvery = value; }
      else { value = null; waitNotCadence = true; }
    }
  }
  // #773: a row with no cadence by the shared gap-words test reads "Runs irregularly in this period", never its direction's
  // filter value (Chatham-Kent 5 midday: every 45 with a 75 min gap, not "every 75").
  if (!stretch && !partPeriod && infrequentRowNoCadence(d, period)) { value = null; waitNotCadence = true; }
  // CIV-2171 (Ryan, 2026-11-23, "1"): no card names a gap over an hour, as #773's gap words: words that would name one
  // (D6's "every 5 min, with one 169 min gap", #1239's) read "Runs irregularly in this period" instead (#962: a wait over
  // PERIOD_COVERAGE_MAX_HEADWAY is no cadence). Card wording only: the colour and the filter are unchanged.
  if (partPeriodGap != null && partPeriodGap > PERIOD_COVERAGE_MAX_HEADWAY) { partPeriod = undefined; partPeriodEvery = undefined; value = null; waitNotCadence = true; }
  // The stretch's gap goes with the stretch's value: a row with a value of its own, faster (NYCT R late: 13 beside the
  // stretch's 165, CIV-1074 2c) or slower (Phoenix 35: 30 on a shared 15), keeps its own trips' gap. A row with no value of its
  // own, or on data without the slot's period (public tails: it lives in the sections file), takes its stretch's gap.
  const fromSlot = typeof slotGap === 'number' && (value == null || typeof slotValue !== 'number' || value === slotValue);
  const ownGap = d.maxGapByPeriod?.[key];
  return {
    value,
    longestGap: stretch ? stretch.longestGap : fromSlot ? slotGap : typeof ownGap === 'number' ? ownGap : null,
    partPeriod,
    ...(partPeriodEvery != null ? { partPeriodEvery } : {}),
    noOwnService: false,
    ...(waitNotCadence ? { waitNotCadence } : {}),
  };
}

/**
 * #962 (Ryan picked option 1): a main-stretch row with no value of its own falls back to its direction's filter value. Where
 * the direction's stretch is not steady in the period and that value is over PERIOD_COVERAGE_MAX_HEADWAY, it is the
 * full-window worst wait, an eligibility bound for the filter, not a cadence (exo MA weekday midday: "every 301"), so the row
 * reads no regular service. A wait of an hour or less keeps its number: the pipeline also calls uneven but frequent service
 * unsteady (Lexington 5 to Wal Mart midday, about 3 buses an hour, "every 37"), and a short worst wait only understates it.
 * A steady stretch keeps its value, as does a row with part-period words. Overnight reads the Night Service verdict (#1267).
 */
export function unsteadyDirectionFallback(d: ShapeProperties, period: TimePeriod, trips: RowTrips = rowTrips(d, period)): boolean {
  if (period === 'all' || period === 'overnight' || d.stretchRole !== 'main') return false;
  if (trips.value != null || trips.partPeriod != null || trips.noOwnService) return false;
  const key = period as PeriodKey;
  const value = d.directionFilterHeadwayByPeriod?.[key];
  return typeof value === 'number' && value > PERIOD_COVERAGE_MAX_HEADWAY && d.stretchPeriodSustained?.[key] === false;
}

/**
 * CIV-1959 (Ryan: "any piece with 3 or more evenly spaced trips gets a number"): whether a row's own trips in a period pass rule D: 3 or
 * more departures, evenly spaced (the longest gap within 1.75 x the spacing, or the spacing plus 5 minutes). A row that passes keeps its own
 * reading even where the piece it sits on has no number (the piece's list is thin or bunched at its reference stop by other destinations' trips).
 */
export function rowOwnTripsEven(d: ShapeProperties, period: TimePeriod): boolean {
  if (period === 'all' || period === 'overnight') return false;
  const trips = Object.entries(d.departuresByHour ?? {}).filter(([h]) => isHourInPeriod(Number(h), period)).reduce((sum, [, n]) => sum + n, 0);
  const hw = d.headwayByPeriod?.[period];
  const gap = d.maxGapByPeriod?.[period];
  return trips >= 3 && typeof hw === 'number' && typeof gap === 'number' && gap <= Math.max(1.75 * hw, Math.round(hw) + 5);
}

/**
 * The piece treatment a row's own even trips give (rowOwnTripsEven): the filter's own value for them (a steady period within
 * PERIOD_COVERAGE_MAX_HEADWAY reads its spacing, any other its full-window wait, as stretchFilterValue), with its from / until words
 * when it starts or stops inside the period (rowPeriodEdge). Null when the row's own trips do not pass rule D.
 */
export function rowOwnTreatment(d: ShapeProperties, period: TimePeriod): { t: 'reading'; v: number } | { t: 'tail'; v: number; every: number; from?: number; until?: number; then?: number } | null {
  if (period === 'all' || period === 'overnight' || d.noOwnServiceByPeriod?.includes(period) || !rowOwnTripsEven(d, period)) return null;
  const hw = d.headwayByPeriod?.[period] as number, cov = d.periodCoverageHeadway?.[period];
  const consistent = d.headwayByPeriodSustained?.[period] === true && typeof cov === 'number' && cov <= PERIOD_COVERAGE_MAX_HEADWAY;
  const v = consistent || typeof cov !== 'number' ? hw : cov;
  const edge = d.rowPeriodEdge?.[period];
  if (edge && (edge.from != null || edge.until != null)) return { t: 'tail', v, every: edge.every, ...(edge.from != null ? { from: edge.from } : {}), ...(edge.until != null ? { until: edge.until } : {}), ...(edge.then != null ? { then: edge.then } : {}) };
  return { t: 'reading', v };
}
