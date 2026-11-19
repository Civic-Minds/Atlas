/**
 * Every period rule Atlas uses, in one place (rules audit 4.1, move 4): the six map periods and their minutes, the four
 * daytime periods, the sparkline hours, the grading windows, the headline windows, both night windows, the
 * frequent-service windows and the Live service day's end. Imports nothing, so any bundle, the pipeline and the scripts
 * can read it. A change to any value here is a methodology change and needs Ryan's word-for-word OK.
 */
export interface PeriodConfig<K extends string = string> {
  key: K;
  label: string;
  startHour: number;
  endHour: number;
}

/**
 * CIV-1764 DRY RUN, option 2: a proposal, NOT APPROVED by Ryan, not for merge. The one hour the night ends, 29 = 5 AM,
 * read by the Overnight period and by the Night Service window (STRETCH_NIGHT_END_MIN). Approved Overnight end: 30 (6 AM).
 */
const NIGHT_END_HOUR = 29;

export const TIME_PERIODS = [
  { key: 'amPeak',    label: 'AM peak',    startHour: 6,  endHour: 9  },
  { key: 'midday',    label: 'Midday',     startHour: 9,  endHour: 15 },
  { key: 'pmPeak',    label: 'PM peak',    startHour: 15, endHour: 19 },
  { key: 'evening',   label: 'Evening',    startHour: 19, endHour: 23 },
  { key: 'late',      label: 'Late',       startHour: 23, endHour: 26 },
  // CIV-1764 dry run, not approved: ends at NIGHT_END_HOUR (5 AM), not the approved 6 AM.
  { key: 'overnight', label: 'Overnight',  startHour: 26, endHour: NIGHT_END_HOUR },
] as const satisfies readonly PeriodConfig[];

export type PeriodKey = (typeof TIME_PERIODS)[number]['key'];

export const PERIOD_KEYS: PeriodKey[] = TIME_PERIODS.map(p => p.key);

/** Each period's window in minutes after midnight, [start, end), the unit the pipeline reads departures in (CIV-986). */
export const PERIOD_MINUTES = Object.fromEntries(
  TIME_PERIODS.map(p => [p.key, { start: p.startHour * 60, end: p.endHour * 60 }]),
) as Record<PeriodKey, { start: number; end: number }>;

/** Minutes in a day: a departure written at or past this belongs to the night after its service day. */
export const MINUTES_PER_DAY = 1440;

/** The day's times before midnight, moved to the following night (02:00 read as 26:00). */
export const asNextNight = (times: readonly number[]): number[] =>
  times.filter(t => t < MINUTES_PER_DAY).map(t => t + MINUTES_PER_DAY);

export const PERIOD_LABELS: Record<PeriodKey, string> = Object.fromEntries(
  TIME_PERIODS.map(p => [p.key, p.label]),
) as Record<PeriodKey, string>;

/** Map clock/sparkline hour to GTFS extended hour for period lookup (matches filter chip logic). */
export function toGtfsHour(h: number): number {
  return h < 6 ? h + 24 : h;
}

export function periodKeyForHour(h: number): PeriodKey | null {
  const gtfsH = toGtfsHour(h);
  return TIME_PERIODS.find(p => gtfsH >= p.startHour && gtfsH < p.endHour)?.key ?? null;
}

export function isHourInPeriod(h: number, periodKey: string): boolean {
  const gtfsH = toGtfsHour(h);
  const p = TIME_PERIODS.find(t => t.key === periodKey);
  return p != null && gtfsH >= p.startHour && gtfsH < p.endHour;
}

/** Sparkline data window: 6 AM–2 AM, then overnight tail 3 AM, 4 AM, 5 AM. */
export const SPARKLINE_START_HOUR = 5;
export const SPARKLINE_END_HOUR = 26;
/** GTFS hours for 3 AM and 4 AM — omitted when #100 moved 5 AM to the tail. */
export const SPARKLINE_OVERNIGHT_TAIL = [27, 28, SPARKLINE_START_HOUR] as const;
/** Display order: 6 AM → 2 AM, then 3 AM, 4 AM, 5 AM (#100 overnight tail). */
export const SPARKLINE_HOURS: readonly number[] = [
  ...Array.from(
    { length: SPARKLINE_END_HOUR - SPARKLINE_START_HOUR },
    (_, i) => i + SPARKLINE_START_HOUR + 1,
  ),
  ...SPARKLINE_OVERNIGHT_TAIL,
];

/** The four daytime periods, AM peak to evening: the bands Live reports and the periods a daytime check reads. */
export const DAYTIME_PERIOD_KEYS = ['amPeak', 'midday', 'pmPeak', 'evening'] as const satisfies readonly PeriodKey[];
export type DaytimePeriodKey = (typeof DAYTIME_PERIOD_KEYS)[number];

/** The grading windows (DEFAULT_CRITERIA), in minutes after midnight: 07:00–22:00 weekdays and Saturdays, 09:00–21:00 Sundays. */
export const WEEKDAY_GRADING_WINDOW = { start: 7 * 60, end: 22 * 60 } as const;
export const SATURDAY_GRADING_WINDOW = { start: 7 * 60, end: 22 * 60 } as const;
export const SUNDAY_GRADING_WINDOW = { start: 9 * 60, end: 21 * 60 } as const;

/**
 * The three windows the headline reads, in minutes from midnight: midday first, then PM peak,
 * then a sustained all-day (6-22h) value as the last resort.
 */
export const HEADLINE_WINDOWS = {
  midday: { ...PERIOD_MINUTES.midday },
  pmPeak: { ...PERIOD_MINUTES.pmPeak },
  allDay: { start: PERIOD_MINUTES.amPeak.start, end: 22 * 60 },
} as const;

/**
 * The night window: 2-5am, GTFS 26:00 to 29:00 (FREQUENCY_RULES rule 10). Night Service and the Overnight period read
 * it through the stretch fields (D7). The old 2-6am window was read by nothing but the cross-midnight fold, which only
 * checks that a window ends after midnight, so it is gone (CIV-1812 item 1).
 */
export const STRETCH_NIGHT_START_MIN = 26 * 60;
export const STRETCH_NIGHT_END_MIN = NIGHT_END_HOUR * 60;

/** Sustained frequent service reads 7am-7pm; the research flags read 7am-7pm (daytime) and 7am-midnight (extended). */
export const FREQUENT_SERVICE_WINDOW_START_MIN = 7 * 60;
export const FREQUENT_SERVICE_WINDOW_END_MIN = 19 * 60;
export const RESEARCH_FREQUENT_SERVICE_START_MIN = 7 * 60;
export const RESEARCH_FREQUENT_SERVICE_DAYTIME_END_MIN = 19 * 60;
export const RESEARCH_FREQUENT_SERVICE_EXTENDED_END_MIN = 24 * 60;

/** A Live agency's service day ends at this local hour unless its config says otherwise. */
export const DEFAULT_SERVICE_DAY_END_HOUR = 4;
