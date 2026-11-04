import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { loadConnectionFeed, readDateFor, runsOn } from '../connectionTimetables';

async function feed(files: Record<string, string>): Promise<Buffer> {
  const zip = new JSZip();
  for (const [name, text] of Object.entries(files)) zip.file(name, text);
  return zip.generateAsync({ type: 'nodebuffer' });
}

const BASE = {
  'stops.txt': 'stop_id,stop_name,stop_lat,stop_lon\nA,First,39.7,-105\nB,Middle,39.71,-105\nC,Last,39.72,-105\n',
  'routes.txt': 'route_id,agency_id,route_short_name,route_long_name\nR1,X,1,One\nR2,Y,2,Two\n',
  'trips.txt': 'route_id,service_id,trip_id,trip_headsign\nR1,WK,T1,North\nR2,WK,T2,Other\n',
  // Wednesday-only service, through 2026-10-24.
  'calendar.txt': 'service_id,monday,tuesday,wednesday,thursday,friday,saturday,sunday,start_date,end_date\nWK,0,0,1,0,0,0,0,20260101,20261024\n',
  'calendar_dates.txt': 'service_id,date,exception_type\nWK,20261021,2\n',
  'stop_times.txt': [
    'trip_id,arrival_time,departure_time,stop_id,stop_sequence,pickup_type,drop_off_type',
    'T1,08:00:00,08:00:00,A,1,0,0',
    'T1,,08:10:00,B,2,0,1',
    'T1,25:05:00,25:05:00,C,3,0,0',
    'T2,09:00:00,09:00:00,A,1,0,0',
    'T2,09:10:00,09:10:00,C,2,0,0',
  ].join('\n'),
};

describe('loadConnectionFeed (CIV-101)', () => {
  it('reads who can get off and on: never off at a first stop, never on at a last stop, and the drop-off flag', async () => {
    const f = await loadConnectionFeed(await feed(BASE));
    const ev = f.eventsOn('20261014', new Set(['A', 'B', 'C'])).filter(e => e.tripId === 'T1');
    expect(ev.map(e => [e.stopId, e.canAlight, e.canBoard])).toEqual([['A', false, true], ['B', false, true], ['C', true, false]]);
    // A blank arrival time falls back to the departure time; times past 24:00 stay in the service day.
    expect(ev.find(e => e.stopId === 'B')!.arrival).toBe(490);
    expect(ev.find(e => e.stopId === 'C')!.arrival).toBe(1505);
    expect([...f.boardingStopIds].sort()).toEqual(['A', 'B']);
  });

  it('reads only the exact date: a removed date and another weekday have no trips', async () => {
    const f = await loadConnectionFeed(await feed(BASE));
    expect(f.eventsOn('20261021', new Set(['A']))).toEqual([]);
    expect(f.eventsOn('20261015', new Set(['A']))).toEqual([]);
    expect(runsOn(f, '20261014')).toBe(true);
  });

  it("names a station's gates by the station, and keeps the station itself out of the stops", async () => {
    const f = await loadConnectionFeed(await feed({
      ...BASE,
      'stops.txt': 'stop_id,stop_name,stop_lat,stop_lon,location_type,parent_station\nS,Union Station,39.75,-105,1,\nA,Union Station Gate B19,39.7,-105,0,S\nB,Middle,39.71,-105,0,\nC,Last,39.72,-105,0,\n',
    }));
    expect(f.stationNames.get('S')).toBe('Union Station');
    expect(f.stops.map(s => [s.stopId, s.parentStation])).toEqual([['A', 'S'], ['B', null], ['C', null]]);
  });

  it('keeps only the configured agency in a shared zip', async () => {
    const f = await loadConnectionFeed(await feed(BASE), { agencyId: 'Y' });
    expect(new Set(f.eventsOn('20261014', new Set(['A'])).map(e => e.tripId))).toEqual(new Set(['T2']));
  });

  it('repeats a frequencies.txt trip through its window', async () => {
    const f = await loadConnectionFeed(await feed({
      ...BASE,
      'frequencies.txt': 'trip_id,start_time,end_time,headway_secs,exact_times\nT2,09:00:00,11:00:00,3600,1\n',
    }));
    expect(f.eventsOn('20261014', new Set(['A'])).filter(e => e.tripId === 'T2').map(e => e.departure)).toEqual([540, 600]);
  });
});

describe('readDateFor', () => {
  it('reads the checked date while the feed covers it', async () => {
    const f = await loadConnectionFeed(await feed(BASE));
    expect(readDateFor(f, '20261014', '20261024')).toBe('20261014');
  });

  it("reads an ended feed's last same-weekday date with service, so it can be labelled outdated", async () => {
    const f = await loadConnectionFeed(await feed(BASE));
    // 2026-11-04 is past the 2026-10-24 end; Oct 28 is after it and Oct 21 is removed, so Oct 14.
    expect(readDateFor(f, '20261104', '20261024')).toBe('20261014');
  });
});
