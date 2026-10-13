import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { processGtfsBuffer } from '../process-core';
import { isThinAllDayTerminalSample, isUnevenTwoGapMiddayTerminalSample } from '../headway-utils';

// #733: Step 4's terminal override took a two-gap mean from the all-day fallback window.

const FIXTURES = resolve(__dirname, 'fixtures');

async function fixtureZip(name: string): Promise<Buffer> {
  const zip = new JSZip();
  const dir = resolve(FIXTURES, name);
  for (const file of readdirSync(dir)) zip.file(file, readFileSync(resolve(dir, file)));
  return zip.generateAsync({ type: 'nodebuffer' });
}

describe('Step 4 terminal override on a thin all-day sample (#733)', () => {
  it('metrolink Riverside Line to L.A. Union Station keeps the hourly 60, not 210', async () => {
    // Hand count, GTFS service 1149 (Wed 2026-10-14): 03:54, 04:54, 05:54, 06:54, 12:54 from
    // Riverside, hourly plus one midday trip, median gap 60. The last on-shape stop sees 06:09,
    // 07:09 and 13:09 inside 06:00-22:00: gaps 60 and 360, a "median" of 210.
    const result = await processGtfsBuffer(await fixtureZip('metrolink-riverside'), undefined, { slug: 'metrolink' });
    const features = JSON.parse(result.geojson).features.map((f: any) => f.properties)
      .filter((p: any) => p.stopId == null && p.day === 'Weekday');
    const toUnion = features.find((p: any) => p.headsign === 'L.A. Union Station');
    expect(toUnion).toMatchObject({ tier: 'infrequent', headway: 60 });
    for (const p of features) expect(p.worstDirectionHeadway).toBe(60);
  });

  it('flags only an all-day fallback sample with fewer than four departures', () => {
    expect(isThinAllDayTerminalSample([249, 309, 369, 429, 789])).toBe(true);   // Riverside: 3 in 06-22
    expect(isThinAllDayTerminalSample([369, 429, 489, 789])).toBe(false);       // 4 in 06-22: guard can test it
    expect(isThinAllDayTerminalSample([600, 660, 720])).toBe(false);            // midday headway exists
    expect(isThinAllDayTerminalSample([960, 1020, 1080])).toBe(false);          // PM-peak headway exists
    expect(isThinAllDayTerminalSample([249, 309, 369, 429, 789], 5)).toBe(true); // branch on 5 trips beats 3
    expect(isThinAllDayTerminalSample([373, 444, 854], 2)).toBe(false);          // mbta 439 Nahant: branch on 2 trips
  });
});

describe('Step 4 terminal override on three uneven midday departures (#745)', () => {
  const m = (h: number, min: number) => h * 60 + min;

  it('flags exactly three midday departures with uneven gaps when the branch has more trips', () => {
    // wsf 131 to Anacortes: 09:40, 13:05 and 14:45, gaps 205 and 100, a "mean" of 153.
    const anacortes = [m(9, 40), m(13, 5), m(14, 45)];
    expect(isUnevenTwoGapMiddayTerminalSample(anacortes, 7)).toBe(true);
    expect(isUnevenTwoGapMiddayTerminalSample(anacortes)).toBe(true);
  });

  it('leaves legitimate midday samples alone', () => {
    expect(isUnevenTwoGapMiddayTerminalSample([m(10, 0), m(11, 0), m(12, 0)], 8)).toBe(false);       // even hourly
    expect(isUnevenTwoGapMiddayTerminalSample([m(10, 0), m(11, 0), m(12, 20)], 8)).toBe(false);      // 60 and 80: close
    expect(isUnevenTwoGapMiddayTerminalSample([m(9, 40), m(13, 5), m(14, 45), m(14, 50)], 8)).toBe(false); // four: a real median
    expect(isUnevenTwoGapMiddayTerminalSample([m(9, 40), m(13, 5)], 8)).toBe(false);                 // two: no value at all
    expect(isUnevenTwoGapMiddayTerminalSample([m(9, 40), m(13, 5), m(14, 45)], 3)).toBe(false);      // branch no deeper than the sample
  });

  it('wsf 131 style two-stop route keeps the branch headline instead of the 153 two-gap mean', async () => {
    const hhmm = (min: number) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}:00`;
    // Direction 1 (to Anacortes): seven sailings, three of them arriving at Anacortes inside 09:00-15:00.
    const arrivals = [m(6, 40), m(8, 10), m(9, 40), m(13, 5), m(14, 45), m(17, 0), m(19, 5)];
    const stopTimes = ['trip_id,arrival_time,departure_time,stop_id,stop_sequence'];
    const trips = ['route_id,service_id,trip_id,direction_id,trip_headsign'];
    arrivals.forEach((arr, i) => {
      trips.push(`131,WK,T${i},1,Anacortes`);
      stopTimes.push(`T${i},${hhmm(arr - 60)},${hhmm(arr - 60)},LOPEZ,1`);
      stopTimes.push(`T${i},${hhmm(arr)},${hhmm(arr)},ANA,2`);
    });
    const zip = new JSZip();
    zip.file('agency.txt', 'agency_id,agency_name,agency_url,agency_timezone\nA,Test Ferry,http://x.test,America/Los_Angeles\n');
    zip.file('routes.txt', 'route_id,route_short_name,route_long_name,route_type\n131,,Anacortes - Lopez,4\n');
    zip.file('stops.txt', 'stop_id,stop_name,stop_lat,stop_lon\nANA,Anacortes,48.5,-122.68\nLOPEZ,Lopez,48.5,-122.88\n');
    zip.file('calendar.txt', 'service_id,monday,tuesday,wednesday,thursday,friday,saturday,sunday,start_date,end_date\nWK,1,1,1,1,1,0,0,20260101,20301231\n');
    zip.file('trips.txt', trips.join('\n') + '\n');
    zip.file('stop_times.txt', stopTimes.join('\n') + '\n');
    const result = await processGtfsBuffer(await zip.generateAsync({ type: 'nodebuffer' }), undefined, { slug: 'wsf-test' });
    const toAnacortes = JSON.parse(result.geojson).features.map((f: any) => f.properties)
      .find((p: any) => p.stopId == null && p.day === 'Weekday' && p.headsign === 'Anacortes');
    expect(toAnacortes).toBeDefined();
    expect(toAnacortes.headway).not.toBe(153);
  });
});
