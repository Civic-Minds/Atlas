import JSZip from 'jszip';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { processGtfsBuffer } from '../process-core';
import { detectReferenceDate, getActiveServiceIds } from '../transit-calendar';
import type { GtfsCalendar, GtfsCalendarDate } from '../../types/gtfs';

// Calendar gaps from the test audit (CIV-43): the wall-clock fallback of detectReferenceDate,
// a holiday that is not a Monday, and a feed with no Monday service at all.

function cal(service_id: string, days: string, start_date: string, end_date: string): GtfsCalendar {
  const on = (d: string) => (days.includes(d) ? '1' : '0');
  return {
    service_id,
    monday: on('mo'), tuesday: on('tu'), wednesday: on('we'), thursday: on('th'),
    friday: on('fr'), saturday: on('sa'), sunday: on('su'),
    start_date, end_date,
  };
}
const added = (service_id: string, date: string): GtfsCalendarDate => ({ service_id, date, exception_type: '1' });
const removed = (service_id: string, date: string): GtfsCalendarDate => ({ service_id, date, exception_type: '2' });

beforeAll(() => {
  vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-09-16T12:00:00') });
});
afterAll(() => {
  vi.useRealTimers();
});

describe('detectReferenceDate wall-clock fallback', () => {
  it('uses today when there is no calendar and no calendar_dates', () => {
    expect(detectReferenceDate([], [])).toBe('20260916');
    expect(detectReferenceDate([], undefined)).toBe('20260916');
  });

  it('uses today when calendar_dates holds only removals', () => {
    expect(detectReferenceDate([], [removed('a', '20260101'), removed('a', '20260102')])).toBe('20260916');
  });

  it('uses the midpoint of the added dates, ignoring removals, when only calendar_dates exists', () => {
    const dates = [added('a', '20260901'), added('a', '20260930'), removed('a', '20260105')];
    expect(detectReferenceDate([], dates)).toBe('20260915');
  });
});

describe('getActiveServiceIds with a holiday that is not a Monday', () => {
  // Thanksgiving Friday (Nov 27 2026): weekday service removed, Saturday service added.
  const calendar = [
    cal('reg', 'mo,tu,we,th,fr', '20261101', '20261231'),
    cal('sat', 'sa', '20261101', '20261231'),
  ];
  const dates = [removed('reg', '20261127'), added('sat', '20261127')];

  it('reads the Friday from a typical week instead of the Saturday service', () => {
    expect([...getActiveServiceIds(calendar, dates, 'Friday', '20261125')]).toEqual(['reg']);
  });

  it('keeps the Saturday day type on Saturday service', () => {
    expect([...getActiveServiceIds(calendar, dates, 'Saturday', '20261125')]).toEqual(['sat']);
  });
});

describe('processGtfsBuffer with no Monday service', () => {
  it('still produces weekday routes for a Tuesday to Friday feed', async () => {
    const zip = new JSZip();
    zip.file('agency.txt', 'agency_id,agency_name,agency_url,agency_timezone\na,Midweek Transit,https://example.test,America/Toronto\n');
    zip.file('routes.txt', 'route_id,route_short_name,route_long_name,route_type\nr1,1,Main Street,3\n');
    zip.file('stops.txt', 'stop_id,stop_name,stop_lat,stop_lon\ns1,First Stop,43.65,-79.38\ns2,Last Stop,43.66,-79.37\n');
    zip.file('calendar.txt', 'service_id,monday,tuesday,wednesday,thursday,friday,saturday,sunday,start_date,end_date\nmidweek,0,1,1,1,1,0,0,20260101,20261231\n');
    zip.file('shapes.txt', [
      'shape_id,shape_pt_lat,shape_pt_lon,shape_pt_sequence',
      'sh1,43.65,-79.38,1', 'sh1,43.655,-79.375,2', 'sh1,43.66,-79.37,3',
    ].join('\n') + '\n');
    const trips = ['route_id,service_id,trip_id,trip_headsign,direction_id,shape_id'];
    const stopTimes = ['trip_id,arrival_time,departure_time,stop_id,stop_sequence'];
    for (let i = 0; i < 6; i++) {
      const start = 8 * 60 + i * 30;
      const t = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}:00`;
      trips.push(`r1,midweek,t${i},Downtown,0,sh1`);
      stopTimes.push(`t${i},${t(start)},${t(start)},s1,1`, `t${i},${t(start + 15)},${t(start + 15)},s2,2`);
    }
    zip.file('trips.txt', trips.join('\n') + '\n');
    zip.file('stop_times.txt', stopTimes.join('\n') + '\n');

    const result = await processGtfsBuffer(await zip.generateAsync({ type: 'nodebuffer' }), undefined, { slug: 'midweek-transit' });
    const weekday = JSON.parse(result.geojson).features
      .map((f: any) => f.properties)
      .filter((p: any) => p.routeShortName === '1' && p.day === 'Weekday');
    expect(weekday.length).toBeGreaterThan(0);
    expect(weekday[0].headway).toBe(30);
  });
});
