import type { DayType } from './dayTypes.js';
import { TIME_PERIODS, type PeriodKey } from './config.js';

export type OnDemandPeriod = 'all' | PeriodKey;
export interface OnDemandHours {
  startHour: number;
  endHour: number;
}

export type OnDemandAvailability = Partial<Record<DayType, readonly OnDemandHours[]>>;

/** Unknown availability stays visible; authored schedules can opt into exact filtering. */
export function isOnDemandActive(
  availability: OnDemandAvailability | undefined,
  day: DayType,
  period: OnDemandPeriod,
): boolean {
  if (!availability) return true;
  const operatingWindows = availability[day];
  if (!operatingWindows) return true;
  if (period === 'all') return operatingWindows.length > 0;
  const selectedPeriod = TIME_PERIODS.find(candidate => candidate.key === period);
  if (!selectedPeriod) return true;
  return operatingWindows.some(window =>
    window.startHour < selectedPeriod.endHour && window.endHour > selectedPeriod.startHour,
  );
}

const DAY_TYPE_ORDER: readonly DayType[] = ['Weekday', 'Saturday', 'Sunday'];

/** How riders are picked up, stated only where the agency's data says so. */
export type OnDemandPickupMethod = 'door-to-door' | 'curb-to-curb' | 'virtual-stops' | 'fixed-stops' | 'connection-points';

export interface OnDemandPickup {
  method: OnDemandPickupMethod;
  /** Agency wording that adds to the generic sentence, e.g. "There are no fixed stops." */
  note?: string;
}

export interface OnDemandZoneDetails {
  serviceName?: string;
  serviceHours?: string;
  /** Text-only qualifiers that structured hours can't express, e.g. holidays. */
  hoursNote?: string;
  bookingInfo?: string;
  availability?: OnDemandAvailability;
  pickup?: OnDemandPickup;
}

/** Structural subset of an agency's on-demand service used for hours and pickup lookups. */
export interface OnDemandServiceDetails extends OnDemandZoneDetails {
  features: readonly { properties?: unknown }[];
  stopFeatures?: readonly { properties?: unknown }[];
  tripRules?: string;
  zoneMetadata?: Record<string, OnDemandZoneDetails>;
}

export interface ResolvedOnDemandZone extends OnDemandZoneDetails {
  /** False when the zone belongs to a different service than the parent (e.g. Hamilton Trans-Cab beside myRide). */
  sameServiceAsParent: boolean;
  tripRules?: string;
}

function areaNameOf(properties: unknown): string | undefined {
  const name = (properties as { areaName?: unknown } | null | undefined)?.areaName;
  return typeof name === 'string' && name ? name : undefined;
}

/**
 * Resolve the details that apply to one zone. A zone inherits the parent
 * service's hours and pickup method only when it is part of that same service;
 * a separately named service never borrows another service's hours.
 */
export function resolveOnDemandZone(service: OnDemandServiceDetails, areaName: string | undefined): ResolvedOnDemandZone {
  const zone = areaName ? service.zoneMetadata?.[areaName] : undefined;
  if (!zone) {
    return {
      sameServiceAsParent: true,
      serviceName: service.serviceName,
      serviceHours: service.serviceHours,
      hoursNote: service.hoursNote,
      bookingInfo: service.bookingInfo,
      availability: service.availability,
      pickup: service.pickup,
      tripRules: service.tripRules,
    };
  }
  const sameService = !zone.serviceName || zone.serviceName === service.serviceName;
  if (!sameService) return { ...zone, sameServiceAsParent: false };
  return {
    sameServiceAsParent: true,
    serviceName: zone.serviceName ?? service.serviceName,
    serviceHours: zone.availability ? zone.serviceHours : zone.serviceHours ?? service.serviceHours,
    hoursNote: zone.hoursNote ?? service.hoursNote,
    bookingInfo: zone.bookingInfo ?? service.bookingInfo,
    availability: zone.availability ?? service.availability,
    pickup: zone.pickup ?? service.pickup,
    tripRules: service.tripRules,
  };
}

/** Zone names a stop belongs to: an exact polygon name, or a ", "-joined list of polygon names. */
export function onDemandStopZoneNames(service: OnDemandServiceDetails, stopProperties: unknown): string[] {
  const areaName = areaNameOf(stopProperties);
  if (!areaName) return [];
  const zoneNames = new Set(service.features.map(feature => areaNameOf(feature.properties)).filter((name): name is string => !!name));
  if (zoneNames.has(areaName)) return [areaName];
  return areaName.split(', ').filter(name => zoneNames.has(name));
}

export type OnDemandRunningState = 'running' | 'not-running' | 'unknown';

/** Like isOnDemandActive, but distinguishes "no hours on file" from "running". */
export function onDemandRunningState(
  availability: OnDemandAvailability | undefined,
  day: DayType,
  period: OnDemandPeriod,
): OnDemandRunningState {
  if (!availability || !availability[day]) return 'unknown';
  if (period !== 'all' && !TIME_PERIODS.some(candidate => candidate.key === period)) return 'unknown';
  return isOnDemandActive(availability, day, period) ? 'running' : 'not-running';
}

/** Whether a polygon should be drawn for the selected day and period. Unknown hours stay visible. */
export function isOnDemandZoneShown(service: OnDemandServiceDetails, areaName: string | undefined, day: DayType, period: OnDemandPeriod): boolean {
  return onDemandRunningState(resolveOnDemandZone(service, areaName).availability, day, period) !== 'not-running';
}

/**
 * Whether a stop or transfer point should be drawn. A stop tied to zones follows
 * those zones' hours; a stop with no zone follows the service's own hours.
 */
export function isOnDemandStopShown(service: OnDemandServiceDetails, stopProperties: unknown, day: DayType, period: OnDemandPeriod): boolean {
  const zones = onDemandStopZoneNames(service, stopProperties);
  if (zones.length === 0) return isOnDemandZoneShown(service, undefined, day, period);
  return zones.some(zone => isOnDemandZoneShown(service, zone, day, period));
}

/** True when hours for the selected day are on file for this stop or zone. */
export function onDemandHoursConfirmed(service: OnDemandServiceDetails, areaNames: readonly string[], day: DayType): boolean {
  const names = areaNames.length ? areaNames : [undefined];
  return names.every(name => !!resolveOnDemandZone(service, name).availability?.[day]);
}

/** 4.5 → "4:30 a.m."; 26 → "2:00 a.m." (next day); 24 → "midnight". */
export function formatOnDemandClock(hour: number): string {
  const totalMinutes = Math.round(hour * 60);
  const minutesInDay = ((totalMinutes % 1440) + 1440) % 1440;
  if (minutesInDay === 0) return 'midnight';
  if (minutesInDay === 720) return 'noon';
  const h24 = Math.floor(minutesInDay / 60);
  const minutes = minutesInDay % 60;
  const suffix = h24 < 12 ? 'a.m.' : 'p.m.';
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${String(minutes).padStart(2, '0')} ${suffix}`;
}

function formatWindows(windows: readonly OnDemandHours[]): string {
  return windows.map(window => `${formatOnDemandClock(window.startHour)}–${formatOnDemandClock(window.endHour)}`).join(', ');
}

const DAY_GROUP_LABELS: Record<string, string> = {
  'Weekday': 'Mon–Fri',
  'Saturday': 'Sat',
  'Sunday': 'Sun',
  'Weekday,Saturday': 'Mon–Sat',
  'Saturday,Sunday': 'Sat–Sun',
  'Weekday,Sunday': 'Sun–Fri',
  'Weekday,Saturday,Sunday': 'Daily',
};

export interface OnDemandHoursLine {
  dayTypes: DayType[];
  text: string;
}

/**
 * Hours lines built from structured availability, combining day types with
 * identical windows. Day types missing from the data are left out rather than
 * guessed; an empty list means the agency publishes no service that day.
 */
export function formatOnDemandHoursLines(availability: OnDemandAvailability | undefined): OnDemandHoursLine[] {
  if (!availability) return [];
  const groups = new Map<string, DayType[]>();
  for (const day of DAY_TYPE_ORDER) {
    const windows = availability[day];
    if (!windows) continue;
    const key = JSON.stringify(windows.map(window => [Math.round(window.startHour * 60), Math.round(window.endHour * 60)]));
    groups.set(key, [...(groups.get(key) ?? []), day]);
  }
  return [...groups.entries()].map(([key, dayTypes]) => {
    const label = DAY_GROUP_LABELS[dayTypes.join(',')];
    const windows = availability[dayTypes[0]] ?? [];
    return { dayTypes, text: key === '[]' ? `${label}: no service` : `${label} ${formatWindows(windows)}` };
  });
}

const RUNNING_DAY_LABELS: Record<DayType, string> = { Weekday: 'weekday', Saturday: 'Saturday', Sunday: 'Sunday' };
const RUNNING_PERIOD_LABELS: Record<OnDemandPeriod, string> = {
  all: '',
  amPeak: 'AM peak',
  midday: 'midday',
  pmPeak: 'PM peak',
  evening: 'evening',
  late: 'late night',
  overnight: 'overnight',
};

/** Plain note for the selected day/period. Never claims service when hours are missing. */
export function onDemandRunningNote(availability: OnDemandAvailability | undefined, day: DayType, period: OnDemandPeriod): string {
  const state = onDemandRunningState(availability, day, period);
  if (state === 'unknown') return 'Hours not confirmed for this time';
  if (state === 'not-running') return 'Not running at this time';
  if (period === 'all') return day === 'Weekday' ? 'Running on weekdays' : `Running on ${day}`;
  return `Running during ${RUNNING_DAY_LABELS[day]} ${RUNNING_PERIOD_LABELS[period]}`;
}

export interface OnDemandPickupStop {
  serviceType?: string;
}

/**
 * One sentence on how riders board, specific to the selected zone (or the
 * service when no zone is selected). Returns null when the data says nothing.
 */
export function onDemandPickupSentence(service: OnDemandServiceDetails, areaName: string | undefined): string | null {
  const resolved = resolveOnDemandZone(service, areaName);
  const stops = (service.stopFeatures ?? []).filter(stop => {
    const zones = onDemandStopZoneNames(service, stop.properties);
    return areaName ? zones.includes(areaName) : zones.length === 0;
  });
  const count = stops.length;
  const allTransferPoints = count > 0 && stops.every(stop => (stop.properties as OnDemandPickupStop | undefined)?.serviceType === 'on-demand-transfer-point');
  const plural = (singular: string, pluralForm: string) => `${count} ${count === 1 ? singular : pluralForm}`;
  const scope = areaName ? 'This zone' : 'This service';
  const pickup = resolved.pickup;
  let sentence: string | null = null;
  switch (pickup?.method) {
    case 'door-to-door':
      sentence = 'Pickups and drop-offs are door to door within the shaded area.';
      break;
    case 'curb-to-curb':
      sentence = 'Pickups and drop-offs are curb to curb within the shaded area.';
      break;
    case 'fixed-stops':
      sentence = count > 0
        ? `Pickups and drop-offs are at ${plural('set stop', 'set stops')}, shown on the map.`
        : 'Pickups and drop-offs are at set stops, not door to door.';
      break;
    case 'virtual-stops':
      sentence = count > 0
        ? `Pickups and drop-offs are at ${plural('virtual stop', 'virtual stops')}, shown on the map.`
        : 'Pickups and drop-offs are at virtual stops, not door to door.';
      break;
    case 'connection-points':
      sentence = 'This area is a connection point.';
      break;
    default:
      if (count > 0) {
        sentence = `${scope} has ${allTransferPoints ? plural('transfer point', 'transfer points') : plural('stop', 'stops')}, shown on the map.`;
      }
  }
  if (!sentence) return null;
  return pickup?.note ? `${sentence} ${pickup.note}` : sentence;
}
