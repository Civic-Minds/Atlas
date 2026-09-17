import { DAY_TYPES, type DayType } from './dayTypes';

export type FrequentServiceWindow = 'daytime' | 'extended';
export type FrequentServiceFrequency = 15 | 30;

export const FREQUENT_SERVICE_DAY_ORDER = DAY_TYPES;

export function parseFrequentServiceDays(raw: string | null): DayType[] {
  const days = (raw ?? '').split(',').filter((d): d is DayType => (DAY_TYPES as readonly string[]).includes(d));
  return FREQUENT_SERVICE_DAY_ORDER.filter(day => days.includes(day));
}

export function frequentServiceQueryKey(frequency: FrequentServiceFrequency, window: FrequentServiceWindow): 'daytime15' | 'daytime30' | 'extended15' | 'extended30' {
  return `${window}${frequency}` as 'daytime15' | 'daytime30' | 'extended15' | 'extended30';
}

export function frequentServiceFeatureKey(properties: Record<string, unknown>): string {
  return [properties.agencySlug, properties.routeId, properties.routeBranch ?? '', properties.directionId, properties.headsign ?? ''].join('::');
}
