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
});

