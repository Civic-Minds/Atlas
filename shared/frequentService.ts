import { DAY_TYPES, type DayType } from './dayTypes';
import { hourRange } from './timeText';

export type FrequentServiceWindow = 'daytime' | 'extended';
export type FrequentServiceFrequency = 15 | 30;

/** Each window's hours (GTFS hours) and its label in the app's one time format (CIV-1095): "7 AM–7 PM". */
export const FREQUENT_WINDOW_HOURS: Record<FrequentServiceWindow, { start: number; end: number }> = {
  daytime: { start: 7, end: 19 },
  extended: { start: 7, end: 24 },
};
export const FREQUENT_WINDOW_LABELS: Record<FrequentServiceWindow, string> = {
  daytime: hourRange(FREQUENT_WINDOW_HOURS.daytime.start, FREQUENT_WINDOW_HOURS.daytime.end),
  extended: hourRange(FREQUENT_WINDOW_HOURS.extended.start, FREQUENT_WINDOW_HOURS.extended.end),
};
export type FrequentServiceBand = '15' | '30';

export const FREQUENT_SERVICE_DAY_ORDER = DAY_TYPES;

export function parseFrequentServiceDays(raw: string | null): DayType[] {
  const days = (raw ?? '').split(',').filter((d): d is DayType => (DAY_TYPES as readonly string[]).includes(d));
  return FREQUENT_SERVICE_DAY_ORDER.filter(day => days.includes(day));
}

export function frequentServiceQueryKey(frequency: FrequentServiceFrequency, window: FrequentServiceWindow): 'daytime15' | 'daytime30' | 'extended15' | 'extended30' {
  return `${window}${frequency}` as 'daytime15' | 'daytime30' | 'extended15' | 'extended30';
}

/** Classify a route for the research map's 30-minute view without changing the filter threshold. */
export function frequentServiceBand(
  properties: Record<string, any>,
  window: FrequentServiceWindow,
  frequency: FrequentServiceFrequency,
): FrequentServiceBand {
  if (frequency === 15) return '15';
  return properties.researchFrequentService?.[frequentServiceQueryKey(15, window)] ? '15' : '30';
}

export function frequentServiceFeatureKey(properties: Record<string, unknown>): string {
  return [properties.agencySlug, properties.routeId, properties.routeBranch ?? '', properties.directionId, properties.headsign ?? ''].join('::');
}
