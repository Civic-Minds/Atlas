import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { processGtfsBuffer } from '../process-core';

async function fixtureZip(name: string): Promise<Buffer> {
  const dir = resolve(__dirname, 'fixtures', name);
  const zip = new JSZip();
  for (const file of readdirSync(dir)) zip.file(file, readFileSync(resolve(dir, file)));
  return zip.generateAsync({ type: 'nodebuffer' });
}

async function weekday(name: string, slug: string): Promise<Array<[number, string, number | null]>> {
  const result = await processGtfsBuffer(await fixtureZip(name), undefined, { slug });
  return JSON.parse(result.geojson).features
    .map((feature: any) => feature.properties)
    .filter((p: any) => p.day === 'Weekday' && p.stopId == null && p.headway != null)
    .map((p: any) => [p.directionId, p.headsign, p.headway] as [number, string, number | null])
    .sort((a: any, b: any) => a[0] - b[0] || String(a[1]).localeCompare(String(b[1])));
}

async function weekdayProps(name: string, slug: string, headsign: string): Promise<any> {
  const result = await processGtfsBuffer(await fixtureZip(name), undefined, { slug });
  return JSON.parse(result.geojson).features.map((feature: any) => feature.properties)
    .find((p: any) => p.day === 'Weekday' && p.stopId == null && p.headsign === headsign);
}

// #771: a headline or period read from the destination pool (#690) is never better than the
// worst drawn stop's value. Same-path variants read the whole service; a stop only one variant
// serves keeps that variant's service.
describe('headline when a destination is split over several shapes', () => {
  it('Brandon 23: two shapes with the same stops at :00 and :30 read every 30, not 60', async () => {
    // Real Brandon feed (2026-10-05 to 12-27), route 23 weekday services 66bdea5d/7f8a98ef.
    // Shape 116c74 runs on the hour, 8fbf61 on the half hour; both serve the same 36 stops.
    const p = await weekdayProps('brandon-23-interleaved', 'brandon', 'Downtown Terminal (Return)');
    expect(p.headway).toBe(30);
    expect(p.headwayByPeriod.midday).toBe(29);
  });

  it('MTA Maryland Silver to Curtis Bay: the Morgan State stops keep their own evening, not the combined 20', async () => {
    // Real MTA Maryland feed (service 2251, 2026-08-23 to 2027-02-06). Morgan State shape 172172
    // (59 stops, 10 its own) and the Hopkins shape 172171 (51 stops) share 49 stops; each runs
    // about every 40 in the evening (Morgan 18:47 19:21 20:01 20:41 21:21). Before: evening 20.
    const p = await weekdayProps('mta-maryland-silver-split', 'mta-maryland', 'CURTIS BAY');
    expect(p.headwayByPeriod.evening).toBeGreaterThanOrEqual(40);
    expect(p.headway).toBe(31);
    // The floored evening is the worst Morgan State stop's own reading, companions included:
    // its coverage, max gap and sustained flag describe the 43 shown, not the terminal pool's.
    const worst = '3656';
    expect(p.headwayByPeriod.evening).toBe(p.stopPeriodHeadways[worst].evening);
    expect(p.periodCoverageHeadway.evening).toBe(p.stopPeriodCoverageHeadways[worst].evening);
    expect(p.maxGapByPeriod.evening).toBe(56);
    expect(p.headwayByPeriodSustained.evening).toBe(true);
  });

  it('TTC 96B: a pooled stop whose pool publishes nothing does not count its thin own value', async () => {
    // Real TTC feed, route 96 eastbound weekday (fixture of #772). 96B is drawn on a 9-trip early
    // shape; where the pooled reading publishes nothing those stops fall back to its own AM
    // gaps (26), which are not the stops' service. The headline stays 17 and the AM peak 12.
    const p = await weekdayProps('ttc-96-weekday-east', 'ttc', 'York Mills via Martin Grove and Westhumber');
    expect(p.headway).toBe(17);
    expect(p.headwayByPeriod.amPeak).toBe(12);
  });
})

// #771: Step 4 read the headline from the drawn shape's trips only.
describe('terminal headline when a branch is split over many shape IDs', () => {
  it('Freedom M to Pittsburgh: a 3-trip shape of a 10-trip branch reads the branch, not 248', async () => {
    // Real Freedom Transit feed, route M, the Wed 2026-10-14 services; shapes thinned to every
    // 10th point. Toward Pittsburgh, 10 trips run on 6 shape IDs that all reach stop 835235;
    // the drawn 22-stop shape (595_shp) has 3 of them (08:30, 15:30, 16:45). Hand count at the
    // first stop: 04:55 05:45 06:45 08:30 09:30 12:15 13:20 14:20 15:30 16:45. Midday is 9:30,
    // 12:15, 13:20, 14:20 (gaps 165, 65, 60): the pooled reading is never better than the mean
    // gap, 98. Every drawn stop is served by all 10 trips, so no stop lowers it; the drawn
    // terminal's own 3 trips (248) are not counted, the terminal reads the pool.
    expect(await weekday('freedom-m-split-shapes', 'freedom-transit')).toEqual([
      [0, 'Washington', 62],
      [1, 'Pittsburgh', 98],
    ]);
  });

  it('TriMet 35: two alternating hourly shapes with their own stops each read every 60', async () => {
    // Real TriMet feed, route 35, the Wed 2026-10-14 services. Toward Oregon City, shapes
    // 644382 (16 trips, 84 stops) and 644381 (18 trips, 87 stops) alternate hourly; together
    // every 30. Each carries about half the trips, like HSR 01 King's two branches (93 of 151,
    // see shared-stretch.test.ts) and TTC 35A/B, so each keeps its own branch headline; the
    // shared stretch shows the combined service. The about 11 stops each shape serves alone get
    // every 60, so the pooled headline (30) never stands.
    expect(await weekday('trimet-35-alternating-shapes', 'trimet')).toEqual([
      [0, 'Oregon City Transit Center', 60],
      [0, 'SW 5th & Alder', 1140],
      [1, 'N Portsmouth & Willamette', 60],
    ]);
  });
});
