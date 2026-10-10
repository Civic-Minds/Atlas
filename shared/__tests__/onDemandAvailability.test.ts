import { describe, expect, it } from 'vitest';
import {
  isOnDemandActive,
  formatOnDemandClock,
  formatOnDemandHoursLines,
  isOnDemandStopShown,
  isOnDemandZoneShown,
  onDemandHoursConfirmed,
  onDemandPickupSentence,
  onDemandRunningNote,
  resolveOnDemandZone,
  type OnDemandServiceDetails,
} from '../onDemandAvailability.js';

describe('isOnDemandActive', () => {
  const availability = {
    Weekday: [{ startHour: 6.5, endHour: 19.5 }] as const,
    Saturday: [] as const,
  };

  it('matches the selected day and period', () => {
    expect(isOnDemandActive(availability, 'Weekday', 'evening')).toBe(true);
    expect(isOnDemandActive(availability, 'Weekday', 'overnight')).toBe(false);
    expect(isOnDemandActive(availability, 'Saturday', 'evening')).toBe(false);
  });

  it('derives visibility from operating hours and current period boundaries', () => {
    expect(isOnDemandActive({ Weekday: [{ startHour: 5.5, endHour: 21.5 }] }, 'Weekday', 'evening')).toBe(true);
    expect(isOnDemandActive({ Weekday: [{ startHour: 5.5, endHour: 21.5 }] }, 'Weekday', 'overnight')).toBe(false);
  });

  it('keeps unknown schedules visible', () => {
    expect(isOnDemandActive(undefined, 'Saturday', 'overnight')).toBe(true);
  });
});

describe('formatOnDemandHoursLines', () => {
  it('combines day types with identical windows', () => {
    const lines = formatOnDemandHoursLines({
      Weekday: [{ startHour: 4.5, endHour: 26 }],
      Saturday: [{ startHour: 4.5, endHour: 26 }],
      Sunday: [{ startHour: 5.5, endHour: 25 }],
    });
    expect(lines).toEqual([
      { dayTypes: ['Weekday', 'Saturday'], text: 'Mon–Sat 4:30 a.m.–2:00 a.m.' },
      { dayTypes: ['Sunday'], text: 'Sun 5:30 a.m.–1:00 a.m.' },
    ]);
    expect(formatOnDemandHoursLines({
      Weekday: [{ startHour: 7, endHour: 19 }],
      Saturday: [{ startHour: 7, endHour: 19 }],
      Sunday: [{ startHour: 7, endHour: 19 }],
    })).toEqual([{ dayTypes: ['Weekday', 'Saturday', 'Sunday'], text: 'Daily 7:00 a.m.–7:00 p.m.' }]);
  });

  it('shows hours past 24 as next-day clock times, rounding to the minute', () => {
    expect(formatOnDemandClock(26)).toBe('2:00 a.m.');
    expect(formatOnDemandClock(24)).toBe('midnight');
    expect(formatOnDemandClock(24.25)).toBe('12:15 a.m.');
    expect(formatOnDemandClock(12)).toBe('noon');
    expect(formatOnDemandClock(18.583)).toBe('6:35 p.m.');
    expect(formatOnDemandClock(5.917)).toBe('5:55 a.m.');
  });

  it('lists every window and marks days with no service', () => {
    expect(formatOnDemandHoursLines({
      Weekday: [{ startHour: 6, endHour: 10 }, { startHour: 14, endHour: 18 }],
      Saturday: [],
      Sunday: [],
    })).toEqual([
      { dayTypes: ['Weekday'], text: 'Mon–Fri 6:00 a.m.–10:00 a.m., 2:00 p.m.–6:00 p.m.' },
      { dayTypes: ['Saturday', 'Sunday'], text: 'Sat–Sun: no service' },
    ]);
  });

  it('leaves out day types the data does not cover instead of guessing', () => {
    expect(formatOnDemandHoursLines(undefined)).toEqual([]);
    expect(formatOnDemandHoursLines({ Weekday: [{ startHour: 7, endHour: 19 }] })).toEqual([
      { dayTypes: ['Weekday'], text: 'Mon–Fri 7:00 a.m.–7:00 p.m.' },
    ]);
  });
});

describe('onDemandRunningNote', () => {
  const availability = { Weekday: [{ startHour: 7, endHour: 19 }], Saturday: [{ startHour: 9, endHour: 15 }], Sunday: [] };

  it('names the selected day and period when running', () => {
    expect(onDemandRunningNote(availability, 'Saturday', 'midday')).toBe('Running during Saturday midday');
    expect(onDemandRunningNote(availability, 'Weekday', 'amPeak')).toBe('Running during weekday AM peak');
  });

  it('says not running outside the hours', () => {
    expect(onDemandRunningNote(availability, 'Saturday', 'evening')).toBe('Not running at this time');
    expect(onDemandRunningNote(availability, 'Sunday', 'midday')).toBe('Not running at this time');
  });

  it('never claims service when hours are missing', () => {
    expect(onDemandRunningNote(undefined, 'Saturday', 'midday')).toBe('Hours not confirmed for this time');
    expect(onDemandRunningNote({ Weekday: [{ startHour: 7, endHour: 19 }] }, 'Saturday', 'midday')).toBe('Hours not confirmed for this time');
  });
});

describe('on-demand zone and stop resolution', () => {
  const zoneA = { properties: { areaName: 'Zone A' } };
  const zoneB = { properties: { areaName: 'Zone B' } };
  const service: OnDemandServiceDetails = {
    serviceName: 'Main service',
    features: [zoneA, zoneB],
    stopFeatures: [
      { properties: { stopName: 'Own stop' } },
      { properties: { stopName: 'A point', areaName: 'Zone A', serviceType: 'on-demand-transfer-point' } },
      { properties: { stopName: 'Shared', areaName: 'Zone A, Zone B' } },
    ],
    zoneMetadata: {
      'Zone A': { serviceName: 'Other service', availability: { Weekday: [{ startHour: 6, endHour: 9 }], Saturday: [], Sunday: [] } },
      'Zone B': { pickup: { method: 'connection-points' } },
    },
    availability: { Weekday: [{ startHour: 15, endHour: 19 }], Saturday: [], Sunday: [] },
  };

  it('never lets a separately named zone borrow the parent service hours', () => {
    const withoutHours: OnDemandServiceDetails = { ...service, zoneMetadata: { 'Zone A': { serviceName: 'Other service' } } };
    expect(resolveOnDemandZone(withoutHours, 'Zone A').availability).toBeUndefined();
    expect(resolveOnDemandZone(service, 'Zone B').availability).toBe(service.availability);
  });

  it('hides stops when their zone is not running and keeps own stops on the service hours', () => {
    expect(isOnDemandStopShown(service, service.stopFeatures![1].properties, 'Weekday', 'pmPeak')).toBe(false);
    expect(isOnDemandStopShown(service, service.stopFeatures![1].properties, 'Weekday', 'amPeak')).toBe(true);
    expect(isOnDemandStopShown(service, service.stopFeatures![0].properties, 'Weekday', 'pmPeak')).toBe(true);
    expect(isOnDemandStopShown(service, service.stopFeatures![0].properties, 'Saturday', 'midday')).toBe(false);
    // A stop shared by two zones shows while either is running.
    expect(isOnDemandStopShown(service, service.stopFeatures![2].properties, 'Weekday', 'pmPeak')).toBe(true);
    expect(isOnDemandZoneShown(service, 'Zone B', 'Saturday', 'midday')).toBe(false);
  });

  it('keeps stops with unknown hours visible but unconfirmed', () => {
    const unknown: OnDemandServiceDetails = { features: [], stopFeatures: [{ properties: {} }] };
    expect(isOnDemandStopShown(unknown, {}, 'Sunday', 'overnight')).toBe(true);
    expect(onDemandHoursConfirmed(unknown, [], 'Sunday')).toBe(false);
    expect(onDemandHoursConfirmed(service, ['Zone A'], 'Saturday')).toBe(true);
  });

  it('describes pickups for the clicked zone only', () => {
    expect(onDemandPickupSentence(service, 'Zone A')).toBe('This zone has 2 stops, shown on the map.');
    expect(onDemandPickupSentence(service, 'Zone B')).toBe('This area is a connection point.');
    expect(onDemandPickupSentence(service, undefined)).toBe('This service has 1 stop, shown on the map.');
    const transfer: OnDemandServiceDetails = { ...service, stopFeatures: [service.stopFeatures![1]] };
    expect(onDemandPickupSentence(transfer, 'Zone A')).toBe('This zone has 1 transfer point, shown on the map.');
    expect(onDemandPickupSentence({ ...transfer, zoneMetadata: {} }, 'Zone B')).toBeNull();
  });
});
