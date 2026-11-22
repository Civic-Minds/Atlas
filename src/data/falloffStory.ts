import study from './falloff-story.json';
import type { DayType } from '../../shared/rules/days';
import { PERIOD_LABELS, TIME_PERIODS, type PeriodKey } from '../../shared/rules/periods';
import { hourRange } from '../../shared/timeText';

/**
 * #1074 (CIV-770): the fall-off story's figures, from falloff-story.json (scripts/research/buildFalloffStory.ts). Every
 * share is of route-kilometres that run every 15 minutes or better by the map's own rule. The selections follow the
 * outline Ryan approved (_reports/1074/OUTLINE.md, "1", 2026-11-22).
 */
export const falloffStudy = study;
export type FalloffAgency = (typeof study.agencies)[number];

/** The story's threshold: the map's "every 15" setting. */
export const FALLOFF_MINUTES = 15;
/** An agency counts as frequent in the morning from this share up (the steepest-drop and hold lists). */
export const FREQUENT_MORNING_MIN = study.frequentMorningMin;
/** A network "holds" when Sunday evening keeps at least this share of its weekday-morning level. */
export const HOLD_SHARE = 0.7;
const STEEPEST_COUNT = 10;

/** "Sunday evening", "Weekday AM peak": a day and a period, the period's own label with its first word in lower case. */
export const whenLabel = (day: DayType, period: PeriodKey) => `${day} ${PERIOD_LABELS[period].replace(/^[A-Z][a-z]/, s => s.toLowerCase())}`;
/** "6–9 AM": a period's hours. */
export const periodHours = (period: PeriodKey) => {
  const p = TIME_PERIODS.find(x => x.key === period)!;
  return hourRange(p.startHour, p.endHour);
};

/** The four times of the week the study read, in the week's order. */
export const FALLOFF_TIMES = [
  { key: 'weekdayMorning', day: 'Weekday', period: 'amPeak' },
  { key: 'weekdayMidday', day: 'Weekday', period: 'midday' },
  { key: 'saturdayMidday', day: 'Saturday', period: 'midday' },
  { key: 'sundayEvening', day: 'Sunday', period: 'evening' },
] as const satisfies ReadonlyArray<{ key: keyof typeof study.all; day: DayType; period: PeriodKey }>;
export const MORNING = FALLOFF_TIMES[0];
export const SUNDAY_EVENING = FALLOFF_TIMES[3];

const frequentMornings = study.agencies.filter(a => a.weekdayMorning >= FREQUENT_MORNING_MIN);
/** The biggest drops in percentage points. */
export const steepestDrops = [...frequentMornings].sort((a, b) => (b.weekdayMorning - b.sundayEvening) - (a.weekdayMorning - a.sundayEvening)).slice(0, STEEPEST_COUNT);
/** The networks that keep at least HOLD_SHARE of their morning level, largest first. */
export const holdingNetworks = frequentMornings.filter(a => a.sundayEvening >= HOLD_SHARE * a.weekdayMorning).sort((a, b) => b.routeKm - a.routeKm);
/** Agencies frequent in the morning with nothing frequent on Sunday evening (every agency, counted by the data file). */
export const noneOnSundayEvening = study.sized.noneOnSundayEvening;

/** The Greater Toronto and Hamilton Area's agencies, in the outline's order (the data file's list, set by its builder). */
export const gthaAgencies = study.gtha.map(slug => {
  const a = study.agencies.find(x => x.slug === slug);
  if (!a) throw new Error(`falloff-story.json has no ${slug}`);
  return a;
});

/** Each state or province's agencies (of the study's size) and how many run no Sunday service. */
export const noSundayRegions = [...study.agencies.reduce((m, a) => {
  const r = m.get(a.region) ?? { region: a.region, agencies: 0, noSunday: 0 };
  r.agencies++;
  if (!a.hasSunday) r.noSunday++;
  return m.set(a.region, r);
}, new Map<string, { region: string; agencies: number; noSunday: number }>()).values()].sort((a, b) => a.region.localeCompare(b.region));
