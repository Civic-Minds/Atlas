import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { computeRawDepartures } from '../transit-phase1';
import { expandTripFrequencyOffsets, processGtfsBuffer } from '../process-core';
import { expandTripFrequencyWindows, isSingleTripFrequencyWindow } from '../transit-utils';
import type { GtfsData } from '../../types/gtfs';

const at = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));

// Winter Park TL-42, copied from the archived feed (winter-park 20501230-3fae5053bd06f777):
// three out-and-back trips a day, one frequencies.txt row each, headway_secs 3381. TL-8577's
// 90-minute window matches its 89-minute run (the #702 rule); TL-8578 and TL-8579 have
// 90-minute windows over 85-minute runs, 5 minutes of layover the #702 rule missed (#706).
// Stops TL-177..179 are visited on the way out and again on the way back.
const TL42_TRIPS: Array<{ trip: string; window: [string, string]; stops: Array<[string, string]> }> = [
  { trip: 'TL-8577', window: ['18:00:00', '19:30:00'], stops: [['TL-176', '18:00'], ['TL-175', '18:01'], ['TL-177', '18:08'], ['TL-178', '18:25'], ['TL-179', '18:37'], ['TL-180', '18:57'], ['TL-179', '19:00'], ['TL-178', '19:12'], ['TL-177', '19:29']] },
  { trip: 'TL-8578', window: ['10:15:00', '11:45:00'], stops: [['TL-176', '10:15'], ['TL-175', '10:16'], ['TL-177', '10:23'], ['TL-178', '10:40'], ['TL-179', '10:57'], ['TL-180', '11:12'], ['TL-179', '11:15'], ['TL-178', '11:25'], ['TL-177', '11:40']] },
  { trip: 'TL-8579', window: ['13:35:00', '15:05:00'], stops: [['TL-176', '13:35'], ['TL-175', '13:36'], ['TL-177', '13:43'], ['TL-178', '14:00'], ['TL-179', '14:12'], ['TL-180', '14:32'], ['TL-179', '14:35'], ['TL-178', '14:45'], ['TL-177', '15:00']] },
];
const TL42_STOPS = ['TL-175', 'TL-176', 'TL-177', 'TL-178', 'TL-179', 'TL-180'];

function winterParkGtfs(): GtfsData {
  return {
    agencies: [],
    routes: [{ route_id: 'TL-42', route_short_name: '', route_long_name: 'Granby-Grand Lake Connector Gold Line', route_type: '3' }],
    trips: TL42_TRIPS.map(t => ({ route_id: 'TL-42', service_id: 'TL-110', trip_id: t.trip, direction_id: '0', shape_id: 'TL-42' })),
    stops: TL42_STOPS.map((id, i) => ({ stop_id: id, stop_name: id, stop_lat: String(39.88 + i * 0.01), stop_lon: String(-105.76 - i * 0.01) })),
    stopTimes: TL42_TRIPS.flatMap(t => t.stops.map(([stop, time], i) => ({
      trip_id: t.trip, arrival_time: `${time}:00`, departure_time: `${time}:00`, stop_id: stop, stop_sequence: String(i + 1),
    }))),
    frequencies: TL42_TRIPS.map(t => ({ trip_id: t.trip, start_time: t.window[0], end_time: t.window[1], headway_secs: '3381' })),
    calendar: [{ service_id: 'TL-110', monday: '1', tuesday: '1', wednesday: '1', thursday: '1', friday: '1', saturday: '1', sunday: '1', start_date: '20260608', end_date: '20501230' }],
    calendarDates: [],
    shapes: [],
  } as unknown as GtfsData;
}

async function winterParkZip(): Promise<Buffer> {
  const gtfs = winterParkGtfs();
  const csv = (rows: Array<Record<string, string>>) => {
    const keys = Object.keys(rows[0]);
    return [keys.join(','), ...rows.map(row => keys.map(k => row[k]).join(','))].join('\n') + '\n';
  };
  const zip = new JSZip();
  zip.file('agency.txt', 'agency_id,agency_name,agency_url,agency_timezone\nwp,Winter Park,https://example.test,America/Denver\n');
  zip.file('routes.txt', csv(gtfs.routes as never));
  zip.file('trips.txt', csv(gtfs.trips as never));
  zip.file('stops.txt', csv(gtfs.stops as never));
  zip.file('stop_times.txt', csv(gtfs.stopTimes as never));
  zip.file('frequencies.txt', csv(gtfs.frequencies as never));
  zip.file('calendar.txt', csv(gtfs.calendar as never));
  zip.file('shapes.txt', ['shape_id,shape_pt_lat,shape_pt_lon,shape_pt_sequence', ...TL42_STOPS.map((_, i) => `TL-42,${39.88 + i * 0.01},${-105.76 - i * 0.01},${i + 1}`)].join('\n') + '\n');
  return zip.generateAsync({ type: 'nodebuffer' });
}

describe('route-level frequencies.txt expansion (#706)', () => {
  it('counts Winter Park TL-42 as its three scheduled trips on every day, not six', () => {
    const raw = computeRawDepartures(winterParkGtfs(), '20260608');
    expect(raw.map(r => r.day).sort()).toEqual(['Friday', 'Monday', 'Saturday', 'Sunday', 'Thursday', 'Tuesday', 'Wednesday']);
    for (const day of raw) {
      // Hand count from the archived feed: first-stop departures at 10:15, 13:35 and 18:00.
      expect(day.departureTimes).toEqual([at('10:15'), at('13:35'), at('18:00')]);
      expect(day.gaps).toEqual([200, 265]);
    }
  });

  it('gives TL-42 no 56-minute headway at route or stop level', async () => {
    const result = await processGtfsBuffer(await winterParkZip(), undefined, { slug: 'winter-park' });
    const features = JSON.parse(result.geojson).features.filter((f: any) => f.properties.routeId === 'TL-42');
    expect(features.map((f: any) => f.properties.day).sort()).toEqual(['Saturday', 'Sunday', 'Weekday']);
    for (const { properties } of features) {
      expect(properties.tier).toBe('infrequent');
      expect(properties.headway).toBeGreaterThan(120);
      expect(Object.values(properties.headwayByPeriod ?? {})).not.toContain(56);
      for (const hw of Object.values(properties.stopHeadways ?? {})) expect(hw).not.toBe(56);
    }
  });

  it('uses the same expansion as stop level', () => {
    for (const t of TL42_TRIPS) {
      const first = at(t.stops[0][1]);
      const span = at(t.stops[t.stops.length - 1][1]) - first;
      const windows = [{ start: at(t.window[0]), end: at(t.window[1]), headwayMinutes: 3381 / 60 }];
      expect(expandTripFrequencyOffsets(first, windows, span).map(offset => first + offset)).toEqual(expandTripFrequencyWindows(windows, span));
      expect(expandTripFrequencyWindows(windows, span)).toEqual([first]);
    }
  });

  it('does not stack overlapping rows of one trip at route level (#711)', () => {
    const gtfs = winterParkGtfs();
    gtfs.frequencies = [
      { trip_id: 'TL-8578', start_time: '07:00:00', end_time: '09:00:00', headway_secs: '600' },
      { trip_id: 'TL-8578', start_time: '07:05:00', end_time: '09:00:00', headway_secs: '600' },
    ];
    gtfs.trips = gtfs.trips.filter(t => t.trip_id === 'TL-8578');
    const monday = computeRawDepartures(gtfs, '20260608').find(r => r.day === 'Monday')!;
    expect(monday.departureTimes).toHaveLength(12);
    expect(monday.gaps.every(gap => Math.abs(gap - 10) < 1e-9)).toBe(true);
  });
});

describe('isSingleTripFrequencyWindow layover allowance (#706)', () => {
  it('treats a single-row window up to 5 minutes longer than the run as one trip', () => {
    expect(isSingleTripFrequencyWindow(90, 2, 85, 1)).toBe(true);
    expect(isSingleTripFrequencyWindow(80, 2, 75, 1)).toBe(true); // coast-rta TL-1847
    expect(isSingleTripFrequencyWindow(90, 2, 84, 1)).toBe(false);
    expect(isSingleTripFrequencyWindow(30, 3, 35, 1)).toBe(false); // window shorter than the run
    expect(isSingleTripFrequencyWindow(90, 4, 85, 1)).toBe(false);
  });

  it('keeps a real 15-minute block at the end of a multi-row template (uga 922721)', () => {
    // uga 922721, copied from the archived feed (uga 20260911): a 25-minute loop with four
    // rows. Its last row, 17:30-18:00 every 15 minutes, is 5 minutes longer than the run but
    // is real service, so it must keep both departures.
    const windows = [
      { start: at('08:00'), end: at('08:30'), headwayMinutes: 30 },
      { start: at('08:30'), end: at('10:00'), headwayMinutes: 15 },
      { start: at('10:00'), end: at('17:30'), headwayMinutes: 10 },
      { start: at('17:30'), end: at('18:00'), headwayMinutes: 15 },
    ];
    expect(isSingleTripFrequencyWindow(30, 2, 25, windows.length)).toBe(false);
    const departures = expandTripFrequencyWindows(windows, 25);
    expect(departures.slice(-2)).toEqual([at('17:30'), at('17:45')]);
    expect(departures).toHaveLength(1 + 6 + 45 + 2);
  });
});
