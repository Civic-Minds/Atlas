import type { ShapeProperties, TimePeriod } from '../hooks/useIntervalStats';
import { PERIOD_COVERAGE_MAX_HEADWAY } from '../../shared/periodEligibility';
import { periodEdgeText, routeCardDisplayHeadway, routeCardPeriodShapeEvery, routeCardPeriodShapeGap, routeCardPeriodShapeThen, routeCardPeriodShapeText, infrequentRowNoCadence, rowCarriesStretchWords, rowReadsPeriodEdge } from './effectiveHeadway';
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
  /** #1771: the later number the words name ("…, then every 6 min"), where they name one. */
  partPeriodThen?: number;
  /** The headsign runs under three times itself in the period: its value is other headsigns' (CTA 77 Belmont & Octavia). */
  noOwnService: boolean;
  /** #773, as #962: the row's only number was a full-window wait over PERIOD_COVERAGE_MAX_HEADWAY, so it reads no regular service. */
  waitNotCadence?: boolean;
  /**
   * CIV-2232: a row whose evenly spaced trips are over an hour apart reads their range ("every 58–71 min"), shortest to longest
   * gap; `value` is the longest. Absent when the gaps are all one number or the row has no such reading.
   */
  range?: { low: number; high: number };
  /** CIV-2232: the row reads Runs irregularly only because its trips past an hour are not evenly spaced (rule D). */
  irregularPastHour?: boolean;
}

const NONE: RowTrips = { value: null, longestGap: null, partPeriod: undefined, noOwnService: false };

/** The stretch slot a main or tail row stands for, from its stretchMeta; null for a variant or data without it. */
function stretchSlot(d: ShapeProperties) {
  if (d.stretchRole === 'main') return d.stretchMeta?.main ?? null;
  if (d.stretchRole === 'tail') return d.stretchMeta?.tails?.[d.stretchIndex ?? 0] ?? null;
  return null;
}

import { MIN_CARD_ROW_DEPARTURES, MIN_SCHEDULE_DEPARTURES, POOLED_MAX_GAP_GRACE_MINUTES, POOLED_MAX_GAP_RATIO, ROW_GAP_WORDS_RATIO } from '../../shared/rules/frequency';
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
export function rowTrips(d: ShapeProperties, period: TimePeriod, opts: { ownTrips?: boolean; stretch?: boolean; branchReadings?: boolean; /** #1823: another destination's row runs this row's stretch (rowStretchRunByOthers): the row reads its own trips only. */ stretchRunByOthers?: boolean } = {}): RowTrips {
  if (period === 'all') return { ...NONE, value: routeCardDisplayHeadway(d, period) };
  const key = period as PeriodKey;
  if (d.noOwnServiceByPeriod?.includes(key)) return { ...NONE, noOwnService: true };
  const readsShape = (d.stretchRole === 'main' || rowReadsPeriodEdge(d, period)) && !isOneGapRow(d, period);
  let partPeriod = readsShape ? routeCardPeriodShapeText(d, period) : undefined;
  let partPeriodEvery = partPeriod != null ? routeCardPeriodShapeEvery(d, period) : undefined;
  let partPeriodThen = partPeriod != null ? routeCardPeriodShapeThen(d, period) : undefined;
  // CIV-2171: the gap the words name, if any, for the one-hour cap below.
  let partPeriodGap = partPeriod != null ? routeCardPeriodShapeGap(d, period) : undefined;
  // CIV-995 (b): a main or tail row reads its stretch's own values (every trip at the stretch's stop) where the stretch runs
  // through the period: its cadence, steadiness and longest gap. Elsewhere, and on older data, the row's own trips. The
  // shared and pooled rows' comparison (ownTrips) and the stop card (stretch: false) keep reading the row's own trips.
  const stretch = opts.ownTrips || opts.stretch === false || opts.stretchRunByOthers ? null : rowStretchValue(d, period);
  let value = stretch ? stretch.cadence : routeCardDisplayHeadway(d, period);
  // #1823: a row's own trips are some of its stretch's, so they never run more often than the stretch: where its own reading
  // is shorter (a few trips' median, CTtransit 55 AM to Middletown: 40 on 6:00, 6:30, 7:20, 8:20), it keeps the stretch's.
  if (opts.stretchRunByOthers && value != null) {
    const shared = rowStretchValue(d, period)?.cadence;
    if (shared != null && shared > value) value = shared;
  }
  // ownTrips: the card's shared and pooled rows compare the rows' own trips with the stretch's, so they stay as they are
  // (SEPTA 19 Saturday midday keeps "Shared stretch every 63" over its two destinations every 120).
  const filterReading = partPeriod == null && value != null && !opts.ownTrips ? mainFilterReading(d, key) : null;
  if (filterReading) {
    value = filterReading.every;
    if (filterReading.gap != null) { partPeriod = headwayPeriodShape(filterReading); partPeriodEvery = filterReading.every ?? undefined; partPeriodThen = undefined; partPeriodGap = filterReading.gap; }
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
  // CIV-2232: the row was left without a number only because a wait or gap is over an hour (the rules below).
  let overHour = false;
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
    else if (wait > PERIOD_COVERAGE_MAX_HEADWAY) { value = null; waitNotCadence = true; overHour = true; }
  }
  // CIV-1959 follow-up (CIV-1241, CIV-1411, #934): a row that starts late, stops early or starts slowly on its own trips (rowPeriodEdge, read
  // from its own departures with the test stretches use) says when, with its in-service spacing, never the bare wait or a number that
  // hides the edge. The value stays what it was, so the colour and the filter are unchanged (CIV-1411: card wording only).
  if (opts.branchReadings && !opts.ownTrips && !partPeriod && !filterReading && value != null) {
    const own = d.rowPeriodEdge?.[key];
    if (own && (own.from != null || own.until != null)) { partPeriod = periodEdgeText(own); partPeriodEvery = own.every; partPeriodThen = own.then ?? undefined; partPeriodGap = undefined; }
    // D6 (settled): the row's own steady service with one gap in it keeps the card's usual words, "every 28 min, with one 55 min gap".
    const gap = !partPeriod ? d.rowPeriodGap?.[key] : undefined;
    if (gap && gap.gap >= gap.every * ROW_GAP_WORDS_RATIO) { partPeriod = headwayPeriodShape(gap); partPeriodEvery = gap.every; partPeriodThen = undefined; partPeriodGap = gap.gap; }
  }
  // #773 (Strategy's pick for Ryan, 2026-11-22: gap words): a row the all-day grade called infrequent, with no words of its
  // own, names its one long gap where it is at least ROW_GAP_WORDS_RATIO times its number (#1239), "every 30 min, with one
  // 60 min gap". A gap over PERIOD_COVERAGE_MAX_HEADWAY is no cadence (#962): the row reads "Runs irregularly in this period"
  // (CTA 9 to Vincennes midday, two bursts 313 minutes apart; LA Metro 108 Mesmer / Major PM, 167).
  if (d.tier === 'infrequent' && !partPeriod && value != null && !stretch && !waitNotCadence) {
    const g = d.maxGapByPeriod?.[key];
    if (typeof g === 'number' && g >= value * ROW_GAP_WORDS_RATIO) {
      if (g <= PERIOD_COVERAGE_MAX_HEADWAY) { partPeriod = headwayPeriodShape({ every: value, gap: g }); partPeriodEvery = value; partPeriodThen = undefined; }
      else { value = null; waitNotCadence = true; overHour = true; }
    }
  }
  // #773: a row with no cadence by the shared gap-words test reads "Runs irregularly in this period", never its direction's
  // filter value (Chatham-Kent 5 midday: every 45 with a 75 min gap, not "every 75").
  if (!stretch && !partPeriod && infrequentRowNoCadence(d, period)) { value = null; waitNotCadence = true; }
  // CIV-2171 (Ryan, 2026-11-23, "1"): no card names a gap over an hour, as #773's gap words: words that would name one
  // (D6's "every 5 min, with one 169 min gap", #1239's) read "Runs irregularly in this period" instead (#962: a wait over
  // PERIOD_COVERAGE_MAX_HEADWAY is no cadence). Card wording only: the colour and the filter are unchanged.
  if (partPeriodGap != null && partPeriodGap > PERIOD_COVERAGE_MAX_HEADWAY) { partPeriod = undefined; partPeriodEvery = undefined; partPeriodThen = undefined; value = null; waitNotCadence = true; overHour = true; }
  // CIV-2232 (Ryan, 2026-11-24: "if it is a persistent like 58-71 minutes or something then I think we should put that range ... but
  // if it is like 2 trips or 3 trips or not regular intervals then I think we should put Irregular"): past an hour, the row's own
  // trips decide. Evenly spaced by rule D (rowOwnTripsEven: MIN_SCHEDULE_DEPARTURES trips or more, the longest gap within the
  // evenness bound) reads their range, shortest to longest gap, however long (Bustang "every 120 min"); anything else reads
  // "Runs irregularly in this period" (TTC 101 to Wilson midday, two trips 320 minutes apart). Words that explain the wait (a late
  // start or early end) keep them. Card wording only: the map colour and the filter are unchanged.
  let range: RowTrips['range'];
  let irregularPastHour = false;
  const longNumber = value != null && value > PERIOD_COVERAGE_MAX_HEADWAY && partPeriod == null && !stretch;
  if (overHour || longNumber) {
    const even = rowOwnTripsEven(d, key);
    // A number the row already shows from even trips stays as it is; only a row the hour cap left without one gains a reading.
    const own = even && overHour ? longReading(d, key) : null;
    if (own) {
      value = own.high; waitNotCadence = false; partPeriod = undefined; partPeriodEvery = undefined; partPeriodThen = undefined;
      if (own.low < own.high) range = own;
    } else if (!even) { value = null; waitNotCadence = true; partPeriod = undefined; partPeriodEvery = undefined; partPeriodThen = undefined; irregularPastHour = true; }
    // Even trips that already show a number, or whose gaps are all within the hour, read as before.
  }
  // CIV-2232 (Ryan, 2026-11-24, "1": "Need at least 4 trips in the period to show a number; 2–3 trips read Irregular", then "1":
  // only on cards without "from …"/"until …" words): a row whose period wait is over an hour and that has fewer than
  // MIN_CARD_ROW_DEPARTURES of its own trips in the period reads "Runs irregularly in this period". A row whose words say when
  // its service starts or stops ("every 60 min until 5:14 PM") keeps them; so does a row reading the filter's stretch value.
  const edgeWords = partPeriod != null && /\b(from|until)\b/.test(partPeriod);
  const longWait = (d.periodCoverageHeadway?.[key] ?? 0) > PERIOD_COVERAGE_MAX_HEADWAY;
  if (longWait && !edgeWords && !filterReading && !opts.ownTrips && (value != null || partPeriod != null)) {
    const own = ownDeparturesIn(d, key);
    if (own > 0 && own < MIN_CARD_ROW_DEPARTURES) { value = null; waitNotCadence = true; partPeriod = undefined; partPeriodEvery = undefined; partPeriodThen = undefined; range = undefined; irregularPastHour = true; }
  }
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
    ...(partPeriodThen != null ? { partPeriodThen } : {}),
    noOwnService: false,
    ...(waitNotCadence ? { waitNotCadence } : {}),
    ...(range ? { range } : {}),
    ...(irregularPastHour ? { irregularPastHour } : {}),
  };
}

/**
 * CIV-2232: the reading of a row whose own trips in the period are evenly spaced (rule D, rowOwnTripsEven) more than an hour
 * apart: shortest to longest gap between them (headwayRangeByPeriod, the row's own departures). Null when they are not even,
 * or the data has no gaps for them.
 */
function longReading(d: ShapeProperties, key: PeriodKey): { low: number; high: number } | null {
  const gaps = d.headwayRangeByPeriod?.[key];
  const longest = d.maxGapByPeriod?.[key];
  const high = typeof longest === 'number' ? longest : gaps?.max;
  if (typeof high !== 'number' || high <= PERIOD_COVERAGE_MAX_HEADWAY) return null;
  const low = typeof gaps?.min === 'number' ? Math.min(gaps.min, high) : high;
  return { low: Math.round(low), high: Math.round(high) };
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
 * more departures, evenly spaced (the longest gap within POOLED_MAX_GAP_RATIO x the spacing, or the spacing plus POOLED_MAX_GAP_GRACE_MINUTES; the pooled-list test's numbers). A row that passes keeps its own
 * reading even where the piece it sits on has no number (the piece's list is thin or bunched at its reference stop by other destinations' trips).
 */
/** A row's own departures in a period (departuresByHour), the count rule D and MIN_CARD_ROW_DEPARTURES read. */
function ownDeparturesIn(d: ShapeProperties, period: Exclude<TimePeriod, 'all'>): number {
  return Object.entries(d.departuresByHour ?? {}).filter(([h]) => isHourInPeriod(Number(h), period)).reduce((sum, [, n]) => sum + n, 0);
}

export function rowOwnTripsEven(d: ShapeProperties, period: TimePeriod): boolean {
  if (period === 'all' || period === 'overnight') return false;
  const trips = ownDeparturesIn(d, period);
  const hw = d.headwayByPeriod?.[period];
  const gap = d.maxGapByPeriod?.[period];
  return trips >= MIN_SCHEDULE_DEPARTURES && typeof hw === 'number' && typeof gap === 'number'
    && gap <= Math.max(POOLED_MAX_GAP_RATIO * hw, Math.round(hw) + POOLED_MAX_GAP_GRACE_MINUTES);
}

/**
 * The piece treatment a row's own even trips give (rowOwnTripsEven): the filter's own value for them (a steady period within
 * PERIOD_COVERAGE_MAX_HEADWAY reads its spacing, any other its full-window wait, as stretchFilterValue), with its from / until words
 * when it starts or stops inside the period (rowPeriodEdge). Null when the row's own trips do not pass rule D.
 */
export function rowOwnTreatment(d: ShapeProperties, period: TimePeriod): { t: 'reading'; v: number } | { t: 'tail'; v: number; every: number; from?: number; until?: number; then?: number; thenGap?: number } | null {
  if (period === 'all' || period === 'overnight' || d.noOwnServiceByPeriod?.includes(period) || !rowOwnTripsEven(d, period)) return null;
  const hw = d.headwayByPeriod?.[period] as number, cov = d.periodCoverageHeadway?.[period];
  const consistent = d.headwayByPeriodSustained?.[period] === true && typeof cov === 'number' && cov <= PERIOD_COVERAGE_MAX_HEADWAY;
  const v = consistent || typeof cov !== 'number' ? hw : cov;
  const edge = d.rowPeriodEdge?.[period];
  const edgeWords = edge != null && (edge.from != null || edge.until != null);
  // #1827: CIV-2232's 4-trip minimum (Ryan, 2026-11-24), as rowTrips has it: a row whose period wait is over an hour, with fewer than
  // MIN_CARD_ROW_DEPARTURES of its own trips and no "from …"/"until …" words, gets no number (SEPTA 20 Sunday evening to Frankford
  // Transit Center: 3 trips read "every 171 min").
  if (!edgeWords && (cov ?? 0) > PERIOD_COVERAGE_MAX_HEADWAY && ownDeparturesIn(d, period) < MIN_CARD_ROW_DEPARTURES) return null;
  if (edgeWords) return { t: 'tail', v, every: edge.every, ...(edge.from != null ? { from: edge.from } : {}), ...(edge.until != null ? { until: edge.until } : {}), ...(edge.then != null ? { then: edge.then } : {}), ...(edge.thenGap != null ? { thenGap: edge.thenGap } : {}) };
  return { t: 'reading', v };
}
