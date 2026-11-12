import JSZip from 'jszip';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { processGtfsBuffer } from '../process-core';
import { directionStretches, stretchPeriods, type DirectionTrip } from '../tripSets';

// #1425: Niagara 45's weekday shared stretch read "every 8" at Niagara College NOTL Campus. Every 45
// trip is direction 1 (one direction of travel), split in two legs at the college: 45B runs Downtown
// to the college and ends there (the bus goes on as route 40), 45A starts there for Morrison-Dorchester,
// and an hourly trip runs through. The one-stop stretch counted 45B's arrivals as departures:
// 3 + 3 + 1 buses an hour. Riders leaving the college on 45 get 45A every 20 plus the hourly trip.
//
// Fixture N (the reported shape): stops D, F, O, C, M. B: D-C, leaves D at :00/:20/:40, reaches C at
// +11 (:11/:31/:51). A: C-M, leaves C at :05/:25/:45. X: D-F-O-C-M hourly, at C at :32. 07:00-22:00.
// Fixture L (legitimate case): a two-stop route P-Q every 10 whose every trip ends at the stretch's
// reading stop Q. Nothing departs from Q, so its arrivals stay the reading (Niagara 438 at Downtown).
// TTC 119A (a trip that runs along the stretch and ends at its reading stop) is the fixture test in tripSets.test.ts.

const RUN = new Date('2026-10-21T08:00:00');
const HEADER = 'service_id,monday,tuesday,wednesday,thursday,friday,saturday,sunday,start_date,end_date';
const clock = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}:00`;

async function feed(): Promise<Buffer> {
  const zip = new JSZip();
  zip.file('agency.txt', 'agency_id,agency_name,agency_url,agency_timezone\na,Test,https://example.test,America/Toronto\n');
  zip.file('routes.txt', 'route_id,route_short_name,route_long_name,route_type\nN,45,College,3\nL,438,Shuttle,3\n');
  const coord: Record<string, [number, number]> = {
    D: [43.159, -79.246], F: [43.170, -79.200], O: [43.190, -79.150], C: [43.141, -79.196], M: [43.100, -79.110],
    P: [43.200, -79.300], Q: [43.210, -79.280],
  };
  zip.file('stops.txt', ['stop_id,stop_name,stop_lat,stop_lon', ...Object.entries(coord).map(([id, [la, lo]]) => `${id},Stop ${id},${la},${lo}`)].join('\n') + '\n');
  const shapes = ['shape_id,shape_pt_lat,shape_pt_lon,shape_pt_sequence'];
  const shape = (id: string, stops: string[]) => stops.forEach((s, i) => shapes.push(`${id},${coord[s][0]},${coord[s][1]},${i + 1}`));
  shape('shB', ['D', 'C']); shape('shA', ['C', 'M']); shape('shX', ['D', 'F', 'O', 'C', 'M']); shape('shL', ['P', 'Q']);
  zip.file('shapes.txt', shapes.join('\n') + '\n');
  zip.file('calendar.txt', [HEADER, 'wk,1,1,1,1,1,0,0,20260101,20301231'].join('\n') + '\n');
  const trips = ['route_id,service_id,trip_id,trip_headsign,direction_id,shape_id,block_id'];
  const times = ['trip_id,arrival_time,departure_time,stop_id,stop_sequence'];
  const trip = (route: string, id: string, headsign: string, shapeId: string, block: string, visits: Array<[string, number]>) => {
    trips.push(`${route},wk,${id},${headsign},1,${shapeId},${block}`);
    visits.forEach(([stop, m], i) => times.push(`${id},${clock(m)},${clock(m)},${stop},${i + 1}`));
  };
  for (let m = 420; m < 1320; m += 20) {
    trip('N', `B${m}`, 'B-NOTL CAMPUS', 'shB', `b${m % 40}`, [['D', m], ['C', m + 11]]);
    trip('N', `A${m}`, 'A-MORRISON-DORCHESTER', 'shA', `a${m % 40}`, [['C', m + 5], ['M', m + 21]]);
  }
  for (let m = 425; m < 1320; m += 60) trip('N', `X${m}`, 'NIAGARA FALLS', 'shX', `x${m}`, [['D', m], ['F', m + 7], ['O', m + 18], ['C', m + 27], ['M', m + 39]]);
  for (let m = 420; m < 1320; m += 10) trip('L', `L${m}`, 'DOWNTOWN', 'shL', `l${m}`, [['P', m], ['Q', m + 6]]);
  zip.file('trips.txt', trips.join('\n') + '\n');
  zip.file('stop_times.txt', times.join('\n') + '\n');
  return zip.generateAsync({ type: 'nodebuffer' });
}

type Props = Record<string, any>;
const lines = (geojson: string): Props[] => JSON.parse(geojson).features.map((f: any) => f.properties).filter((p: Props) => p.stopId == null);

describe('shared stretch: trips that end at the reading stop (#1425)', () => {
  beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'], now: RUN }); });
  afterEach(() => { vi.useRealTimers(); });

  it('Niagara 45 shape: arrivals of trips ending at the college are not departures there', async () => {
    const result = await processGtfsBuffer(await feed(), undefined, { slug: 'test' });
    const rows = lines(result.geojson).filter(p => p.routeId === 'N' && p.day === 'Weekday');
    expect(rows.length).toBeGreaterThan(0);
    for (const p of rows) {
      expect(p.stretchMeta.main.refStop).toBe('C');
      // :05/:25/:32/:45 an hour (4 buses), not :05/:11/:25/:31/:32/:45/:51 (7): never every 8 or 9.
      for (const period of ['midday', 'evening'] as const) {
        expect(p.stretchPeriodHeadway[period]).toBeGreaterThanOrEqual(15);
      }
      expect(p.frequentService).not.toBe(true);
    }
  });

  it('a stretch read at a stop where every trip ends keeps those arrivals (nothing departs there)', async () => {
    const result = await processGtfsBuffer(await feed(), undefined, { slug: 'test' });
    const p = lines(result.geojson).find(row => row.routeId === 'L' && row.day === 'Weekday')!;
    expect(p.stretchMeta.main.refStop).toBe('Q');
    expect(p.stretchPeriodHeadway.midday).toBe(10);
    expect(p.stretchPeriodHeadway.evening).toBe(10);
  });
});

describe('directionStretches: final visits (#1425)', () => {
  const coord = (id: string): [number, number] | undefined => ({ s: [43.6, -79.4], t: [43.61, -79.4], u: [43.62, -79.4] } as Record<string, [number, number]>)[id];
  it('drops trips that only arrive at the stretch where other trips leave from it, and keeps them where no trip leaves', () => {
    const mixed: DirectionTrip[] = [];
    for (let m = 540; m < 900; m += 20) {
      mixed.push({ tripId: `in${m}`, visits: [{ stopId: 's', minutes: m }, { stopId: 't', minutes: m + 6, final: true }] });
      mixed.push({ tripId: `out${m}`, visits: [{ stopId: 't', minutes: m + 10 }, { stopId: 'u', minutes: m + 16, final: true }] });
    }
    const d = directionStretches('k', mixed, coord);
    expect(d.main!.refStop).toBe('t');
    expect(d.main!.times.every(m => (m - 550) % 20 === 0)).toBe(true);
    expect(d.main!.tripCount).toBe(18);

    // Every trip ends at the reading stop and nothing leaves from it: the arrivals stay (Niagara 438, GRT 55).
    const ending = mixed.filter(t => t.tripId.startsWith('in'));
    const e = directionStretches('k', ending, coord);
    expect(e.main!.refStop).toBe('t');
    expect(e.main!.tripCount).toBe(18);
  });

  it('keeps a trip that runs along the stretch and ends at its reading stop (TTC 119A at 10470)', () => {
    // A: s-t, ends at t. B: s-t-u, through. Both every 20, offset 10: the stretch s-t is read at t.
    const trips: DirectionTrip[] = [];
    for (let m = 540; m < 900; m += 20) {
      trips.push({ tripId: `a${m}`, visits: [{ stopId: 's', minutes: m }, { stopId: 't', minutes: m + 6, final: true }] });
      trips.push({ tripId: `b${m}`, visits: [{ stopId: 's', minutes: m + 10 }, { stopId: 't', minutes: m + 16 }, { stopId: 'u', minutes: m + 22, final: true }] });
    }
    const d = directionStretches('k', trips, coord);
    expect(d.main!.stops).toEqual(['s', 't']);
    expect(d.main!.refStop).toBe('t');
    expect(d.main!.tripCount).toBe(36);
  });

  it('keeps the arrivals where leaving them out would read a period more frequent (GO 33 at 00296, #1432)', () => {
    // GO 33 weekdays at Mount Pleasant: 33F ends there, 33B and the through trips leave. Without the 15:31
    // arrival the PM keeps 15:40, 18:18, 18:58: three departures the settled test calls steady, which can
    // let a tail hand over (#1072), so the stretch keeps its reading (158).
    const m = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));
    const leave = '05:10 05:30 05:50 06:05 06:18 06:35 06:50 06:58 07:10 07:25 07:52 08:47 09:15 09:45 10:45 11:45 12:45 13:40 14:40 15:40 18:18 18:58 19:45 20:45 21:45 22:38'.split(' ');
    const end = '10:31 12:31 14:31 15:31 19:31 20:31 21:31'.split(' ');
    const trips: DirectionTrip[] = [
      ...leave.map(t => ({ tripId: `out${t}`, visits: [{ stopId: 't', minutes: m(t) }, { stopId: 'u', minutes: m(t) + 20, final: true }] })),
      ...end.map(t => ({ tripId: `in${t}`, visits: [{ stopId: 's', minutes: m(t) - 20 }, { stopId: 't', minutes: m(t), final: true }] })),
    ];
    const d = directionStretches('k', trips, coord);
    expect(d.main!.refStop).toBe('t');
    expect(d.main!.times).toContain(m('15:31'));
    expect(stretchPeriods(d.main!).pmPeak.value).toBe(158);
  });
});
