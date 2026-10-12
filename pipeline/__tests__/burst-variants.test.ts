import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { processGtfsBuffer } from '../process-core';
import { applyAnalysisCriteria } from '../transit-phase2';
import type { RawRouteDepartures } from '../../types/gtfs';

// #732: short-turn and burst variants with a handful of trips packed into a few minutes were
// time-limited with a frequency tier from their in-burst gaps, and the route's best tier and the
// worst-direction value picked them up. Fixtures are the real routes, cut to Wednesday 2026-10-14
// service from the current feeds.

const FIXTURES = resolve(__dirname, 'fixtures');

async function fixtureZip(name: string): Promise<Buffer> {
  const zip = new JSZip();
  const dir = resolve(FIXTURES, name);
  for (const file of readdirSync(dir)) zip.file(file, readFileSync(resolve(dir, file)));
  return zip.generateAsync({ type: 'nodebuffer' });
}

async function weekdayRoutes(name: string, slug: string): Promise<any[]> {
  const result = await processGtfsBuffer(await fixtureZip(name), undefined, { slug });
  return JSON.parse(result.geojson).features
    .map((f: any) => f.properties)
    .filter((p: any) => p.stopId == null && p.day === 'Weekday');
}

// One pattern on all five weekdays, so the weekday rollup is a full-week route.
function raw(route: string, departureTimes: number[], extra: Partial<RawRouteDepartures> = {}): RawRouteDepartures[] {
  return (['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'] as const).map(day => ({
    route, dir: '0', day, routeType: '3', modeName: 'Bus', gaps: [],
    serviceSpan: { start: departureTimes[0], end: departureTimes[departureTimes.length - 1] },
    tripCount: departureTimes.length, serviceIds: ['1'], warnings: [], departureTimes, ...extra,
  }));
}

const every = (from: number, to: number, step: number) => {
  const out: number[] = [];
  for (let t = from; t <= to; t += step) out.push(t);
  return out;
};

describe('short-turn and burst variants (#732)', () => {
  it('mbta 455: the 4-trip Wonderland variant (04:45-05:35) is irregular; the main pattern keeps tier 60', async () => {
    // Hand count, GTFS Wed 2026-10-14: Wonderland 04:45 05:00 05:15 05:35 (4 trips, every 15-20 for
    // 50 min). Wonderland via Central Square: 39 trips 05:00-24:30, median gap 30, tier 60.
    const routes = await weekdayRoutes('mbta-455-wonderland', 'mbta');
    const variant = routes.find(p => p.headsign === 'Wonderland');
    const main = routes.find(p => p.headsign === 'Wonderland via Central Square');
    expect(variant).toMatchObject({ tier: 'span', serviceClass: 'irregular', headway: null });
    expect(main).toMatchObject({ tier: '60', serviceClass: 'regular' });
    expect(main.headway).toBe(29);
    for (const p of routes) expect(p.worstDirectionHeadway).toBe(29);
  });

  it('ttc 340: the 3-trip night burst (25:31-26:04) no longer sets tier 20 for the westbound', async () => {
    // Hand count: westbound night trips every 27-30 from 26:26 to 28:23 (shape 1122569), plus a
    // 3-trip pattern at 25:31, 25:48, 26:04 (shape 1122570) that read as tier 20, headway 17.
    const west = (await weekdayRoutes('ttc-340-night', 'ttc')).filter(p => p.directionId === 1);
    expect(west.length).toBeGreaterThan(0);
    for (const p of west) {
      expect(p.tier).not.toBe('20');
      expect(p.headway === null || p.headway >= 27).toBe(true);
    }
  });

  it('stl AOUT2626E: a synthesized 2-trip direction (06:09, 10:07) is irregular and leaves the route median alone', async () => {
    // Hand count: Terminus Montmorency, 68 trips 04:47-25:01, median 17. The synthesized second
    // direction has two trips; it read as regular with headway 238 and worst-direction 238.
    const routes = await weekdayRoutes('stl-aout2626e', 'stl');
    const twoTrip = routes.find(p => p.directionId === 1);
    const main = routes.find(p => p.directionId === 0);
    expect(twoTrip).toMatchObject({ tier: 'span', serviceClass: 'irregular', headway: null });
    expect(main).toMatchObject({ tier: '60', serviceClass: 'regular', headway: 20 });
    expect(main.worstDirectionHeadway).toBe(20);
  });

  it('bursts beside only time-limited slices keep their class (capmetro 310: one shape per 60-120 minutes)', () => {
    // capmetro 310 WB: shapes 1974 (08:00 08:30 09:00), 1975 (09:30 10:00 10:30) and so on, every 30
    // all day but one shape per slice; a 120-minute slice is not a regular all-day pattern.
    const results = applyAnalysisCriteria([
      ...raw('310', [480, 510, 540], { shapeId: '1974' }),
      ...raw('310', [570, 600, 630], { shapeId: '1975' }),
      ...raw('310', [660, 690, 720, 750, 780], { shapeId: 'long-slice' }),
    ]);
    for (const r of results.filter(x => x.day === 'Weekday')) expect(r).toMatchObject({ tier: '30', serviceClass: 'time-limited' });
  });

  it('a burst beside a regular pattern of the same direction becomes irregular', () => {
    const results = applyAnalysisCriteria([
      ...raw('22', every(420, 1320, 14), { headsign: 'MONDAWMIN METRO', shapeId: 'main' }),
      ...raw('22', [870, 875, 877], { headsign: 'COLD SPRING METRO', shapeId: 'short' }),
    ]);
    expect(results.find(r => r.headsign === 'COLD SPRING METRO')).toMatchObject({ tier: 'span', serviceClass: 'irregular' });
    expect(results.find(r => r.headsign === 'MONDAWMIN METRO')).toMatchObject({ tier: '15', serviceClass: 'regular' });
  });

  it('keeps a 91-minute pattern time-limited beside a regular pattern (90 minutes is the burst limit)', () => {
    const results = applyAnalysisCriteria([
      ...raw('22', every(420, 1320, 14), { headsign: 'main', shapeId: 'main' }),
      ...raw('22', [1140, 1170, 1201, 1231], { headsign: 'evening', shapeId: 'evening' }),
    ]);
    // Gaps 30, 31, 30: the 31 is a grace violation at tier 30, so the tier is 60.
    expect(results.find(r => r.headsign === 'evening')).toMatchObject({ tier: '60', serviceClass: 'time-limited' });
  });

  it('a pattern that is a burst on one weekday only keeps its class from the other days (translink 4 Downtown)', () => {
    // translink 6614 shape 321165: 13 trips 19:38-23:49 Monday to Thursday, only 19:38, 19:58 and
    // 20:18 on Friday, beside the route's all-day pattern.
    const evening = [1178, 1198, 1218, 1238, 1258, 1278, 1300, 1320, 1340, 1362, 1382, 1400, 1429];
    const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'] as const;
    const results = applyAnalysisCriteria([
      ...raw('6614', every(420, 1320, 10), { headsign: 'main', shapeId: 'main' }),
      ...days.map(day => ({ ...raw('6614', day === 'Friday' ? evening.slice(0, 3) : evening, { headsign: '4 Downtown', shapeId: '321165' })[0], day })),
    ]);
    const r = results.find(x => x.headsign === '4 Downtown' && x.day === 'Weekday');
    expect(r?.serviceClass).toBe('time-limited');
    expect(r?.tier).not.toBe('span');
  });

  it('a burst in the other direction does not count as a sibling', () => {
    const results = applyAnalysisCriteria([
      ...raw('22', every(420, 1320, 14), { dir: '1' }),
      ...raw('22', [870, 875, 877], { dir: '0' }),
    ]);
    expect(results.find(r => r.dir === '0')).toMatchObject({ serviceClass: 'time-limited' });
  });
});
