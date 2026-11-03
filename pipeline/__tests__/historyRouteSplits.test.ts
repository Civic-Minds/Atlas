import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { parseCsv } from '../parseGtfs.js';
import { splitLumpedRoutes } from '../historyRouteSplits.js';

async function feed(stopTimes: string): Promise<Buffer> {
  const zip = new JSZip();
  zip.file('routes.txt', 'route_id,route_short_name,route_type\n16-1,16/316,3\n20-1,20,3\n');
  zip.file('trips.txt', 'route_id,service_id,trip_id\n16-1,wk,a\n16-1,wk,b\n16-1,wk,c\n20-1,wk,d\n');
  zip.file('stop_times.txt', stopTimes);
  return zip.generateAsync({ type: 'nodebuffer' });
}

async function read(buf: Buffer, name: string) {
  return parseCsv<Record<string, string>>(await (await JSZip.loadAsync(buf)).file(name)!.async('string'));
}

describe('splitLumpedRoutes (CIV-436)', () => {
  it("gives each trip of a lumped route its own route from the stop_headsign's route number", async () => {
    const buf = await feed([
      'trip_id,arrival_time,departure_time,stop_id,stop_sequence,stop_headsign',
      'a,08:00:00,08:00:00,s1,1,16 - Downtown LA', 'a,08:10:00,08:10:00,s2,2,16 - Downtown LA',
      'b,08:05:00,08:05:00,s1,1,316 - Downtown LA', 'b,08:15:00,08:15:00,s2,2,316 - Downtown LA',
      'c,08:20:00,08:20:00,s1,1,', 'c,08:30:00,08:30:00,s2,2,',
      'd,08:00:00,08:00:00,s3,1,20 - Santa Monica',
    ].join('\n'));
    const { buf: out, report } = await splitLumpedRoutes(buf, ['16/316']);
    expect(report).toEqual({ moved: { '16/316': { '16': 1, '316': 1 } }, unsplit: { '16/316': 1 } });
    const routes = await read(out, 'routes.txt');
    expect(routes.map(r => [r.route_id, r.route_short_name])).toEqual([['16-1', '16/316'], ['20-1', '20'], ['16-1__16', '16'], ['16-1__316', '316']]);
    const trips = await read(out, 'trips.txt');
    expect(trips.map(t => [t.trip_id, t.route_id])).toEqual([['a', '16-1__16'], ['b', '16-1__316'], ['c', '16-1'], ['d', '20-1']]);
  });

  it('ignores a number that is not one of the lumped routes, and leaves a feed without the key unchanged', async () => {
    const buf = await feed('trip_id,arrival_time,departure_time,stop_id,stop_sequence,stop_headsign\na,08:00:00,08:00:00,s1,1,17 - Downtown LA\n');
    const split = await splitLumpedRoutes(buf, ['16/316']);
    expect(split.report).toEqual({ moved: {}, unsplit: { '16/316': 3 } });
    expect((await splitLumpedRoutes(buf, ['16/17'])).buf).toBe(buf);
  });
});
