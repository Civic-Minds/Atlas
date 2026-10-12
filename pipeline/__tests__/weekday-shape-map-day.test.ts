import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import JSZip from 'jszip';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { processGtfsBuffer } from '../process-core';

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

  it('keeps the own data of a shape that carries its day (cata-state-college VE Friday)', async () => {
    // Real cata-state-college archive (20261213), route VE (route_id 44). Mon-Thu and
    // Friday run different shapes; the Campus feature is drawn on the Friday shape
    // 17786_shp, which carries 31 of the 32 Friday trips. It keeps its own shape data:
    // reading the Mon-Thu headsign pool gave 24 at its terminal. Hand count, Wed Oct 14 and
    // Fri Oct 16 2026: every 21 in both directions on both days.
    const weekday = await weekdayFeatures('cata-ve-friday-shape', 'cata-state-college', '44');
    const campus = weekday.find((p: any) => p.headsign === 'Campus');
    expect(campus.headway).toBe(21);
    expect(campus.worstDirectionHeadway).toBe(21);
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
  });

  it('keeps TTC 35 branch headways when 35A and 35B share a displayed headsign', async () => {
    // Real TTC fresh feed (20261031), route 35, weekday service only. 35A and 35B (via
    // Hullmar) both run to Mount Dennis every 15 and show as one headsign, plus short
    // turns. A thin Mount Dennis shape must not read the headsign pool: the pool covers
    // the via-Hullmar stops the shape lacks. Without the same-stops check its headline
    // went 10 -> 17 and tier 15 -> 20.
    const weekday = await weekdayFeatures('ttc-35-branches', 'ttc', '35');
    const byKey = Object.fromEntries(weekday.map((p: any) => [`${p.directionId} ${p.headsign}`, [p.headway, p.tier]]));
    expect(byKey['0 Mount Dennis']).toEqual([10, '15']);
    // Via Hullmar is drawn on shape 1122586 (5 trips 05:03-05:44). Hand count, 35B at Mount
    // Dennis (16598), 77 weekday trips: median gap 15 over 6-22h (16 all day, 17 midday, 12-13
    // in the 5-7 AM burst). The burst's own 10 and its three-departure terminal mean (12) both
    // over-claim the branch.
    expect(byKey['0 Mount Dennis via Hullmar']).toEqual([15, '15']);
    expect(byKey['1 Pioneer Village']).toEqual([17, '20']);
    expect(byKey['1 Pioneer Village via Hullmar']).toEqual([17, '20']);
  });
});

