/**
 * NJ Transit's bus and rail feeds both number routes, trips and shapes from 1. A supplemental feed whose ids
 * collide with the main feed's fails without a configured prefix, and is clean with one (supplementalIds.ts).
 */
import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { processAgencyFeeds } from '../agencyFeeds';
import { gtfsIdSets, idCollisions, prefixGtfsIds } from '../supplementalIds';

const RAIL = 'https://example.test/rail.zip';

/** A one-line feed numbered from 1, as NJ Transit's are: route 1, trips 1..n, shape 1, own stop ids. */
async function feed(stopPrefix: string, routeType: string, name: string): Promise<Buffer> {
  const zip = new JSZip();
  zip.file('agency.txt', 'agency_id,agency_name,agency_url,agency_timezone\nnjt,NJ Transit,https://example.test,America/New_York\n');
  zip.file('routes.txt', `route_id,route_short_name,route_long_name,route_type\n1,${name},${name} Line,${routeType}\n`);
  zip.file('stops.txt', `stop_id,stop_name,stop_lat,stop_lon\n${stopPrefix}1,North,40.80,-74.10\n${stopPrefix}2,South,40.70,-74.10\n`);
  zip.file('shapes.txt', 'shape_id,shape_pt_lat,shape_pt_lon,shape_pt_sequence\n1,40.80,-74.10,1\n1,40.75,-74.10,2\n1,40.70,-74.10,3\n');
  zip.file('calendar.txt', 'service_id,monday,tuesday,wednesday,thursday,friday,saturday,sunday,start_date,end_date\nwk,1,1,1,1,1,1,1,20260101,20271231\n');
  const trips = ['route_id,service_id,trip_id,trip_headsign,direction_id,shape_id'];
  const times = ['trip_id,arrival_time,departure_time,stop_id,stop_sequence'];
  for (let i = 1, m = 360; m <= 1320; i++, m += 15) {
    const t = (x: number) => `${String(Math.floor(x / 60)).padStart(2, '0')}:${String(x % 60).padStart(2, '0')}:00`;
    trips.push(`1,wk,${i},South,0,1`);
    times.push(`${i},${t(m)},${t(m)},${stopPrefix}1,1`, `${i},${t(m + 20)},${t(m + 20)},${stopPrefix}2,2`);
  }
  zip.file('trips.txt', trips.join('\n') + '\n');
  zip.file('stop_times.txt', times.join('\n') + '\n');
  return zip.generateAsync({ type: 'nodebuffer' });
}

describe('supplemental feed ids (NJ Transit bus + rail)', () => {
  it('finds the route, trip and shape ids both feeds use', async () => {
    const collisions = idCollisions(await gtfsIdSets(await feed('b', '3', '1')), await gtfsIdSets(await feed('r', '2', 'NEC')));
    expect(collisions.map(c => c.kind)).toEqual(['route', 'trip', 'shape']);
    expect(collisions[0]).toEqual({ kind: 'route', count: 1, examples: ['1'] });
  });

  it('refuses the merge without a prefix, naming the config key', async () => {
    const bus = await feed('b', '3', '1'), rail = await feed('r', '2', 'NEC');
    await expect(processAgencyFeeds(bus, [{ url: RAIL, buf: rail }], { slug: 'njt', supplementalFeedUrls: [RAIL] }))
      .rejects.toThrow(/reuses ids of an earlier feed \(1 route ids.*supplementalIdPrefixes/);
  });

  it('with the prefix, each feed keeps its own routes and trips', async () => {
    const bus = await feed('b', '3', '1'), rail = await feed('r', '2', 'NEC');
    const out = await processAgencyFeeds(bus, [{ url: RAIL, buf: rail }], { slug: 'njt', supplementalFeedUrls: [RAIL], supplementalIdPrefixes: { [RAIL]: 'rail:' } });
    const routes = JSON.parse(out.geojson).features.filter((f: any) => f.geometry?.type !== 'Point').map((f: any) => `${f.properties.routeId} ${f.properties.routeShortName}`);
    expect(new Set(routes)).toEqual(new Set(['1 1', 'rail:1 NEC']));
    const trips = Object.keys(JSON.parse(out.tripsJson));
    expect(trips.filter(t => t.startsWith('rail:')).length).toBeGreaterThan(0);
    expect(trips.filter(t => !t.startsWith('rail:')).length).toBeGreaterThan(0);
  });

  it('legitimate: feeds with their own ids need no prefix, and the output is as before', async () => {
    const bus = await feed('b', '3', '1');
    const zip = await JSZip.loadAsync(await feed('r', '2', 'NEC'));
    for (const f of ['routes.txt', 'trips.txt', 'stop_times.txt', 'shapes.txt']) {
      const text = await zip.file(f)!.async('string');
      zip.file(f, text.split('\n').map((line, i) => (i === 0 || !line ? line : f === 'shapes.txt' ? `R${line}` : f === 'stop_times.txt' ? `R${line}` : line.replace(/^1,wk,(\d+),South,0,1$/, 'R1,wk,R$1,South,0,R1').replace(/^1,NEC/, 'R1,NEC'))).join('\n'));
    }
    const rail = await zip.generateAsync({ type: 'nodebuffer' });
    expect(idCollisions(await gtfsIdSets(bus), await gtfsIdSets(rail))).toEqual([]);
    await expect(processAgencyFeeds(bus, [{ url: RAIL, buf: rail }], { slug: 'njt', supplementalFeedUrls: [RAIL] })).resolves.toBeTruthy();
  });

  it('prefixGtfsIds prefixes route, trip and shape ids wherever the feed holds them, never stops', () => {
    const out = prefixGtfsIds({
      routes: [{ route_id: '1', route_type: '2' }], trips: [{ route_id: '1', service_id: 'wk', trip_id: '7', shape_id: '3' }],
      stopTimes: [{ trip_id: '7', stop_id: 's1' }], shapes: [{ id: '3', points: [] }], stops: [{ stop_id: 's1' }],
      frequencies: [{ trip_id: '7' }], fareRules: [{ fare_id: 'f', route_id: '1' }],
    } as never, 'rail:') as any;
    expect(out.routes[0].route_id).toBe('rail:1');
    expect(out.trips[0]).toMatchObject({ route_id: 'rail:1', trip_id: 'rail:7', shape_id: 'rail:3', service_id: 'wk' });
    expect(out.stopTimes[0]).toEqual({ trip_id: 'rail:7', stop_id: 's1' });
    expect(out.shapes[0].id).toBe('rail:3');
    expect(out.frequencies[0].trip_id).toBe('rail:7');
    expect(out.fareRules[0].route_id).toBe('rail:1');
    expect(out.stops[0].stop_id).toBe('s1');
  });
});
