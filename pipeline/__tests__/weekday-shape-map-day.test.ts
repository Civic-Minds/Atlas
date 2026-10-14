import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import JSZip from 'jszip';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { processGtfsBuffer, scopedTerminalHeadline } from '../process-core';

// CapMetro 550 MetroRail (real feed, archive 20270109; route 550 only, shapes thinned to
// every 25th point). The feed gives every service its own shapes: Mon-Thu runs on service
// 22-172, Friday on 20-172, and no shape is shared. Friday-only shapes still get a Weekday
// rollup and won feature deduplication (NB 336 from 3 Friday trips, SB 239). Since the
// weekday union (#595) each of those shapes also has a Weekday stop map holding only its
// Friday trips, so Step 4 kept 336 (no stop headway from 3 trips) and set SB to 240 from 5
// Friday departures. Before #595 those features read the Mon-Thu headsign pool.
// Hand count, Wed Nov 4 2026 (22-172): SB 17 trips, median gap 45, midday 56.5 at the
// first stop; NB 20 trips, median gap 34.
async function fixtureZip(name = 'capmetro-550-friday-shapes'): Promise<Buffer> {
  const dir = resolve(__dirname, 'fixtures', name);
  const zip = new JSZip();
  for (const file of readdirSync(dir)) zip.file(file, readFileSync(resolve(dir, file)));
  return zip.generateAsync({ type: 'nodebuffer' });
}

async function weekdayFeatures(name: string, slug: string, route: string): Promise<any[]> {
  const result = await processGtfsBuffer(await fixtureZip(name), undefined, { slug });
  return JSON.parse(result.geojson).features
    .map((feature: any) => feature.properties)
    .filter((p: any) => p.routeId === route && p.day === 'Weekday' && p.stopId == null);
}

describe('Weekday shape maps on a non-representative weekday', () => {
  beforeAll(() => {
    vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-10-11T12:00:00') });
  });
  afterAll(() => {
    vi.useRealTimers();
  });

  it('reads capmetro 550 weekday headways from the Mon-Thu timetable, not Friday-only shapes', async () => {
    const result = await processGtfsBuffer(await fixtureZip(), undefined, { slug: 'capmetro' });
    const weekday = JSON.parse(result.geojson).features
      .map((feature: any) => feature.properties)
      .filter((p: any) => p.routeId === '550' && p.day === 'Weekday' && p.stopId == null);
    const sb = weekday.find((p: any) => p.headsign === 'Downtown Station SB');
    const nb = weekday.find((p: any) => p.headsign === 'Leander Station NB');
    expect(sb.headway).toBe(54);
    expect(sb.headwayByPeriod.midday).toBe(54);
    expect(nb.headway).toBe(34);
    expect(sb.worstDirectionHeadway).toBe(54);
    // Tier follows the hand count: no 30-minute weekday service in either direction.
    expect(sb.tier).toBe('infrequent');
    expect(nb.tier).toBe('infrequent');
  });

  it('draws the representative weekday\'s shape, so line and stop data agree (cata-state-college VE, #716)', async () => {
    // Real cata-state-college archive (20261213), route VE (route_id 44). Mon-Thu and
    // Friday run different shape ids for Campus: 17779_shp (30 trips Mon-Thu) and 17786_shp
    // (31 Friday trips). The representative weekday is Monday, so the Campus feature is
    // drawn on 17779_shp and its headway and stop data come from the same Mon-Thu service
    // (midday every 24). Before #716 the Friday shape won the slot and showed 21.
    const weekday = await weekdayFeatures('cata-ve-friday-shape', 'cata-state-college', '44');
    const campus = weekday.find((p: any) => p.headsign === 'Campus');
    expect(campus.headway).toBe(24);
    expect(campus.headwayByPeriod.midday).toBe(24);
    expect(campus.worstDirectionHeadway).toBe(24);
  });

  it('keeps the own data of a shape that runs every weekday (TTC 20, shape Monday, route Tuesday)', async () => {
    // Real TTC fresh feed (20261031), route 20. Shape 1122210 runs 62 trips every weekday
    // and its tie-break picks Monday, while the direction (62 Mon, 63 Tue-Fri) picks Tuesday.
    // The shape runs on Tuesday, so its own map is kept.
    const weekday = await weekdayFeatures('ttc-20-shape-monday-group-tuesday', 'ttc', '20');
    const kennedy = weekday.find((p: any) => p.directionId === 0);
    expect(kennedy.headway).toBe(20);
    expect(kennedy.headwayByPeriod.midday).toBe(20);
    expect(kennedy.periodCoverageHeadway.midday).toBe(23);
  });

  it('reads capmetro 550 SB on the fresh feed from the Downtown pool, not a 5-trip shape', async () => {
    // Real CapMetro fresh feed (20270109), route 550 only, shapes thinned. Mon-Thu SB has
    // 16 Downtown trips on 8 shapes; the headline shape 4610 has 5 (05:41-14:30) and no stop
    // headway, so its phase-2 value 222 stayed. Hand count, Wed Oct 14 2026 (21-172): 16
    // trips, median gap 47; first-stop midday (9-15) median 56.5. The terminal midday is 54.
    const weekday = await weekdayFeatures('capmetro-550-fresh-per-trip-shapes', 'capmetro', '550');
    const sb = weekday.find((p: any) => p.headsign === 'Downtown Station SB');
    const nb = weekday.find((p: any) => p.headsign === 'Leander Station NB');
    expect(sb.headway).toBe(54);
    expect(sb.headwayByPeriod.midday).toBe(54);
    expect(sb.tier).toBe('infrequent');
    expect(nb.headway).toBe(34);
    expect(sb.worstDirectionHeadway).toBe(54);
  });

  it('leaves TTC night routes 354 and 395 on their own shape data', async () => {
    // Real TTC fresh feed (20261031), routes 354 and 395. Their trips are pieces of one
    // night pattern on several shapes, but the headsign pool has no daytime service, so the
    // night headline stays every 30 (a pooled pre-dawn cluster read 10).
    const result = await processGtfsBuffer(await fixtureZip('ttc-354-395-night'), undefined, { slug: 'ttc' });
    const weekday = JSON.parse(result.geojson).features
      .map((feature: any) => feature.properties)
      .filter((p: any) => p.day === 'Weekday' && p.stopId == null && p.headway != null);
    const byKey = Object.fromEntries(weekday.map((p: any) => [`${p.routeShortName} ${p.directionId} ${p.headsign}`, p.headway]));
    expect(byKey).toEqual({
      '354 0 Starspray': 30,
      '354 1 Yonge': 30,
      '395 0 Port Union': 30,
      '395 0 Rouge Hill GO': 30,
      '395 1 York Mills Station': 30,
    });
    // A night route's stops have no daytime reading to be limited: no segment of its lines is
    // drawn as limited service (#810), whatever few early trips fall in the 6-22h window.
    for (const p of weekday) expect((p.segments ?? []).map((g: any) => g.tier)).not.toContain('span');
  });

  it('keeps TTC 35 branch headways when 35A and 35B share a displayed headsign', async () => {
    // Real TTC fresh feed (20261031), route 35, weekday service only. 35A and 35B (via
    // Hullmar) both run to Mount Dennis every 15 and show as one headsign, plus short
    // turns. A thin Mount Dennis shape must not read the headsign pool: the pool covers
    // the via-Hullmar stops the shape lacks. Without the same-stops check its headline
    // went 10 -> 17 and tier 15 -> 20.
    const weekday = await weekdayFeatures('ttc-35-branches', 'ttc', '35');
    const byKey = Object.fromEntries(weekday.map((p: any) => [`${p.directionId} ${p.headsign}`, [p.headway, p.tier]]));
    // Hand count at Mount Dennis (16598): 35A, 79 weekday trips, median gap 15 over 6-22h, 16
    // all day, 17 midday; 35B (via Hullmar), 77 trips, the same 15 / 16 / 17. Each branch's
    // all-day shape now holds its slot over the thin pre-dawn shapes (1122587, 4 trips 05:12-05:41;
    // 1122586, 5 trips 05:03-05:44), so the headline is the branch's own midday 17 and every
    // daytime period and hour is filled. Before #746's dedupe rule the pre-dawn shapes won and
    // read 15 from the 6-22h scoped sample, with the daytime periods null.
    expect(byKey['0 Mount Dennis']).toEqual([17, '20']);
    expect(byKey['0 Mount Dennis via Hullmar']).toEqual([17, '20']);
    expect(byKey['1 Pioneer Village']).toEqual([17, '20']);
    expect(byKey['1 Pioneer Village via Hullmar']).toEqual([17, '20']);
  });

  it('reads only the branch at a last stop where two branches converge (TTC 94 Castle Frank)', async () => {
    // Real TTC fresh feed (20261031), route 94, Saturday and Sunday. Eastbound runs from
    // Ossington (26 stops) and from Wellesley Station (the last 11), one headsign to Castle
    // Frank. The feature was drawn on the late-night Ossington shape 1123435 (7 trips). Hand count,
    // Sat Oct 17 / Sun Oct 18: Ossington trips every 19-20 at Castle Frank, both patterns
    // together every 10. The headline is the branch, not the pooled terminal. Since the #746
    // dedupe rule an all-day Ossington shape holds the slot over the late-night one, so Sunday
    // reads the branch's 19 (tier 20) instead of 20 (tier 30) from the scoped sample. #690's
    // pool adds nothing at Castle Frank in the window, so it reads as the own pattern (#813).
    const result = await processGtfsBuffer(await fixtureZip('ttc-94-converging'), undefined, { slug: 'ttc' });
    const castleFrank = JSON.parse(result.geojson).features
      .map((feature: any) => feature.properties)
      .filter((p: any) => p.routeId === '94' && p.directionId === 0 && p.stopId == null)
      .map((p: any) => [p.day, p.headway, p.tier]);
    expect(castleFrank).toEqual([['Saturday', 19, '20'], ['Sunday', 19, '20']]);
  });
});

describe('scopedTerminalHeadline', () => {
  it('grades capmetro 2 from its headsign terminal sample, not one per-trip shape', () => {
    // Real CapMetro fresh feed (archive 20270109), route 2 KB, Wed 2026-10-14 (2-172): arrivals of
    // all 60 trips at Eastside Bus Plaza Bay H (6448). CapMetro gives every few trips their own
    // shape; the drawn one (4 trips, gaps 32/80/32) graded "infrequent" under a 16 headline.
    // Hand count: median gap 16 all day and midday, 17 PM, 30-minute gaps at the first trips and
    // late evening. Phase 2 on the whole headsign (one shape) grades it 30.
    const times = [352, 382, 412, 443, 459, 475, 491, 507, 523, 539, 555, 571, 587, 600, 616, 632,
      650, 666, 682, 698, 714, 730, 746, 762, 778, 794, 810, 826, 842, 858, 874, 890, 906, 922, 938,
      962, 979, 996, 1013, 1032, 1049, 1066, 1083, 1100, 1117, 1134, 1139, 1159, 1179, 1199, 1219,
      1239, 1269, 1299, 1329, 1359, 1389, 1419, 1449, 1479];
    expect(scopedTerminalHeadline(times, 'Weekday', '3', false)).toEqual({ headway: 16, tier: '30' });
    // Rail keeps phase 2's midday-window grade.
    expect(scopedTerminalHeadline(times, 'Weekday', '2', true)).toEqual({ headway: 16, tier: null });
    // No midday or PM-peak service: no scoped value (night routes' early trips).
    expect(scopedTerminalHeadline([300, 310, 320, 330], 'Weekday', '3', false)).toBeNull();
    // A burst of its own is not all-day service either (cta 82 Homan & Congress PM short turns).
    expect(scopedTerminalHeadline([960, 968, 976], 'Weekday', '3', false)).toBeNull();
    expect(scopedTerminalHeadline([960, 968, 976, 984, 992], 'Weekday', '3', false)).toBeNull();
  });
});
