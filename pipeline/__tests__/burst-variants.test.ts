import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { processGtfsBuffer } from '../process-core';
import { applyAnalysisCriteria } from '../transit-phase2';
import { MAX_UNCOVERED_METERS, uncoveredMeters } from '../shapeCoverage';
import type { AnalysisResult, RawRouteDepartures } from '../../types/gtfs';

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

const ALL_COVERED = () => true;

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

  it('ttc 340: the 3-trip night burst before the regular night pattern starts stays visible', async () => {
    // Hand count: westbound night trips every 27-30 from 26:26 to 28:23 (shape 1122569), and a
    // 3-trip pattern at 25:31, 25:48, 26:04 (shape 1122570) before them. No regular trip runs in
    // the hour before the burst, so it is the only westbound service then and is not demoted.
    const captured: AnalysisResult[] = [];
    await processGtfsBuffer(await fixtureZip('ttc-340-night'), undefined, {
      slug: 'ttc',
      onAnalysisResults: results => { captured.push(...results); },
    });
    expect(captured.find(r => r.day === 'Weekday' && r.shapeId === '1122570')?.serviceClass).toBe('time-limited');
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

  it('capmetro 20 SB: evening slices after the regular shapes end stay time-limited', async () => {
    // Hand count, GTFS service 2-172 (Wed 2026-10-14), route 20 direction 1, one shape per vehicle
    // slice: 721 runs 05:04-07:44 plus one 21:37 trip (regular), 728 09:00-11:15 plus 17:45
    // (regular); 753 runs 20:02 20:47 21:07 22:22 22:37 and 757 22:07 22:52 23:07. No regular shape
    // has two departures within an hour of either evening slice, so they are the route's evening
    // service and must not be demoted.
    const captured: AnalysisResult[] = [];
    await processGtfsBuffer(await fixtureZip('capmetro-20-evening'), undefined, {
      slug: 'capmetro',
      onAnalysisResults: results => { captured.push(...results); },
    });
    const weekday = (shape: string) => captured.find(r => r.day === 'Weekday' && r.shapeId === shape);
    expect(weekday('721')?.serviceClass).toBe('regular');
    expect(weekday('753')).toMatchObject({ serviceClass: 'time-limited', tier: '60' });
    expect(weekday('757')).toMatchObject({ serviceClass: 'time-limited', tier: '60' });
  });

  it('pace 533: a morning burst on its own road is not demoted, because its regular sibling does not draw that road', async () => {
    // Hand count, GTFS service 2026-08-FX-Weekday-01, direction 1: shape 5330165 runs 06:05,
    // 06:35, 07:07 along Molitor Rd (18 stops no other 533 trip serves); the regular shape 5330167
    // runs 26 trips 07:35-22:32 on another road. The regular pattern runs within the hour, but it
    // does not draw the burst's road, so the burst is not a duplicate.
    let raw: RawRouteDepartures[] = [];
    await processGtfsBuffer(await fixtureZip('pace-533-molitor'), undefined, {
      slug: 'pace-bus',
      analysisCriteriaFn: (input: RawRouteDepartures[]) => { raw = input; return applyAnalysisCriteria(input); },
    });
    const text = readFileSync(resolve(FIXTURES, 'pace-533-molitor', 'shapes.txt'), 'utf8').trim().split('\n');
    const header = text[0].split(',');
    const col = (name: string) => header.indexOf(name);
    const rows = text.slice(1).map(line => line.split(','));
    const points = (id: string): [number, number][] => rows.filter(c => c[col('shape_id')] === id)
      .sort((x, y) => Number(x[col('shape_pt_sequence')]) - Number(y[col('shape_pt_sequence')]))
      .map(c => [Number(c[col('shape_pt_lat')]), Number(c[col('shape_pt_lon')])]);
    expect(uncoveredMeters(points('5330165'), [points('5330167')])).toBeGreaterThan(MAX_UNCOVERED_METERS);
    const covered = (shapeId: string | undefined, by: string[]) =>
      !!shapeId && uncoveredMeters(points(shapeId), by.map(points)) <= MAX_UNCOVERED_METERS;
    const burst = (results: AnalysisResult[]) => results.find(r => r.day === 'Weekday' && r.shapeId === '5330165');
    expect(burst(applyAnalysisCriteria(raw, undefined, undefined, undefined, covered))?.serviceClass).toBe('time-limited');
  });

  it('pace 533 through processGtfsBuffer (real geometry, no override): 5330165 stays time-limited', async () => {
    const captured: AnalysisResult[] = [];
    await processGtfsBuffer(await fixtureZip('pace-533-molitor'), undefined, {
      slug: 'pace-bus',
      onAnalysisResults: results => { captured.push(...results); },
    });
    expect(captured.find(r => r.day === 'Weekday' && r.shapeId === '5330165')?.serviceClass).toBe('time-limited');
  });

  it('a burst just after the regular pattern ends is the only service then and stays', () => {
    // Regular pattern every 14 until 19:00; a 3-trip burst at 19:20-19:40 has no regular
    // departure after it, so it is the route's only service in that hour and stays visible.
    const results = applyAnalysisCriteria([
      ...raw('22', every(420, 1140, 14), { headsign: 'main', shapeId: 'main' }),
      ...raw('22', [1160, 1170, 1180], { headsign: 'late', shapeId: 'late' }),
    ], undefined, undefined, undefined, ALL_COVERED);
    expect(results.find(r => r.headsign === 'late')).toMatchObject({ serviceClass: 'time-limited' });
  });

  it('a burst beside a regular pattern of the same direction becomes irregular', () => {
    const results = applyAnalysisCriteria([
      ...raw('22', every(420, 1320, 14), { headsign: 'MONDAWMIN METRO', shapeId: 'main' }),
      ...raw('22', [870, 875, 877], { headsign: 'COLD SPRING METRO', shapeId: 'short' }),
    ], undefined, undefined, undefined, ALL_COVERED);
    expect(results.find(r => r.headsign === 'COLD SPRING METRO')).toMatchObject({ tier: 'span', serviceClass: 'irregular' });
    expect(results.find(r => r.headsign === 'MONDAWMIN METRO')).toMatchObject({ tier: '15', serviceClass: 'regular' });
  });

  it('keeps a 91-minute pattern time-limited beside a regular pattern (90 minutes is the burst limit)', () => {
    const results = applyAnalysisCriteria([
      ...raw('22', every(420, 1320, 14), { headsign: 'main', shapeId: 'main' }),
      ...raw('22', [1140, 1170, 1201, 1231], { headsign: 'evening', shapeId: 'evening' }),
    ], undefined, undefined, undefined, ALL_COVERED);
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
    ], undefined, undefined, undefined, ALL_COVERED);
    const r = results.find(x => x.headsign === '4 Downtown' && x.day === 'Weekday');
    expect(r?.serviceClass).toBe('time-limited');
    expect(r?.tier).not.toBe('span');
  });

  it('one or two trips outside the daytime window are irregular only when the route has regular service', () => {
    // capmetro 322 NB shape 2561: 06:00 and 15:30, and every other 322 trip pair has its own shape,
    // so this pair is the route's only drawn feature. stl 26 d1 (06:09, 10:07) sits beside a
    // 68-trip direction.
    const alone = applyAnalysisCriteria(raw('322', [360, 930], { dir: '1', shapeId: '2561' }), undefined, undefined, undefined, ALL_COVERED);
    expect(alone.find(r => r.day === 'Weekday')).toMatchObject({ serviceClass: 'regular' });
    const beside = applyAnalysisCriteria([
      ...raw('26', every(420, 1320, 17), { dir: '0', shapeId: 'AOUT2626E1' }),
      ...raw('26', [369, 607], { dir: '1', shapeId: 'AOUT2626E5' }),
    ], undefined, undefined, undefined, ALL_COVERED);
    expect(beside.find(r => r.day === 'Weekday' && r.dir === '1')).toMatchObject({ serviceClass: 'irregular', tier: 'span' });
    // A regular pattern with no shape data cannot show the stray's road is drawn: kept.
    const noShape = applyAnalysisCriteria([
      ...raw('26', every(420, 1320, 17), { dir: '0' }),
      ...raw('26', [369, 607], { dir: '1', shapeId: 'AOUT2626E5' }),
    ], undefined, undefined, undefined, ALL_COVERED);
    expect(noShape.find(r => r.day === 'Weekday' && r.dir === '1')).toMatchObject({ serviceClass: 'regular' });
  });

  it('a burst in the other direction does not count as a sibling', () => {
    const results = applyAnalysisCriteria([
      ...raw('22', every(420, 1320, 14), { dir: '1' }),
      ...raw('22', [870, 875, 877], { dir: '0' }),
    ], undefined, undefined, undefined, ALL_COVERED);
    expect(results.find(r => r.dir === '0')).toMatchObject({ serviceClass: 'time-limited' });
  });
});
